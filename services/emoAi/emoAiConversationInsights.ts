/**
 * Conversation analytics + insights for Emo AI Reports (additive).
 */
import type { EmoAiConversationDoc } from '@/services/emoAi/emoAiConversations';

export type EmoConversationInsights = {
  mostRequestedRestaurants: { name: string; count: number }[];
  mostRequestedMeals: { name: string; count: number }[];
  mostSearchedFood: { name: string; count: number }[];
  mostCommonComplaints: { name: string; count: number }[];
  mostRequestedFeatures: { name: string; count: number }[];
  mostCommonBugs: { name: string; count: number }[];
  mostCommonPaymentIssues: { name: string; count: number }[];
  mostCommonDeliveryIssues: { name: string; count: number }[];
  mostCommonAppQuestions: { name: string; count: number }[];
  mostCommonAiQuestions: { name: string; count: number }[];
  trendingKeywords: { name: string; count: number }[];
  frequentlyRepeatedQuestions: { name: string; count: number }[];
};

export type EmoConversationAnalytics = {
  totalConversations: number;
  activeUsers: number;
  averageMessagesPerConversation: number;
  averageConversationLength: number;
  averageResponseTimeMs: number | null;
  mostActiveUsers: { userId: string; userName: string; messages: number }[];
  dailyConversationCount: number;
  weeklyConversationCount: number;
  monthlyConversationCount: number;
  highPriorityCount: number;
};

const STOP = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'to',
  'of',
  'in',
  'is',
  'it',
  'i',
  'you',
  'me',
  'my',
  'we',
  'for',
  'on',
  'with',
  'this',
  'that',
  'can',
  'do',
  'what',
  'how',
  'when',
  'where',
  'why',
  'hi',
  'hey',
  'hello',
  'emo',
  'please',
  'thanks',
  'thank',
]);

function bump(map: Map<string, number>, key: string, n = 1) {
  const k = key.trim().toLowerCase();
  if (!k) return;
  map.set(k, (map.get(k) ?? 0) + n);
}

function top(
  map: Map<string, number>,
  n = 8,
): { name: string; count: number }[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

function userText(rows: EmoAiConversationDoc[]): string {
  return rows
    .flatMap((c) => c.messages.filter((m) => m.role === 'user').map((m) => m.content))
    .join('\n')
    .toLowerCase();
}

export function buildEmoConversationInsights(
  rows: EmoAiConversationDoc[],
): EmoConversationInsights {
  const restaurants = new Map<string, number>();
  const meals = new Map<string, number>();
  const foods = new Map<string, number>();
  const complaints = new Map<string, number>();
  const features = new Map<string, number>();
  const bugs = new Map<string, number>();
  const payments = new Map<string, number>();
  const delivery = new Map<string, number>();
  const appQs = new Map<string, number>();
  const aiQs = new Map<string, number>();
  const keywords = new Map<string, number>();
  const questions = new Map<string, number>();

  for (const c of rows) {
    for (const m of c.messages) {
      if (m.role !== 'user') continue;
      const t = m.content.toLowerCase();
      const rest = t.match(
        /(?:at|from|restaurant)\s+([a-z0-9 &'-+]{2,40})/i,
      );
      if (rest?.[1]) bump(restaurants, rest[1]);
      const meal = t.match(
        /(?:want|order|craving|get)\s+(?:some\s+)?([a-z0-9 &'-+]{2,40})/i,
      );
      if (meal?.[1]) bump(meals, meal[1]);
      for (const food of [
        'pizza',
        'burger',
        'sushi',
        'noodles',
        'salad',
        'taco',
        'chicken',
        'pasta',
      ]) {
        if (t.includes(food)) bump(foods, food);
      }
      if (/complain|terrible|awful|worst|hate/.test(t)) bump(complaints, 'general complaint');
      if (/refund/.test(t)) bump(complaints, 'refund');
      if (/feature|wishlist|should add|missing/.test(t)) bump(features, 'feature request');
      if (/bug|crash|error|broken|freeze/.test(t)) bump(bugs, 'bug/crash');
      if (/payment|stripe|card|charged/.test(t)) bump(payments, 'payment');
      if (/delivery|driver|late|never arrived/.test(t)) bump(delivery, 'delivery');
      if (/how (do|does|to)|where (is|do)|app/.test(t)) bump(appQs, 'app how-to');
      if (/who are you|what can you|emo/.test(t)) bump(aiQs, 'ai question');
      if (t.includes('?')) {
        const q = t.trim().replace(/\s+/g, ' ').slice(0, 80);
        bump(questions, q);
      }
      for (const w of t.split(/[^a-z0-9]+/)) {
        if (w.length < 4 || STOP.has(w)) continue;
        bump(keywords, w);
      }
    }
  }

  return {
    mostRequestedRestaurants: top(restaurants),
    mostRequestedMeals: top(meals),
    mostSearchedFood: top(foods),
    mostCommonComplaints: top(complaints),
    mostRequestedFeatures: top(features),
    mostCommonBugs: top(bugs),
    mostCommonPaymentIssues: top(payments),
    mostCommonDeliveryIssues: top(delivery),
    mostCommonAppQuestions: top(appQs),
    mostCommonAiQuestions: top(aiQs),
    trendingKeywords: top(keywords, 12),
    frequentlyRepeatedQuestions: top(questions, 8),
  };
}

export function buildEmoConversationAnalytics(
  rows: EmoAiConversationDoc[],
  now = Date.now(),
): EmoConversationAnalytics {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayMs = dayStart.getTime();
  const weekMs = now - 7 * 86_400_000;
  const monthMs = now - 30 * 86_400_000;

  let totalMessages = 0;
  let totalChars = 0;
  let responseGaps = 0;
  let responseGapCount = 0;
  const byUser = new Map<string, { userName: string; messages: number }>();

  for (const c of rows) {
    totalMessages += c.messageCount || c.messages.length;
    for (const m of c.messages) totalChars += m.content.length;
    for (let i = 0; i < c.messages.length - 1; i += 1) {
      const a = c.messages[i];
      const b = c.messages[i + 1];
      if (a?.role === 'user' && b?.role === 'assistant') {
        const gap = b.createdAtMs - a.createdAtMs;
        if (gap > 0 && gap < 120_000) {
          responseGaps += gap;
          responseGapCount += 1;
        }
      }
    }
    const prev = byUser.get(c.userId) ?? { userName: c.userName, messages: 0 };
    prev.messages += c.messageCount || c.messages.length;
    byUser.set(c.userId, prev);
  }

  return {
    totalConversations: rows.length,
    activeUsers: byUser.size,
    averageMessagesPerConversation: rows.length
      ? Math.round((totalMessages / rows.length) * 10) / 10
      : 0,
    averageConversationLength: rows.length
      ? Math.round(totalChars / rows.length)
      : 0,
    averageResponseTimeMs: responseGapCount
      ? Math.round(responseGaps / responseGapCount)
      : null,
    mostActiveUsers: [...byUser.entries()]
      .sort((a, b) => b[1].messages - a[1].messages)
      .slice(0, 8)
      .map(([userId, v]) => ({
        userId,
        userName: v.userName,
        messages: v.messages,
      })),
    dailyConversationCount: rows.filter((r) => r.lastActivityMs >= dayMs).length,
    weeklyConversationCount: rows.filter((r) => r.lastActivityMs >= weekMs).length,
    monthlyConversationCount: rows.filter((r) => r.lastActivityMs >= monthMs)
      .length,
    highPriorityCount: rows.filter((r) => r.highPriority || r.flagged).length,
  };
}

/** Debug helper — keep blob available for keyword dumps. */
export function conversationCorpusPreview(rows: EmoAiConversationDoc[]): string {
  return userText(rows).slice(0, 500);
}
