import type { Timestamp } from 'firebase/firestore';

export interface FoodTemplate {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  active: boolean;
  createdAt: Timestamp | null;
}

export interface FoodTemplateWrite {
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  active: boolean;
}
