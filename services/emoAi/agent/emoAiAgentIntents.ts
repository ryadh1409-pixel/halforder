/** Lightweight intent detection for agent hints (no UI changes). */

export type EmoAiAgentIntentResult = {
  wantsCheapest: boolean;
  wantsRecommendations: boolean;
  wantsCreateSplit: boolean;
  wantsInvite: boolean;
  wantsCoupon: boolean;
  wantsNearbyMatch: boolean;
  wantsOrderStatus: boolean;
  foodQuery: string | null;
  hints: string[];
};

export function detectEmoAiAgentIntents(raw: string): EmoAiAgentIntentResult {
  const text = raw.trim().toLowerCase();
  const empty: EmoAiAgentIntentResult = {
    wantsCheapest: false,
    wantsRecommendations: false,
    wantsCreateSplit: false,
    wantsInvite: false,
    wantsCoupon: false,
    wantsNearbyMatch: false,
    wantsOrderStatus: false,
    foodQuery: null,
    hints: [],
  };
  if (!text) return empty;

  const wantsCheapest = /cheapest|lowest price|best deal|under \$?\d+|affordable/.test(
    text,
  );
  const wantsRecommendations =
    /recommend|suggest|what should i (eat|order)|hungry|what's good|whats good/.test(
      text,
    );
  const wantsCreateSplit =
    /create (a )?split|start (a )?split|split order|open (a )?half ?order/.test(text);
  const wantsInvite = /invite|share link|send link|add people|add friends/.test(text);
  const wantsCoupon = /apply (coupon|promo)|use (coupon|promo)|promo code/.test(text);
  const wantsNearbyMatch =
    /nearby users|find people|match me|who('s| is) nearby|start matching/.test(text);
  const wantsOrderStatus =
    /where('s| is) my order|order status|track (my )?order|driver|eta/.test(text);

  let foodQuery: string | null = null;
  const foodMatch = text.match(
    /(?:cheapest|find|want|get|order)\s+(?:a\s+|me\s+|some\s+)?([a-z][a-z\s]{1,30})/,
  );
  if (foodMatch?.[1]) foodQuery = foodMatch[1].trim();
  if (/pizza/.test(text)) foodQuery = foodQuery || 'pizza';
  if (/burger/.test(text)) foodQuery = foodQuery || 'burger';
  if (/sushi/.test(text)) foodQuery = foodQuery || 'sushi';
  if (/noodle|ramen/.test(text)) foodQuery = foodQuery || 'noodles';

  const hints: string[] = [];
  if (wantsCreateSplit) {
    hints.push(
      'User wants to create a split order. Guide them to Swipe or Orders to open a shareable HalfOrder. Do not claim the order was created unless confirmed by the app.',
    );
  }
  if (wantsInvite) {
    hints.push(
      'User wants to invite people. Tell them to open the active order room and use the invite/share link from that screen.',
    );
  }
  if (wantsCoupon) {
    hints.push(
      'User wants a coupon. Mention saved coupons from memory and Wallet / checkout promo field. Do not claim a coupon was applied unless the checkout flow confirms it.',
    );
  }
  if (wantsNearbyMatch) {
    hints.push(
      'User wants nearby matching. Direct them to Swipe discovery to find people to split with.',
    );
  }
  if (wantsOrderStatus) {
    hints.push(
      'User asked about order status. Use LIVE order alerts and recent orders list — be specific.',
    );
  }

  return {
    wantsCheapest,
    wantsRecommendations,
    wantsCreateSplit,
    wantsInvite,
    wantsCoupon,
    wantsNearbyMatch,
    wantsOrderStatus,
    foodQuery,
    hints,
  };
}
