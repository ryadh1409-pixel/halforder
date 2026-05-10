export type RestaurantSnapshot = {
  id: string;
  name: string;
  image?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type CustomerSnapshot = {
  id: string;
  name: string;
  avatar?: string | null;
  address?: string | null;
};

export type DriverSnapshot = {
  id: string;
  name: string;
  phone?: string | null;
  vehicle?: string | null;
  avatar?: string | null;
};

export type OrderDocument = {
  restaurant: RestaurantSnapshot;
  customer: CustomerSnapshot;
  driver?: DriverSnapshot | null;
  status: string;
  paymentStatus: string;
  items: Array<{
    id: string;
    name: string;
    qty: number;
    price: number;
    image?: string | null;
  }>;
  subtotal: number;
  fees: number;
  taxes: number;
  total: number;
  etaMinutes: number;
  createdAt: unknown;
  updatedAt?: unknown;
};
