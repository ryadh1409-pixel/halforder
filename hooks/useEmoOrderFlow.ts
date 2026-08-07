/**
 * useEmoOrderFlow — EmoOrder conversational state machine.
 * Drives the full AI concierge experience from greeting to delivered.
 * Completely isolated — no Food Share / Pick Up / existing lifecycle coupling.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  findNearbyRestaurantsForConcierge,
  searchRestaurantsForConcierge,
  extractKeywordThemes,
} from '@/services/emoOrder/emoOrderRestaurant';
import {
  detectCuisineFromMessage,
  detectFoodIntent,
  getMealSuggestionsForRestaurant,
} from '@/services/emoOrder/emoOrderMeals';
import {
  createAndPayEmoOrder,
  quoteEmoOrderPricing,
} from '@/services/emoOrder/emoOrderPayment';
import { validateRestaurantIsOpen } from '@/services/emoOrder/emoOrderPlacesDetails';
import { subscribeCustomerOrderById } from '@/services/orderService';
import type {
  EmoOrderAddressDraft,
  EmoOrderChatMessage,
  EmoOrderMealDraft,
  EmoOrderMealSuggestion,
  EmoOrderPhase,
  EmoOrderPricing,
  EmoOrderRestaurantOption,
  EmoOrderTrackingStatus,
  EmoAddressConfirmRichData,
  EmoMealSuggestionsRichData,
  EmoRestaurantsRichData,
  EmoReviewsRichData,
  EmoSummaryRichData,
  EmoTrackingRichData,
} from '@/types/emoOrder';

// ── Helpers ────────────────────────────────────────────────────────────────

let msgCounter = 0;
function newMsgId(): string {
  msgCounter += 1;
  return `em_${Date.now().toString(36)}_${msgCounter}`;
}

function aiMsg(
  text: string | null,
  extra?: Partial<Omit<EmoOrderChatMessage, 'id' | 'role' | 'createdAtMs'>>,
): EmoOrderChatMessage {
  return {
    id: newMsgId(),
    role: 'ai',
    text,
    createdAtMs: Date.now(),
    ...extra,
  };
}

function userMsg(text: string): EmoOrderChatMessage {
  return { id: newMsgId(), role: 'user', text, createdAtMs: Date.now() };
}

// ── Tracking status → human message ───────────────────────────────────────

function trackingStatusMessage(
  status: string,
  deliveryStatus: string | null,
  driverName: string | null,
  restaurantName: string,
): string | null {
  const ds = (deliveryStatus ?? '').toLowerCase();
  const s = status.toLowerCase();
  const driver = driverName?.split(' ')[0] ?? 'your driver';

  if (ds === 'delivered' || s === 'delivered' || s === 'completed') {
    return `delivered. enjoy your meal 🖤`;
  }
  if (ds === 'arrived_at_customer' || ds === 'arrived') {
    return `${driver} has arrived. check your door 🏠`;
  }
  if (ds === 'en_route_to_customer' || ds === 'driving_to_customer' || ds === 'picked_up') {
    return `your food is on the way. ${driver} is heading to you now.`;
  }
  if (ds === 'order_purchased' || ds === 'purchased') {
    return `${driver} picked up your order from ${restaurantName} 🎉`;
  }
  if (ds === 'arrived_at_restaurant') {
    return `${driver} arrived at ${restaurantName} and is picking up your food.`;
  }
  if (ds === 'en_route_to_restaurant' || ds === 'driving_to_restaurant') {
    return `${driver} is on the way to ${restaurantName}.`;
  }
  if (s === 'accepted' || ds === 'accepted') {
    return `${driver} accepted your order and is heading to the restaurant.`;
  }
  if (s === 'pending_driver' || ds === 'searching_driver') {
    return `finding the closest driver for you...`;
  }
  if (s === 'paid' || s === 'payment_confirmed') {
    return `payment confirmed 🖤 dispatching your order now.`;
  }
  return null;
}

// ── Main hook ──────────────────────────────────────────────────────────────

type Props = {
  uid: string | null;
  userCoords: { lat: number; lng: number } | null;
  city: string | null;
  savedAddress: EmoOrderAddressDraft | null;
  userName: string | null;
};

export function useEmoOrderFlow({ uid, userCoords, city, savedAddress, userName }: Props) {
  const [phase, setPhase] = useState<EmoOrderPhase>('greeting');
  const [messages, setMessages] = useState<EmoOrderChatMessage[]>([]);
  const [restaurants, setRestaurants] = useState<EmoOrderRestaurantOption[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<EmoOrderRestaurantOption | null>(null);
  const [mealSuggestions, setMealSuggestions] = useState<EmoOrderMealSuggestion[]>([]);
  const [meal, setMeal] = useState<EmoOrderMealDraft | null>(null);
  const [address, setAddress] = useState<EmoOrderAddressDraft | null>(savedAddress);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [pricing, setPricing] = useState<EmoOrderPricing | null>(null);
  const [paying, setPaying] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [trackingStatus, setTrackingStatus] = useState<EmoOrderTrackingStatus | null>(null);

  const phaseRef = useRef(phase);
  const restaurantRef = useRef(selectedRestaurant);
  const seenTrackingStatuses = useRef(new Set<string>());
  const trackingUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { restaurantRef.current = selectedRestaurant; }, [selectedRestaurant]);

  // ── Append helpers ─────────────────────────────────────────────────────

  const appendMsg = useCallback((msg: EmoOrderChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const appendAi = useCallback(
    (text: string | null, extra?: Partial<Omit<EmoOrderChatMessage, 'id' | 'role' | 'createdAtMs'>>) => {
      appendMsg(aiMsg(text, extra));
    },
    [appendMsg],
  );

  // Simulates AI "typing" then appends — premium feel
  const appendAiWithDelay = useCallback(
    (text: string, delayMs = 800, extra?: Partial<Omit<EmoOrderChatMessage, 'id' | 'role' | 'createdAtMs'>>) => {
      return new Promise<void>((resolve) => {
        setAiTyping(true);
        setTimeout(() => {
          setAiTyping(false);
          appendMsg(aiMsg(text, extra));
          resolve();
        }, delayMs);
      });
    },
    [appendMsg],
  );

  // ── Start greeting ─────────────────────────────────────────────────────

  useEffect(() => {
    const name = userName?.trim();
    const greeting = name
      ? `hey ${name} 🖤 what are you feeling like today?`
      : `hey 🖤 what are you craving today?`;
    setTimeout(() => {
      appendAi(greeting);
    }, 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Restaurant search ──────────────────────────────────────────────────

  const runRestaurantSearch = useCallback(
    async (cuisineQuery?: string) => {
      // ── Diagnostic: log all inputs before search ────────────────────────
      console.log('[EmoOrder][Flow] runRestaurantSearch called', {
        cuisineQuery: cuisineQuery ?? null,
        city,
        hasCoords: !!userCoords,
        lat: userCoords?.lat?.toFixed(5) ?? null,
        lng: userCoords?.lng?.toFixed(5) ?? null,
      });

      if (!userCoords) {
        console.warn('[EmoOrder][Flow] No userCoords — cannot search restaurants');
        appendAi(`i need your location to find restaurants near you. please enable location access and try again.`);
        return;
      }

      setPhase('searching_restaurants');
      appendAi(`i'm finding great spots near you...`);
      setAiTyping(true);

      const coords = { latitude: userCoords.lat, longitude: userCoords.lng };

      let results: EmoOrderRestaurantOption[] = [];
      let searchError: unknown = null;
      try {
        if (cuisineQuery) {
          console.log('[EmoOrder][Flow] Trying cuisine-specific search:', cuisineQuery);
          results = await searchRestaurantsForConcierge(cuisineQuery, coords, city);
          console.log('[EmoOrder][Flow] Cuisine search returned', results.length, 'results');
        }
        if (results.length === 0) {
          console.log('[EmoOrder][Flow] Falling back to general nearby search');
          results = await findNearbyRestaurantsForConcierge(coords, city, cuisineQuery);
          console.log('[EmoOrder][Flow] General nearby search returned', results.length, 'results');
        }
      } catch (err) {
        searchError = err;
        console.error('[EmoOrder][Flow] Search threw an error:', err);
        results = [];
      }

      setAiTyping(false);

      // ── Diagnostic: log final outcome ───────────────────────────────────
      console.log('[EmoOrder][Flow] Search complete', {
        cuisineQuery: cuisineQuery ?? null,
        resultCount: results.length,
        names: results.map((r) => r.name),
        searchError: searchError ? String(searchError) : null,
      });

      if (results.length === 0) {
        console.warn('[EmoOrder][Flow] Zero results — user will see fallback message', {
          userCoords,
          city,
          cuisineQuery,
        });
        appendAi(`i couldn't find open spots near you right now. try a different search or check your location settings?`);
        setPhase('greeting');
        return;
      }

      setRestaurants(results);
      setPhase('restaurant_selection');

      const richData: EmoRestaurantsRichData = { restaurants: results };
      appendAi(
        results.length === 1
          ? `found a great option nearby ✨`
          : `found ${results.length} excellent spots near you ✨`,
        { richType: 'restaurants', richData },
      );
    },
    [userCoords, city, appendAi],
  );

  // ── Restaurant selected ────────────────────────────────────────────────

  const selectRestaurant = useCallback(
    async (restaurant: EmoOrderRestaurantOption) => {
      if (phaseRef.current !== 'restaurant_selection') return;
      setSelectedRestaurant(restaurant);
      setPhase('collecting_meal');

      appendMsg(userMsg(restaurant.name));

      const suggestions = getMealSuggestionsForRestaurant(restaurant.name, restaurant.placeType);
      setMealSuggestions(suggestions);

      await appendAiWithDelay(
        `great choice 🖤 ${restaurant.name} is one of the highest-rated spots near you.`,
        600,
      );

      // Show reviews card if we have review data
      if (restaurant.rating != null && restaurant.reviews.length > 0) {
        const themes = extractKeywordThemes(restaurant.reviews);
        const reviewsData: EmoReviewsRichData = {
          restaurantName: restaurant.name,
          rating: restaurant.rating,
          reviewCount: restaurant.reviewCount ?? restaurant.reviews.length,
          reviews: restaurant.reviews,
          keywordThemes: themes,
        };
        appendAi(null, { richType: 'reviews', richData: reviewsData });
        await new Promise<void>((r) => setTimeout(r, 400));
      }

      const richData: EmoMealSuggestionsRichData = {
        restaurantName: restaurant.name,
        suggestions,
      };
      await appendAiWithDelay(
        `here are some popular dish types for this cuisine. for the exact order, use the button below to enter the item from their actual menu 🖤`,
        800,
        { richType: 'meal_suggestions', richData },
      );
    },
    [appendMsg, appendAiWithDelay, appendAi],
  );

  // ── Meal selection ─────────────────────────────────────────────────────

  const selectMeal = useCallback(
    async (suggestion: EmoOrderMealSuggestion) => {
      if (phaseRef.current !== 'collecting_meal') return;
      const draft: EmoOrderMealDraft = {
        mealName: suggestion.name,
        estimatedPrice: suggestion.estimatedPrice,
        quantity: 1,
        notes: '',
      };
      setMeal(draft);
      appendMsg(userMsg(`${suggestion.emoji} ${suggestion.name}`));
      await moveThroughMealConfirmed(draft);
    },
    [appendMsg], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const confirmCustomMeal = useCallback(
    async (draft: EmoOrderMealDraft) => {
      if (phaseRef.current !== 'collecting_meal') return;
      setMeal(draft);
      appendMsg(userMsg(draft.mealName));
      await moveThroughMealConfirmed(draft);
    },
    [appendMsg], // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function moveThroughMealConfirmed(draft: EmoOrderMealDraft) {
    // Build address step
    if (savedAddress) {
      setAddress(savedAddress);
      setPhase('confirming_address');
      await appendAiWithDelay(`perfect 🖤`, 500);

      const richData: EmoAddressConfirmRichData = {
        address: savedAddress.address,
        lat: savedAddress.lat,
        lng: savedAddress.lng,
      };
      await appendAiWithDelay(
        `deliver to your saved address?`,
        700,
        { richType: 'address_confirm', richData },
      );
    } else {
      setPhase('confirming_address');
      // richType 'address_confirm' with null savedAddress prop renders EmoOrderAddressInput
      await appendAiWithDelay(`perfect. where should i deliver this?`, 700, {
        richType: 'address_confirm',
        richData: { address: null, lat: null, lng: null },
      });
    }

    // Pre-compute pricing while user is reading address step
    const p = quoteEmoOrderPricing(draft);
    setPricing(p);
  }

  // ── Address confirmed ──────────────────────────────────────────────────

  const confirmAddress = useCallback(
    async (confirmedAddress: EmoOrderAddressDraft) => {
      if (phaseRef.current !== 'confirming_address') return;
      setAddress(confirmedAddress);
      setPhase('showing_summary');

      const restaurant = restaurantRef.current;
      const currentMeal = meal;
      const currentPricing = pricing ?? (currentMeal ? quoteEmoOrderPricing(currentMeal) : null);

      if (!restaurant || !currentMeal || !currentPricing) return;

      appendMsg(userMsg(confirmedAddress.address));
      await appendAiWithDelay(`alright. here's what i've put together for you 🖤`, 800);

      const richData: EmoSummaryRichData = {
        restaurant,
        meal: currentMeal,
        address: confirmedAddress,
        pricing: currentPricing,
      };
      appendAi(null, { richType: 'summary', richData });
    },
    [meal, pricing, appendMsg, appendAiWithDelay, appendAi],
  );

  // ── Payment ────────────────────────────────────────────────────────────

  const pay = useCallback(async () => {
    const restaurant = restaurantRef.current;
    const currentMeal = meal;
    const currentAddress = address;

    if (!restaurant || !currentMeal || !currentAddress) return;
    if (paying) return;

    // ── Pre-payment validation (authoritative second gate) ────────────────
    // First gate: open/closed filter during restaurant discovery (emoOrderRestaurant.ts).
    // Second gate (here): re-validate immediately before charging — the restaurant
    // may have closed while the user was browsing. This is the definitive check.
    // No order is created and no driver is assigned if this check fails.
    setPaying(true);
    if (restaurant.placeId) {
      const validation = await validateRestaurantIsOpen(restaurant.placeId);
      if (!validation.open) {
        setPaying(false);
        await appendAiWithDelay(
          `hold on 🖤 ${validation.reason} let me find you a nearby option that's open right now.`,
          500,
        );
        // Reset to search — do NOT create order, do NOT assign driver
        setPhase('searching_restaurants');
        setSelectedRestaurant(null);
        void runRestaurantSearch();
        return;
      }
    } else {
      // No placeId available — cannot validate. Log a warning but allow through
      // since the restaurant was confirmed open during discovery enrichment.
      console.warn('[EmoOrder] Pre-payment validation skipped: no placeId for', restaurant.name);
    }

    setPhase('paying');

    const result = await createAndPayEmoOrder(restaurant, currentMeal, currentAddress);
    setPaying(false);

    if (result.status === 'cancelled') {
      setPhase('showing_summary');
      return;
    }

    if (result.status === 'failed') {
      setPhase('payment_failed');
      await appendAiWithDelay(
        `payment didn't go through — ${result.message}. want to try again?`,
        400,
      );
      setPhase('showing_summary');
      return;
    }

    // success
    const id = result.orderId;
    setOrderId(id);
    setPhase('tracking');

    await appendAiWithDelay(`payment confirmed 🖤`, 400);
    await appendAiWithDelay(`finding the closest driver now...`, 600);

    const richData: EmoTrackingRichData = { orderId: id };
    appendAi(null, { richType: 'tracking', richData });

    // Subscribe to live order updates
    subscribeToOrder(id, restaurant.name);
  }, [meal, address, paying, appendAiWithDelay, appendAi, runRestaurantSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live order tracking ────────────────────────────────────────────────

  const subscribeToOrder = useCallback(
    (id: string, restaurantName: string) => {
      // Clean up any previous subscription
      if (trackingUnsubRef.current) {
        trackingUnsubRef.current();
        trackingUnsubRef.current = null;
      }

      const unsub = subscribeCustomerOrderById(
        id,
        (order) => {
          if (!order) return;

          const status = order.status ?? '';
          const ds = order.deliveryStatus ?? null;
          const sig = `${status}|${ds}`;

          // Update tracking card data
          setTrackingStatus({
            status,
            deliveryStatus: ds,
            paymentStatus: order.paymentStatus ?? null,
            driverName: order.driver?.name ?? order.driverName ?? null,
            driverPhone: order.driver?.phone ?? order.driverPhone ?? null,
            etaMinutes: typeof (order as Record<string, unknown>).etaMinutes === 'number' ? (order as Record<string, unknown>).etaMinutes as number : null,
            driverLocation: order.driverLocation
              ? { lat: order.driverLocation.lat, lng: order.driverLocation.lng }
              : null,
            restaurantLocation: order.restaurantLocation
              ? { lat: order.restaurantLocation.lat, lng: order.restaurantLocation.lng }
              : null,
            deliveryLocation: order.deliveryLocation
              ? { lat: order.deliveryLocation.lat, lng: order.deliveryLocation.lng }
              : null,
          });

          if (seenTrackingStatuses.current.has(sig)) return;
          seenTrackingStatuses.current.add(sig);

          const driverName = order.driver?.name ?? order.driverName ?? null;
          const msg = trackingStatusMessage(status, ds, driverName, restaurantName);
          if (msg) {
            setAiTyping(true);
            setTimeout(() => {
              setAiTyping(false);
              appendAi(msg);
            }, 700);
          }

          const delivered =
            ds === 'delivered' || status === 'delivered' || status === 'completed';
          if (delivered) {
            setPhase('delivered');
            setTimeout(() => {
              appendAi(`hope that hit the spot. come back anytime 🖤`);
            }, 2000);
          }
        },
        { onListenError: () => {} },
      );

      trackingUnsubRef.current = unsub;
    },
    [appendAi],
  );

  useEffect(() => {
    return () => {
      if (trackingUnsubRef.current) {
        trackingUnsubRef.current();
      }
    };
  }, []);

  // ── User message handling ──────────────────────────────────────────────

  const sendUserMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const currentPhase = phaseRef.current;

      // Only handle text input in phases where it makes sense
      if (currentPhase === 'greeting' || currentPhase === 'searching_restaurants') {
        appendMsg(userMsg(trimmed));
        const cuisine = detectCuisineFromMessage(trimmed);
        const isFood = detectFoodIntent(trimmed) || cuisine !== null;

        if (isFood) {
          await runRestaurantSearch(cuisine ?? undefined);
        } else {
          await appendAiWithDelay(
            `tell me what you're craving and i'll find the perfect spot near you 🖤`,
            600,
          );
        }
        return;
      }

      if (currentPhase === 'restaurant_selection') {
        appendMsg(userMsg(trimmed));
        const cuisine = detectCuisineFromMessage(trimmed);
        if (cuisine) {
          await appendAiWithDelay(`searching for ${cuisine}...`, 400);
          await runRestaurantSearch(cuisine);
        } else {
          await appendAiWithDelay(`tap one of the options above to select a restaurant 🖤`, 500);
        }
        return;
      }

      if (currentPhase === 'collecting_meal') {
        // User typed a custom meal — show form to capture name + price from actual menu
        appendMsg(userMsg(trimmed));
        await appendAiWithDelay(
          `got it. fill in the details from the restaurant's menu 🖤`,
          600,
          { richType: 'meal_form', richData: { prefillName: trimmed } },
        );
        return;
      }

      if (currentPhase === 'tracking' || currentPhase === 'delivered') {
        appendMsg(userMsg(trimmed));
        await appendAiWithDelay(`tracking your order. it's on its way 🖤`, 400);
        return;
      }

      // Default: acknowledge
      appendMsg(userMsg(trimmed));
      await appendAiWithDelay(`got it 🖤`, 400);
    },
    [appendMsg, appendAiWithDelay, runRestaurantSearch],
  );

  // ── Start search externally (from empty state quick action) ───────────

  const startSearch = useCallback(
    async (query?: string) => {
      if (phaseRef.current !== 'greeting' && phaseRef.current !== 'restaurant_selection') return;
      await runRestaurantSearch(query);
    },
    [runRestaurantSearch],
  );

  // ── Show meal form inline (called from "Enter from restaurant's menu" CTA) ──

  const showMealForm = useCallback(
    (prefillName?: string) => {
      if (phaseRef.current !== 'collecting_meal') return;
      appendAi(
        null,
        { richType: 'meal_form', richData: { prefillName: prefillName ?? '' } },
      );
    },
    [appendAi],
  );

  return {
    // State
    phase,
    messages,
    aiTyping,
    restaurants,
    selectedRestaurant,
    mealSuggestions,
    meal,
    address,
    orderId,
    pricing,
    paying,
    trackingStatus,
    // Actions
    sendUserMessage,
    startSearch,
    selectRestaurant,
    selectMeal,
    confirmCustomMeal,
    confirmAddress,
    pay,
    showMealForm,
  };
}
