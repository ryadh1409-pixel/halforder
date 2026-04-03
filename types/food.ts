import type { Timestamp } from 'firebase/firestore';

/**
 * Firestore `foodTemplates` document shape (client-read).
 * `createdAt` is a Firestore Timestamp in production data.
 */
export interface FoodTemplate {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  active: boolean;
  createdAt: Timestamp | null;
}

/** Payload for create/update (admin). */
export interface FoodTemplateWrite {
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  active: boolean;
}
