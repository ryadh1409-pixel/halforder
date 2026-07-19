export type EmoAiRole = 'assistant' | 'user' | 'system';

export type EmoAiMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  createdAtMs: number;
};

export const EMO_AI_PURPLE = '#A855F7';
export const EMO_AI_PURPLE_SOFT = 'rgba(168, 85, 247, 0.18)';
export const EMO_AI_BG = '#000000';
export const EMO_AI_SURFACE = '#171923';
export const EMO_AI_BUBBLE_AI = '#1C2030';
export const EMO_AI_ONLINE = '#22C55E';

export const EMO_AI_QUICK_REPLIES = [
  '🍕',
  'So good!',
  'Long day...',
  'Just chilling',
  'I\'m starving',
  'Rate my food',
] as const;

export const EMO_AI_STARTER_MESSAGES: Omit<EmoAiMessage, 'id' | 'createdAtMs'>[] = [
  { role: 'assistant', content: 'Hey 👋' },
  { role: 'assistant', content: "I'm Emo AI." },
  {
    role: 'assistant',
    content: "I'll keep you company while you eat.",
  },
  { role: 'assistant', content: 'So...' },
  {
    role: 'assistant',
    content: 'What are we having today? 🍕',
  },
];
