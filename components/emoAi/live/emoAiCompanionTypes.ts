/** Live companion state — Emo AI screen only. */

export type EmoEmotion =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'lonely'
  | 'excited'
  | 'funny'
  | 'angry'
  | 'surprised'
  | 'sleepy'
  | 'embarrassed'
  | 'thinking'
  | 'caring';

export type EmoFoodProp =
  | 'none'
  | 'pizza'
  | 'burger'
  | 'coffee'
  | 'bubbleTea'
  | 'noodles';

export type EmoCompanionPhase =
  | 'idle'
  | 'thinking'
  | 'speaking'
  | 'eating'
  | 'idleAction';

export type EmoIdleAction =
  | 'petCat'
  | 'eatPizza'
  | 'drinkCoffee'
  | 'stretch'
  | 'checkPhone'
  | 'lookAround'
  | 'smile'
  | 'wave'
  | 'yawn'
  | 'playCat';

export type EmoCompanionSnapshot = {
  phase: EmoCompanionPhase;
  emotion: EmoEmotion;
  food: EmoFoodProp;
  idleAction: EmoIdleAction | null;
  lookAtMessage: boolean;
  catCloser: boolean;
  catSleeping: boolean;
  offerFood: boolean;
  calmLights: boolean;
  heartEyes: boolean;
};
