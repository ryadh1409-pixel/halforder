import { normalizeOrderRouteId } from '@/lib/orderRouteParams';
import { db } from '@/services/firebase';
import {
  isMarketplaceDeliveryOrderData,
  mapDocToRestaurantOrder,
  type RestaurantOrder,
} from '@/services/orderService';
import { useLocalSearchParams } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

export type MarketplaceOrderDetailState =
  | { phase: 'missing_id' }
  | { phase: 'loading'; orderId: string }
  | { phase: 'not_found'; orderId: string }
  | { phase: 'map_error'; orderId: string; message: string }
  | { phase: 'ready'; orderId: string; order: RestaurantOrder; isMarketplace: boolean };

export function useMarketplaceOrderDetail(
  logTag = 'order/[id]',
): MarketplaceOrderDetailState {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const orderId = useMemo(() => normalizeOrderRouteId(params.id), [params.id]);
  const [order, setOrder] = useState<RestaurantOrder | null | undefined>(undefined);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (__DEV__) {
      console.log(`[${logTag}] route params`, {
        rawId: params.id,
        orderId: orderId || null,
      });
    }
  }, [logTag, orderId, params.id]);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setMapError(null);
      return undefined;
    }

    setOrder(undefined);
    setMapError(null);

    if (__DEV__) {
      console.log(`[${logTag}] Firestore subscribe`, { orderId });
    }

    const unsub = onSnapshot(
      doc(db, 'orders', orderId),
      (snap) => {
        if (__DEV__) {
          console.log(`[${logTag}] snapshot`, {
            orderId,
            exists: snap.exists(),
            hasPendingWrites: snap.metadata.hasPendingWrites,
          });
        }
        if (!snap.exists()) {
          setOrder(null);
          setMapError(null);
          return;
        }
        try {
          const raw = snap.data() as Record<string, unknown>;
          const mapped = mapDocToRestaurantOrder(snap);
          const isMarketplace = isMarketplaceDeliveryOrderData(raw, mapped);
          if (__DEV__) {
            console.log(`[${logTag}] mapped order`, {
              orderId,
              status: mapped.status,
              deliveryStatus: mapped.deliveryStatus,
              paymentStatus: mapped.paymentStatus,
              isMarketplace,
            });
          }
          setMapError(null);
          setOrder(mapped);
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Could not read order';
          console.warn(`[${logTag}] mapDocToRestaurantOrder failed`, { orderId, e });
          setMapError(message);
          setOrder(null);
        }
      },
      (err) => {
        console.warn(`[${logTag}] listener error`, { orderId, err });
        setMapError(err instanceof Error ? err.message : 'Listener error');
        setOrder(null);
      },
    );

    return unsub;
  }, [logTag, orderId]);

  return useMemo((): MarketplaceOrderDetailState => {
    if (!orderId) return { phase: 'missing_id' };
    if (mapError) {
      return { phase: 'map_error', orderId, message: mapError };
    }
    if (order === undefined) return { phase: 'loading', orderId };
    if (order === null) return { phase: 'not_found', orderId };
    const isMarketplace = isMarketplaceDeliveryOrderData(
      {
        deliveryType: order.deliveryType,
        restaurantId: order.restaurantId,
        items: order.items,
        deliveryAddress: order.deliveryAddress,
        deliveryLocation: order.deliveryLocation,
      },
      order,
    );
    return { phase: 'ready', orderId, order, isMarketplace };
  }, [mapError, order, orderId]);
}
