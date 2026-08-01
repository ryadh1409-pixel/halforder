/**
 * Natural-language intent parser for the Admin AI Assistant.
 * Maps admin requests onto existing dashboard routes and search actions.
 * Does not invent new product features.
 */
import { adminRoutes } from '@/constants/adminRoutes';

export type AdminAiIntentKind =
  | 'navigate'
  | 'search_user'
  | 'search_driver'
  | 'search_restaurant'
  | 'search_order'
  | 'search_email'
  | 'search_phone'
  | 'insights'
  | 'proactive'
  | 'help'
  | 'unknown';

export type AdminAiParsedIntent = {
  kind: AdminAiIntentKind;
  query: string | null;
  href: string | null;
  hrefLabel: string | null;
  insightKey: string | null;
  raw: string;
};

function normalize(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[“”"']/g, '')
    .replace(/\s+/g, ' ');
}

function extractAfter(
  text: string,
  patterns: RegExp[],
): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const q = m[1].trim().replace(/^#/, '');
      if (q) return q;
    }
  }
  return null;
}

type NavRule = {
  test: RegExp;
  href: string;
  label: string;
};

const NAV_RULES: NavRule[] = [
  { test: /\b(open|show|go to|take me to)?\s*orders?\b(?!.*(fail|refund|today|active|live|delivery))/, href: adminRoutes.orders(), label: 'Orders' },
  { test: /\btoday'?s?\s+orders\b|\borders?\s+today\b/, href: adminRoutes.orders({ filter: 'today' }), label: "Today's orders" },
  { test: /\bactive\s+orders?\b|\blive\s+deliver/, href: adminRoutes.orders({ filter: 'active' }), label: 'Active orders' },
  { test: /\bcompleted\s+(orders?|deliver)/, href: adminRoutes.orders({ filter: 'completed' }), label: 'Completed orders' },
  { test: /\b(open|show|go to)?\s*users?\b(?!.*(today|verif|created|find|search|customer))/, href: adminRoutes.users, label: 'Users' },
  { test: /\b(open|show)?\s*reports?\b/, href: adminRoutes.reports, label: 'Reports' },
  { test: /\bcomplaints?\b/, href: adminRoutes.complaints, label: 'Complaints' },
  { test: /\bsupport\s*inbox\b|\bunread\s+messages?\b|\bunread\s+tickets?\b/, href: adminRoutes.supportInbox, label: 'Support Inbox' },
  { test: /\b(open|show)?\s*finance\b|\brevenue\b(?!.*(fail|payment))/, href: adminRoutes.finance, label: 'Finance' },
  { test: /\bpayments?\b|\bfailed\s+payments?\b|\brefund\s+requests?\b/, href: adminRoutes.payments, label: 'Payments' },
  { test: /\brevenue\b/, href: adminRoutes.revenue, label: 'Revenue' },
  { test: /\banalytics\b/, href: adminRoutes.analytics, label: 'Analytics' },
  { test: /\bdashboard\b|\blive\s+ops\b/, href: adminRoutes.dashboard, label: 'Dashboard' },
  { test: /\b(send\s+)?(announcement|notification|broadcast|notify)\b|\bopen\s+notifications\b/, href: adminRoutes.sendNotification, label: 'Send notification' },
  { test: /\badmin\s+alerts?\b|\bnotification\s+tracking\b/, href: adminRoutes.notifications, label: 'Admin alerts' },
  { test: /\bpush\s+center\b/, href: adminRoutes.pushCenter, label: 'Push Center' },
  { test: /\binbox\s+messages?\b/, href: adminRoutes.inboxMessages, label: 'Inbox Messages' },
  { test: /\brestaurants?\b(?!.*(find|open\s+\w+|lookup|await|pending|approval))/, href: adminRoutes.restaurantManagement, label: 'Restaurants' },
  { test: /\brestaurants?\s+(awaiting|pending)\s+approval\b|\bpending\s+restaurants?\b/, href: adminRoutes.restaurantManagement, label: 'Restaurants' },
  { test: /\bdrivers?\b(?!.*(find|where|location|alex|john))/, href: adminRoutes.driverManagement, label: 'Drivers' },
  { test: /\bemo\s*ai\s*reports?\b|\btop\s+restaurants?\b|\btop\s+drivers?\b/, href: adminRoutes.emoAiReports, label: 'Emo AI Reports' },
  { test: /\bemo\s*chat\b/, href: adminRoutes.emoAiChat, label: 'Emo Chat' },
  { test: /\bstripe\b|\bpayouts?\b/, href: adminRoutes.stripeDiagnostics, label: 'Stripe setup' },
  { test: /\bchat\s+moderation\b/, href: adminRoutes.chatModeration, label: 'Chat moderation' },
  { test: /\bai\s+insights\b/, href: adminRoutes.aiInsights, label: 'AI insights' },
  { test: /\bonboarding\b/, href: adminRoutes.onboardingManager, label: 'Onboarding' },
  { test: /\bpromo\s*codes?\b/, href: adminRoutes.promoCodes, label: 'Promo codes' },
  { test: /\bbalances?\b/, href: adminRoutes.balances, label: 'Balances' },
  { test: /\bvouchers?\b/, href: adminRoutes.vouchers, label: 'Vouchers' },
  { test: /\bhome\s+banners?\b/, href: adminRoutes.homeBanners, label: 'Home banners' },
  { test: /\breferral\s+dashboard\b|\bshow\s+referrals?\b|\breferral\s+report\b/, href: adminRoutes.referralDashboard, label: 'Referral Dashboard' },
  { test: /\bdriver\s+referrals?\b/, href: adminRoutes.referralDashboard, label: 'Driver Referrals' },
  { test: /\bcustomer\s+referrals?\b/, href: adminRoutes.referralDashboard, label: 'Customer Referrals' },
  { test: /\buser\s+activity\b|\btrack\s+users?\b|\bwho\s+(is\s+)?online\b|\bactive\s+users?\b|\buser\s+tracking\b/, href: adminRoutes.userActivity, label: 'User Activity' },
];

export function parseAdminAiIntent(rawInput: string): AdminAiParsedIntent {
  const raw = rawInput.trim();
  const text = normalize(raw);

  if (!text) {
    return {
      kind: 'help',
      query: null,
      href: null,
      hrefLabel: null,
      insightKey: null,
      raw,
    };
  }

  if (
    /\b(help|what can you do|capabilities|commands)\b/.test(text) ||
    text === 'find a user' ||
    text === 'find a driver' ||
    text === 'search by email' ||
    text === 'search by phone number' ||
    text === 'find order by id'
  ) {
    const guided =
      text === 'find a user'
        ? 'search_user'
        : text === 'find a driver'
          ? 'search_driver'
          : text === 'search by email'
            ? 'search_email'
            : text === 'search by phone number'
              ? 'search_phone'
              : text === 'find order by id'
                ? 'search_order'
                : 'help';
    return {
      kind: guided === 'help' ? 'help' : guided,
      query: null,
      href: null,
      hrefLabel: null,
      insightKey: null,
      raw,
    };
  }

  if (
    /\b(how many|current|average|spike|pending|proactive|alerts?|summary)\b/.test(
      text,
    ) ||
    /\b(new users|new restaurants|completed deliveries|refunds?|failed payments?|revenue|delivery time|top restaurants|top drivers|most reported|most active|verification|created today)\b/.test(
      text,
    ) ||
    text === 'payment summary'
  ) {
    let insightKey = 'overview';
    if (/refund/.test(text)) insightKey = 'refunds';
    else if (/fail.*payment|payment.*fail/.test(text)) insightKey = 'failed_payments';
    else if (/revenue|payment summary/.test(text)) insightKey = 'revenue';
    else if (/new users|users created/.test(text)) insightKey = 'new_users';
    else if (/new restaurants|restaurant.*approval|awaiting approval/.test(text))
      insightKey = 'restaurants';
    else if (/completed deliver|completed orders/.test(text))
      insightKey = 'completed';
    else if (/top restaurants/.test(text)) insightKey = 'top_restaurants';
    else if (/top drivers/.test(text)) insightKey = 'top_drivers';
    else if (/reported/.test(text)) insightKey = 'reports';
    else if (/verif/.test(text)) insightKey = 'verification';
    else if (/support|unread|complaint/.test(text)) insightKey = 'support';
    else if (/active deliver|live deliver/.test(text)) insightKey = 'live_deliveries';
    return {
      kind: 'insights',
      query: null,
      href: null,
      hrefLabel: null,
      insightKey,
      raw,
    };
  }

  const orderQ = extractAfter(text, [
    /(?:find|open|show|where is)\s+order\s+#?([a-z0-9_-]{4,})/i,
    /order\s+#([a-z0-9_-]{4,})/i,
    /#([a-z0-9_-]{6,})/,
  ]);
  if (orderQ || /\b(find order|search.*order id|has customer paid|has restaurant accepted|is driver on the way|has delivery finished|current eta|where is order)\b/.test(text)) {
    return {
      kind: 'search_order',
      query: orderQ,
      href: orderQ ? adminRoutes.order(orderQ) : adminRoutes.orders(),
      hrefLabel: orderQ ? `Order ${orderQ}` : 'Orders',
      insightKey: null,
      raw,
    };
  }

  const emailQ = extractAfter(text, [
    /(?:search|find).*email\s*[:=]?\s*([\w.+-]+@[\w.-]+)/i,
    /\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i,
  ]);
  if (emailQ || /\bsearch by email\b/.test(text)) {
    return {
      kind: 'search_email',
      query: emailQ,
      href: adminRoutes.users,
      hrefLabel: 'Users',
      insightKey: null,
      raw,
    };
  }

  const phoneQ = extractAfter(text, [
    /(?:search|find).*phone\s*[:=]?\s*([+\d][\d\s().-]{6,})/i,
    /(?:phone|tel)\s*[:=]?\s*([+\d][\d\s().-]{6,})/i,
  ]);
  if (phoneQ || /\bsearch by phone\b/.test(text)) {
    return {
      kind: 'search_phone',
      query: phoneQ,
      href: adminRoutes.users,
      hrefLabel: 'Users',
      insightKey: null,
      raw,
    };
  }

  const driverQ = extractAfter(text, [
    /(?:find|where is|show|open)\s+driver\s+(.+)$/i,
    /driver'?s?\s+live\s+location\s+(?:for\s+)?(.+)$/i,
    /where is driver\s+(.+)$/i,
  ]);
  if (
    driverQ ||
    /\b(find a driver|where is driver|driver'?s? live location|show driver)\b/.test(
      text,
    )
  ) {
    return {
      kind: 'search_driver',
      query: driverQ,
      href: adminRoutes.driverManagement,
      hrefLabel: 'Drivers',
      insightKey: null,
      raw,
    };
  }

  const restaurantQ = extractAfter(text, [
    /(?:open|find|show)\s+restaurant\s+(.+)$/i,
    /restaurant\s+lookup\s+(.+)$/i,
  ]);
  if (restaurantQ || /\b(open restaurants?|restaurant lookup)\b/.test(text)) {
    return {
      kind: 'search_restaurant',
      query: restaurantQ,
      href: adminRoutes.restaurantManagement,
      hrefLabel: 'Restaurants',
      insightKey: null,
      raw,
    };
  }

  const userQ = extractAfter(text, [
    /(?:find|open|show)\s+(?:user|customer|profile)\s+(.+)$/i,
    /(?:open|show)\s+customer\s+(.+)$/i,
    /(.+)'s\s+profile$/i,
    /find customer by name\s+(.+)$/i,
  ]);
  if (
    userQ ||
    /\b(find a user|find customer|open customer|show.*profile)\b/.test(text)
  ) {
    return {
      kind: 'search_user',
      query: userQ,
      href: adminRoutes.users,
      hrefLabel: 'Users',
      insightKey: null,
      raw,
    };
  }

  for (const rule of NAV_RULES) {
    if (rule.test.test(text)) {
      return {
        kind: 'navigate',
        query: null,
        href: rule.href,
        hrefLabel: rule.label,
        insightKey: null,
        raw,
      };
    }
  }

  // Fallback: treat short free text as a user search.
  if (raw.length >= 2 && raw.length <= 48 && !/\?$/.test(raw)) {
    return {
      kind: 'search_user',
      query: raw.trim(),
      href: adminRoutes.users,
      hrefLabel: 'Users',
      insightKey: null,
      raw,
    };
  }

  return {
    kind: 'unknown',
    query: null,
    href: null,
    hrefLabel: null,
    insightKey: null,
    raw,
  };
}
