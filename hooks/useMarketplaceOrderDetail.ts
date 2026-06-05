import { normalizeOrderRouteId } from '@/lib/orderRouteParams';
import {
  isMarketplaceDeliveryOrderData,
  subscribeCustomerOrderById,
  type RestaurantOrder,
} from '@/services/orderService';
import { useLocalSearchParams } from 'expo-router';
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

    return subscribeCustomerOrderById(
      orderId,
      (mapped) => {
        if (!mapped) {
          setOrder(null);
          setMapError(null);
          return;
        }
        const isMarketplace = isMarketplaceDeliveryOrderData(
          {
            deliveryType: mapped.deliveryType,
            restaurantId: mapped.restaurantId,
            items: mapped.items,
            deliveryAddress: mapped.deliveryAddress,
            deliveryLocation: mapped.deliveryLocation,
          },
          mapped,
        );
        console.log(`[${logTag}] CUSTOMER_ORDER_DETAIL mapped`, {
          orderId,
          status: mapped.status,
          deliveryStatus: mapped.deliveryStatus,
          paymentStatus: mapped.paymentStatus,
          isMarketplace,
        });
        setMapError(null);
        setOrder(mapped);
      },
      {
        onListenError: (err) => {
          console.warn(`[${logTag}] listener error`, { orderId, err });
          setMapError(err.message);
          setOrder(null);
        },
      },
    );
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
