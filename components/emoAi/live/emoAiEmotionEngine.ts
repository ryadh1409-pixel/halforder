import type {
  EmoEmotion,
  EmoFoodProp,
} from './emoAiCompanionTypes';

export type EmoMessageAnalysis = {
  emotion: EmoEmotion;
  food: EmoFoodProp;
  offerFood: boolean;
  catCloser: boolean;
  catSleeping: boolean;
  calmLights: boolean;
  heartEyes: boolean;
  forceEat: boolean;
  forceExcited: boolean;
};

function has(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

/** Analyze a user message for facial / prop / cat reactions. */
export function analyzeEmoUserMessage(raw: string): EmoMessageAnalysis {
  const text = raw.trim().toLowerCase();
  const base: EmoMessageAnalysis = {
    emotion: 'neutral',
    food: 'none',
    offerFood: false,
    catCloser: false,
    catSleeping: false,
    calmLights: false,
    heartEyes: false,
    forceEat: false,
    forceExcited: false,
  };
  if (!text) return base;

  let emotion: EmoEmotion = 'neutral';

  if (has(text, ['haha', 'lol', 'lmao', '😂', '🤣', 'funny', 'hilarious', 'joke'])) {
    emotion = 'funny';
  } else if (has(text, ['depressed', 'depression', 'hopeless', "can't go on"])) {
    emotion = 'sad';
    base.catCloser = true;
  } else if (has(text, ['sad', 'cry', 'crying', 'upset', 'miserable', 'down'])) {
    emotion = 'sad';
    base.catCloser = true;
  } else if (has(text, ['lonely', 'alone', 'nobody', 'miss you', 'isolated'])) {
    emotion = 'lonely';
    base.heartEyes = true;
    base.offerFood = true;
    base.food = 'pizza';
  } else if (has(text, ['angry', 'mad', 'furious', 'annoyed', 'hate'])) {
    emotion = 'angry';
  } else if (has(text, ['wow', 'omg', 'what?!', 'no way', 'surprised', 'shocked', '?!'])) {
    emotion = 'surprised';
  } else if (has(text, ['good night', 'goodnight', 'gn', 'sleep', 'sleepy', 'tired', 'exhausted', 'bed'])) {
    emotion = 'sleepy';
    base.catSleeping = true;
    base.calmLights = true;
  } else if (has(text, ['embarrassed', 'awkward', 'cringe', 'shy'])) {
    emotion = 'embarrassed';
  } else if (has(text, ['excited', 'amazing', 'awesome', 'yay', 'lets go', "let's go", 'hyped'])) {
    emotion = 'excited';
  } else if (has(text, ['happy', 'great', 'good', 'love', 'awesome', '😊', '🥰', 'thanks', 'thank you'])) {
    emotion = 'happy';
  } else if (has(text, ['hungry', 'starving', 'food', 'eat'])) {
    emotion = 'caring';
    base.offerFood = true;
    base.food = 'pizza';
  } else if (has(text, ['think', 'hmm', 'idk', "i don't know", 'maybe', 'wonder'])) {
    emotion = 'thinking';
  }

  if (has(text, ['pizza', '🍕', 'pepperoni', 'slice'])) {
    base.food = 'pizza';
    if (has(text, ['got the pizza', 'got pizza', 'ordered pizza', 'pizza arrived', 'i got'])) {
      base.forceExcited = true;
      base.forceEat = true;
      emotion = 'excited';
    }
  } else if (has(text, ['burger', '🍔', 'cheeseburger'])) {
    base.food = 'burger';
  } else if (has(text, ['coffee', '☕', 'latte', 'espresso'])) {
    base.food = 'coffee';
  } else if (has(text, ['bubble tea', 'boba', '🧋', 'milk tea'])) {
    base.food = 'bubbleTea';
  } else if (has(text, ['noodle', 'noodles', 'ramen', '🍜', 'pasta'])) {
    base.food = 'noodles';
  }

  if (base.offerFood && base.food === 'none') base.food = 'pizza';

  return { ...base, emotion };
}

export const IDLE_ACTIONS = [
  'petCat',
  'eatPizza',
  'drinkCoffee',
  'stretch',
  'checkPhone',
  'lookAround',
  'smile',
  'wave',
  'yawn',
  'playCat',
] as const;

export function pickRandomIdleAction(exclude?: string | null): (typeof IDLE_ACTIONS)[number] {
  const pool = exclude
    ? IDLE_ACTIONS.filter((a) => a !== exclude)
    : [...IDLE_ACTIONS];
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
