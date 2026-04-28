export type OrderStatus =
  | 'pending'
  | 'matched'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface OrderHostProfile {
  userId: string;
  name: string;
  avatar: string | null;
  phone: string | null;
  expoPushToken: string | null;
}

export interface OrderParticipantProfile extends OrderHostProfile {
  location: { lat: number; lng: number } | null;
}
