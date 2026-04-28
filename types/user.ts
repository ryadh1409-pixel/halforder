export interface UserLocation {
  lat: number;
  lng: number;
}

export interface PublicUserProfile {
  userId: string;
  name: string;
  email?: string | null;
  avatar?: string | null;
  phone?: string | null;
  expoPushToken?: string | null;
  location?: UserLocation | null;
}
