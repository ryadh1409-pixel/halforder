import { Platform } from 'react-native';
import Constants from 'expo-constants';

function detectLocalApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl && envUrl.trim()) return envUrl.trim();

  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } })
      .manifest2?.extra?.expoGo?.debuggerHost ||
    '';
  const host = hostUri.split(':')[0];
  if (host && /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return `http://${host}:3000`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000';
  }

  // Fallback to LAN IP pattern (override with EXPO_PUBLIC_API_BASE_URL when needed).
  return 'http://192.168.0.41:3000';
}

const API_BASE_URL = detectLocalApiBaseUrl();

type CreateCheckoutSessionParams = {
  amount: number;
  orderId: string;
};

type CreateCheckoutSessionResponse = {
  url: string;
};

export async function createCheckoutSession(
  params: CreateCheckoutSessionParams,
): Promise<CreateCheckoutSessionResponse> {
  console.log('[payment] create-checkout-session request', {
    baseUrl: API_BASE_URL,
    amount: params.amount,
    orderId: params.orderId,
  });
  const response = await fetch(`${API_BASE_URL}/create-checkout-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: params.amount,
      orderId: params.orderId,
    }),
  });

  const data = (await response.json()) as
    | { url?: string; error?: string }
    | undefined;
  console.log('[payment] create-checkout-session response', {
    ok: response.ok,
    status: response.status,
    hasUrl: Boolean(data?.url),
    error: data?.error ?? null,
  });

  if (!response.ok || !data?.url) {
    throw new Error(data?.error || 'Could not create Stripe checkout session');
  }

  return { url: data.url };
}
/**
 * Nearby restaurant discovery for guided ordering (mock-ready for real API).
 */

export type LatLng = { lat: number; lng: number };

export type NearbyRestaurant = {
  id: string;
  name: string;
  rating: number;
  distance: string;
  image: string;
};

const MOCK_PIZZA_SPOTS: NearbyRestaurant[] = [
  {
    id: '1',
    name: 'Pizza Pizza',
    rating: 4.2,
    distance: '0.3 km',
    image:
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: '2',
    name: 'Pizzaiolo',
    rating: 4.5,
    distance: '0.5 km',
    image:
      'https://images.unsplash.com/photo-1594007654729-407eedc4fe24?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: '3',
    name: 'Libretto',
    rating: 4.7,
    distance: '0.8 km',
    image:
      'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: '4',
    name: 'Domino’s',
    rating: 4.1,
    distance: '1.1 km',
    image:
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80',
  },
];

/**
 * Returns mock restaurants near `location` for `cuisine` (e.g. "pizza").
 * Swap body for Places API / backend when ready.
 */
export async function getNearbyRestaurants(
  _location: LatLng,
  cuisine: string,
): Promise<NearbyRestaurant[]> {
  void _location;
  void cuisine;
  await new Promise((r) => setTimeout(r, 450));
  return [...MOCK_PIZZA_SPOTS];
}

export type PopularPizza = {
  id: string;
  name: string;
  price: number;
  image: string;
};

export const POPULAR_PIZZAS: PopularPizza[] = [
  {
    id: 'p1',
    name: 'Classic Pepperoni',
    price: 18.99,
    image:
      'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'p2',
    name: 'Margherita Fresca',
    price: 16.5,
    image:
      'https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'p3',
    name: 'Truffle Mushroom',
    price: 21.0,
    image:
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80',
  },
];
