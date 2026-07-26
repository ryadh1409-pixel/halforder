/** Admin AI Assistant — types & suggestion chips (dashboard-only). */

export type AdminAiRole = 'assistant' | 'user' | 'system';

export type AdminAiNavigateAction = {
  href: string;
  label: string;
};

export type AdminAiEntityCard = {
  id: string;
  kind: 'user' | 'driver' | 'restaurant' | 'order' | 'support' | 'payment';
  title: string;
  subtitle?: string;
  meta?: string[];
  photoUrl?: string | null;
  href?: string;
};

export type AdminAiMessage = {
  id: string;
  role: AdminAiRole;
  content: string;
  createdAtMs: number;
  entities?: AdminAiEntityCard[];
  navigate?: AdminAiNavigateAction | null;
  suggestions?: string[];
};

export type AdminAiSuggestionChip = {
  id: string;
  label: string;
  prompt: string;
};

export const ADMIN_AI_SUGGESTION_CHIPS: AdminAiSuggestionChip[] = [
  { id: 'find-user', label: 'Find a user', prompt: 'Find a user' },
  { id: 'find-driver', label: 'Find a driver', prompt: 'Find a driver' },
  { id: 'open-orders', label: 'Open Orders', prompt: 'Open Orders' },
  { id: 'payment-summary', label: 'Payment summary', prompt: 'Payment summary' },
  { id: 'live-deliveries', label: 'Live deliveries', prompt: 'Show all active deliveries' },
  { id: 'restaurant-lookup', label: 'Restaurant lookup', prompt: 'Open restaurants' },
  { id: 'view-reports', label: 'View reports', prompt: 'Open Reports' },
  { id: 'support-inbox', label: 'Support inbox', prompt: 'Open Support Inbox' },
  { id: 'send-notification', label: 'Send notification', prompt: 'Send announcement' },
  { id: 'search-email', label: 'Search by email', prompt: 'Search by email' },
  { id: 'search-phone', label: 'Search by phone', prompt: 'Search by phone number' },
  { id: 'search-order', label: 'Search by Order ID', prompt: 'Find order by ID' },
];

export function buildAdminAiGreeting(firstName: string): string {
  const name = firstName.trim() || 'there';
  return [
    `Hello ${name} 👋`,
    '',
    'Welcome back.',
    '',
    "I'm your HalfOrder Admin AI Assistant.",
    '',
    'I can instantly help you manage users, restaurants, drivers, orders, payments, reports and more.',
    '',
    'How can I help today?',
  ].join('\n');
}
