/**
 * Admin AI Assistant engine — parse → search/insights → reply + navigate.
 * Only opens existing dashboard destinations.
 */
import { adminRoutes } from '@/constants/adminRoutes';
import { parseAdminAiIntent } from '@/services/adminAiAssistant/adminAiIntents';
import { buildAdminAiInsights } from '@/services/adminAiAssistant/adminAiInsights';
import {
  searchAdminDrivers,
  searchAdminOrders,
  searchAdminRestaurants,
  searchAdminUsers,
} from '@/services/adminAiAssistant/adminAiSearch';
import type {
  AdminAiEntityCard,
  AdminAiMessage,
  AdminAiNavigateAction,
} from '@/types/adminAiAssistant';

export type AdminAiEngineResult = {
  content: string;
  entities: AdminAiEntityCard[];
  navigate: AdminAiNavigateAction | null;
  suggestions?: string[];
  /** Auto-navigate when a single clear destination exists. */
  autoNavigate: boolean;
};

async function animateReply(
  fullText: string,
  onToken: (token: string) => void,
): Promise<void> {
  const chunkSize = 4;
  for (let i = 0; i < fullText.length; i += chunkSize) {
    onToken(fullText.slice(i, i + chunkSize));
    await new Promise((r) => setTimeout(r, 10));
  }
}

function needsMoreInput(kind: string, query: string | null): string | null {
  if (query) return null;
  switch (kind) {
    case 'search_user':
      return 'Tell me the customer name, email, phone, or user ID and I’ll open their profile.';
    case 'search_driver':
      return 'Which driver? Share a name or driver ID.';
    case 'search_restaurant':
      return 'Which restaurant? Share the restaurant name.';
    case 'search_order':
      return 'Paste the Order ID (or #ID) and I’ll open it with live status.';
    case 'search_email':
      return 'Paste the email address to search.';
    case 'search_phone':
      return 'Paste the phone number to search.';
    default:
      return null;
  }
}

const HELP_TEXT = [
  'I can help you operate HalfOrder without leaving Admin.',
  '',
  'Try things like:',
  '• Find user Ahmed',
  '• Open Orders / Show today’s orders',
  '• Find order #12345',
  '• Where is driver Alex?',
  '• Open Restaurant Pizzaro',
  '• Payment summary / Show failed payments',
  '• Open Support Inbox',
  '• Send announcement',
  '• How many new users today?',
  '',
  'I’ll navigate to the right dashboard screen and surface matching records.',
].join('\n');

export async function runAdminAiAssistant(
  userText: string,
  handlers: {
    onToken: (token: string) => void;
    onDone: (result: AdminAiEngineResult) => void;
    onError: (message: string) => void;
  },
): Promise<void> {
  try {
    const intent = parseAdminAiIntent(userText);
    let content = '';
    let entities: AdminAiEntityCard[] = [];
    let navigate: AdminAiNavigateAction | null = null;
    let autoNavigate = false;
    let suggestions: string[] | undefined;

    const promptMore = needsMoreInput(intent.kind, intent.query);
    if (promptMore) {
      content = promptMore;
      suggestions =
        intent.kind === 'search_user'
          ? ['Search by email', 'Search by phone number']
          : undefined;
    } else if (intent.kind === 'help') {
      content = HELP_TEXT;
    } else if (intent.kind === 'navigate' && intent.href) {
      content = `Opening ${intent.hrefLabel ?? 'that screen'} now.`;
      navigate = { href: intent.href, label: intent.hrefLabel ?? 'Open' };
      autoNavigate = true;
    } else if (intent.kind === 'insights') {
      const bundle = await buildAdminAiInsights(intent.insightKey);
      content = bundle.text;
      if (intent.insightKey === 'live_deliveries') {
        navigate = {
          href: adminRoutes.orders({ filter: 'active' }),
          label: 'Open active orders',
        };
      } else if (
        intent.insightKey === 'revenue' ||
        intent.insightKey === 'failed_payments' ||
        intent.insightKey === 'refunds'
      ) {
        navigate = { href: adminRoutes.payments, label: 'Open Payments' };
      } else if (intent.insightKey === 'support') {
        navigate = { href: adminRoutes.supportInbox, label: 'Open Support Inbox' };
      } else if (intent.insightKey === 'top_restaurants' || intent.insightKey === 'restaurants') {
        navigate = {
          href: adminRoutes.restaurantManagement,
          label: 'Open Restaurants',
        };
      } else if (intent.insightKey === 'top_drivers' || intent.insightKey === 'verification') {
        navigate = {
          href: adminRoutes.driverManagement,
          label: 'Open Drivers',
        };
      } else if (intent.insightKey === 'reports') {
        navigate = { href: adminRoutes.reports, label: 'Open Reports' };
      }
    } else if (
      intent.kind === 'search_user' ||
      intent.kind === 'search_email' ||
      intent.kind === 'search_phone'
    ) {
      entities = await searchAdminUsers(intent.query ?? '');
      if (entities.length === 0) {
        content = `No users matched “${intent.query}”. Try another name, email, phone, or UID.`;
        navigate = { href: adminRoutes.users, label: 'Browse Users' };
      } else if (entities.length === 1) {
        content = `Found ${entities[0].title}. Opening their profile.`;
        navigate = {
          href: entities[0].href ?? adminRoutes.user(entities[0].id),
          label: 'Open profile',
        };
        autoNavigate = true;
      } else {
        content = `Found ${entities.length} matching users. Tap a result or open Users.`;
        navigate = { href: adminRoutes.users, label: 'Open Users' };
      }
    } else if (intent.kind === 'search_driver') {
      entities = await searchAdminDrivers(intent.query ?? '');
      if (entities.length === 0) {
        content = intent.query
          ? `No drivers matched “${intent.query}”.`
          : 'No drivers found.';
        navigate = {
          href: adminRoutes.driverManagement,
          label: 'Open Drivers',
        };
      } else if (entities.length === 1) {
        content = [
          `Found driver ${entities[0].title}.`,
          entities[0].meta?.join('\n') ?? '',
          '',
          'Live map coordinates stay on the Drivers screen — opening it now.',
        ]
          .filter(Boolean)
          .join('\n');
        navigate = {
          href: adminRoutes.driverManagement,
          label: 'Open Drivers',
        };
        autoNavigate = true;
      } else {
        content = `Found ${entities.length} drivers. Opening Drivers so you can review them.`;
        navigate = {
          href: adminRoutes.driverManagement,
          label: 'Open Drivers',
        };
        autoNavigate = true;
      }
    } else if (intent.kind === 'search_restaurant') {
      entities = await searchAdminRestaurants(intent.query ?? '');
      if (entities.length === 0) {
        content = intent.query
          ? `No restaurants matched “${intent.query}”.`
          : 'Opening restaurant management.';
        navigate = {
          href: adminRoutes.restaurantManagement,
          label: 'Open Restaurants',
        };
        autoNavigate = !intent.query;
      } else if (entities.length === 1) {
        content = `Found ${entities[0].title}. Opening Restaurants.`;
        navigate = {
          href: adminRoutes.restaurantManagement,
          label: 'Open Restaurants',
        };
        autoNavigate = true;
      } else {
        content = `Found ${entities.length} restaurants. Opening management.`;
        navigate = {
          href: adminRoutes.restaurantManagement,
          label: 'Open Restaurants',
        };
        autoNavigate = true;
      }
    } else if (intent.kind === 'search_order') {
      const { entities: orderEntities, detail } = await searchAdminOrders(
        intent.query,
      );
      entities = orderEntities;
      if (entities.length === 0) {
        content = intent.query
          ? `I couldn’t find order “${intent.query}”. Double-check the ID.`
          : 'Share an Order ID to look it up.';
        navigate = { href: adminRoutes.orders(), label: 'Open Orders' };
      } else if (entities.length === 1) {
        content = detail ?? `Found order ${entities[0].id}. Opening it.`;
        navigate = {
          href: entities[0].href ?? adminRoutes.order(entities[0].id),
          label: 'Open order',
        };
        autoNavigate = true;
      } else {
        content = `Found ${entities.length} matching orders. Pick one below.`;
        navigate = { href: adminRoutes.orders(), label: 'Open Orders' };
      }
    } else {
      content =
        "I didn’t catch that. Try “Find user …”, “Open Orders”, “Payment summary”, or ask for help.";
      suggestions = ['Find a user', 'Open Orders', 'Payment summary', 'Support inbox'];
    }

    await animateReply(content, handlers.onToken);
    handlers.onDone({
      content,
      entities,
      navigate,
      suggestions,
      autoNavigate,
    });
  } catch (e) {
    handlers.onError(
      e instanceof Error ? e.message : 'Something went wrong in Admin AI.',
    );
  }
}

export function createAdminAiMessage(
  role: AdminAiMessage['role'],
  content: string,
  extra?: Partial<AdminAiMessage>,
): AdminAiMessage {
  return {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAtMs: Date.now(),
    ...extra,
  };
}
