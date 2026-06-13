/**
 * App Store / Play UGC chat moderation — authoritative rule layer.
 * Keep in sync with `stripe-backend/src/chatModerationEngine.ts`.
 */

export const COMMUNITY_GUIDELINES_MESSAGE =
  'This message violates community guidelines.';

export type ModerationCategory =
  | 'profanity'
  | 'hate_speech'
  | 'harassment'
  | 'threats'
  | 'sexual_content'
  | 'spam'
  | 'pii'
  | 'fraud'
  | 'toxicity'
  | 'violence'
  | 'self_harm';

export type ModerationVerdict =
  | { allowed: true; text: string }
  | {
      allowed: false;
      userMessage: string;
      category: ModerationCategory;
      internalReason: string;
    };

export type ModerateChatInput = {
  text: string;
  maxLength?: number;
};

const MAX_DEFAULT = 500;

const PROFANITY = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'cunt',
  'dick',
  'pussy',
  'bastard',
] as const;

const HATE_SPEECH = [
  'nazi',
  'white power',
  'kill all',
  'go back to your country',
  'racial slur',
  'kys',
  'kill yourself',
] as const;

const HARASSMENT = [
  'stupid idiot',
  'you suck',
  'ugly freak',
  'loser',
  'worthless',
  'nobody likes you',
] as const;

const THREATS = [
  'i will kill',
  "i'll kill",
  'im going to hurt',
  "i'm going to hurt",
  'watch your back',
  "you're dead",
  'you are dead',
  'find you',
  'burn your',
] as const;

const SEXUAL = [
  'send nudes',
  'nude pic',
  'child porn',
  'rape',
  'sex tape',
  'hook up tonight',
] as const;

const FRAUD = [
  'wire transfer',
  'send money',
  'cash app me',
  'venmo me',
  'paypal me',
  'investment scam',
  'crypto profit',
  'double your money',
  'telegram',
  'whatsapp.com/phone',
] as const;

const SPAM_PHRASES = [
  'spam link',
  'click here now',
  'free money',
  'limited offer',
  'act now',
] as const;

const LINK_FRAGMENTS = ['http://', 'https://', 'www.', '.tk/', '.ru/'] as const;

/** Luhn-validated credit card patterns (13–19 digits with optional separators). */
const CREDIT_CARD_RE =
  /\b(?:\d[ -]*?){13,19}\b/;

const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/;

const PASSWORD_SHARE = [
  'my password is',
  'password:',
  'pin number is',
  'bank account number',
  'routing number',
  'social security',
] as const;

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function includesAny(haystack: string, needles: readonly string[]): string | null {
  for (const n of needles) {
    if (haystack.includes(n)) return n;
  }
  return null;
}

function luhnCheck(digits: string): boolean {
  const d = digits.replace(/\D/g, '');
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number.parseInt(d[i] ?? '0', 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function detectPii(text: string): ModerationCategory | null {
  const lower = normalize(text);
  const pwd = includesAny(lower, PASSWORD_SHARE);
  if (pwd) return 'pii';
  if (SSN_RE.test(text)) return 'pii';
  const cardMatch = text.match(CREDIT_CARD_RE);
  if (cardMatch) {
    const digits = cardMatch[0]?.replace(/\D/g, '') ?? '';
    if (digits.length >= 13 && luhnCheck(digits)) return 'pii';
  }
  return null;
}

function detectSpamShape(text: string): string | null {
  const t = text.trim();
  if (t.length > 15 && t === t.toUpperCase() && /[A-Z]/.test(t)) {
    return 'all caps';
  }
  if (/(.)\1{14,}/.test(t)) return 'repeated chars';
  const words = t.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (words.length >= 5) {
    const counts = new Map<string, number>();
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
    for (const c of counts.values()) {
      if (c >= 5) return 'word repeat';
    }
  }
  return null;
}

function reject(
  category: ModerationCategory,
  internalReason: string,
): ModerationVerdict {
  return {
    allowed: false,
    userMessage: COMMUNITY_GUIDELINES_MESSAGE,
    category,
    internalReason,
  };
}

/**
 * Rule-based moderation — always runs server-side before delivery.
 */
export function moderateChatText(input: ModerateChatInput): ModerationVerdict {
  const maxLen = input.maxLength ?? MAX_DEFAULT;
  const text = input.text.trim();
  if (!text) {
    return reject('spam', 'empty');
  }
  if (text.length > maxLen) {
    return reject('spam', `length>${maxLen}`);
  }

  const lower = normalize(text);

  const profanity = includesAny(lower, PROFANITY);
  if (profanity) return reject('profanity', profanity);

  const hate = includesAny(lower, HATE_SPEECH);
  if (hate) return reject('hate_speech', hate);

  const harass = includesAny(lower, HARASSMENT);
  if (harass) return reject('harassment', harass);

  const threat = includesAny(lower, THREATS);
  if (threat) return reject('threats', threat);

  const sexual = includesAny(lower, SEXUAL);
  if (sexual) return reject('sexual_content', sexual);

  const fraud = includesAny(lower, FRAUD);
  if (fraud) return reject('fraud', fraud);

  const spamPhrase = includesAny(lower, SPAM_PHRASES);
  if (spamPhrase) return reject('spam', spamPhrase);

  for (const frag of LINK_FRAGMENTS) {
    if (lower.includes(frag)) return reject('spam', `link:${frag}`);
  }

  const pii = detectPii(text);
  if (pii) return reject('pii', 'sensitive_data');

  const spamShape = detectSpamShape(text);
  if (spamShape) return reject('spam', spamShape);

  return { allowed: true, text };
}

export function mapOpenAiCategories(
  flagged: boolean,
  categories: Record<string, boolean> | undefined,
): ModerationCategory | null {
  if (!flagged || !categories) return null;
  if (categories['sexual/minors'] || categories.sexual) return 'sexual_content';
  if (categories.hate || categories['hate/threatening']) return 'hate_speech';
  if (categories.harassment || categories['harassment/threatening']) return 'harassment';
  if (categories.violence || categories['violence/graphic']) return 'violence';
  if (categories['self-harm'] || categories['self-harm/intent']) return 'self_harm';
  if (categories.threatening) return 'threats';
  return 'toxicity';
}
