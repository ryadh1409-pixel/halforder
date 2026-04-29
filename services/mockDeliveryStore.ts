import { useSyncExternalStore } from 'react';

export type DeliveryStatus =
  | 'pending'
  | 'preparing'
  | 'accepted'
  | 'delivering'
  | 'completed';

export type MockDriver = {
  name: string;
  car: string;
  phone: string;
  location: { latitude: number; longitude: number };
};

export type MockDeliveryOrder = {
  id: string;
  restaurantName: string;
  pickupLocation: string;
  dropoffLocation: string;
  destination: { latitude: number; longitude: number };
  status: DeliveryStatus;
  paymentStatus: 'unpaid' | 'paid';
  itemName: string;
  totalPrice: number;
  deliveryFee: number;
  splitSavings: number;
  usersCount: number;
  driver: MockDriver | null;
};

type DeliveryStore = {
  orders: MockDeliveryOrder[];
};

const DEFAULT_DRIVER: MockDriver = {
  name: 'Ahmed',
  car: 'Toyota Corolla',
  phone: '+1 647 xxx',
  location: { latitude: 43.6532, longitude: -79.3832 },
};

let state: DeliveryStore = {
  orders: [
    {
      id: '1',
      restaurantName: 'Tacos El Jefe',
      pickupLocation: 'King St W & Bathurst',
      dropoffLocation: 'Queen St W & Spadina',
      destination: { latitude: 43.6481, longitude: -79.3974 },
      status: 'pending',
      paymentStatus: 'unpaid',
      itemName: 'Beef Tacos',
      totalPrice: 24.99,
      deliveryFee: 3.49,
      splitSavings: 4.0,
      usersCount: 2,
      driver: null,
    },
  ],
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function setState(next: DeliveryStore) {
  state = next;
  emit();
}

export function subscribeDeliveryStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDeliveryStoreSnapshot(): DeliveryStore {
  return state;
}

export function useMockDeliveryOrders(): MockDeliveryOrder[] {
  return useSyncExternalStore(
    subscribeDeliveryStore,
    () => getDeliveryStoreSnapshot().orders,
    () => getDeliveryStoreSnapshot().orders,
  );
}

export function createMockOrder(input: {
  restaurantName: string;
  itemName: string;
  totalPrice: number;
  deliveryFee?: number;
  splitSavings?: number;
  usersCount?: number;
  pickupLocation: string;
  dropoffLocation: string;
  destination: { latitude: number; longitude: number };
}): MockDeliveryOrder {
  const nextId = `${Date.now()}`;
  const order: MockDeliveryOrder = {
    id: nextId,
    restaurantName: input.restaurantName,
    pickupLocation: input.pickupLocation,
    dropoffLocation: input.dropoffLocation,
    destination: input.destination,
    status: 'pending',
    paymentStatus: 'unpaid',
    itemName: input.itemName,
    totalPrice: input.totalPrice,
    deliveryFee: input.deliveryFee ?? 3.49,
    splitSavings: input.splitSavings ?? 0,
    usersCount: input.usersCount ?? 1,
    driver: null,
  };
  setState({ orders: [order, ...state.orders] });
  return order;
}

export function getOrderById(orderId: string): MockDeliveryOrder | null {
  return state.orders.find((order) => order.id === orderId) ?? null;
}

export function acceptOrder(orderId: string): void {
  setState({
    orders: state.orders.map((order) =>
      order.id === orderId
        ? {
            ...order,
            status: 'accepted',
            driver: DEFAULT_DRIVER,
          }
        : order,
    ),
  });
}

export function markOrderPaid(orderId: string): void {
  setState({
    orders: state.orders.map((order) =>
      order.id === orderId
        ? { ...order, paymentStatus: 'paid', status: 'preparing' }
        : order,
    ),
  });
}

export function startDelivery(orderId: string): void {
  setState({
    orders: state.orders.map((order) =>
      order.id === orderId ? { ...order, status: 'delivering' } : order,
    ),
  });
}

export function completeDelivery(orderId: string): void {
  setState({
    orders: state.orders.map((order) =>
      order.id === orderId ? { ...order, status: 'completed' } : order,
    ),
  });
}
