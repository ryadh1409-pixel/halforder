import { db } from '@/services/firebase';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

type LatLng = { lat: number; lng: number };

function jitter(point: LatLng, spread = 0.004): LatLng {
  return {
    lat: point.lat + (Math.random() - 0.5) * spread,
    lng: point.lng + (Math.random() - 0.5) * spread,
  };
}

export async function seedDemoDataIfNeeded(): Promise<void> {
  const mealsSnap = await getDocs(query(collection(db, 'meals'), limit(1)));
  if (!mealsSnap.empty) return;
  const restaurantRef = await addDoc(collection(db, 'restaurants'), {
    name: 'HalfOrder Demo Kitchen',
    location: 'Downtown Toronto',
    locationCoords: { lat: 43.6532, lng: -79.3832 },
    ownerId: 'demo-host',
    isOpen: true,
    createdAt: serverTimestamp(),
  });
  await addDoc(collection(db, 'meals'), {
    restaurantId: restaurantRef.id,
    name: 'Pepperoni Pizza',
    fullPrice: 22,
    sharedPrice: 12,
    threshold: 3,
    isActive: true,
    createdAt: serverTimestamp(),
  });
  await addDoc(collection(db, 'meals'), {
    restaurantId: restaurantRef.id,
    name: 'Sushi Combo',
    fullPrice: 20,
    sharedPrice: 11,
    threshold: 2,
    isActive: true,
    createdAt: serverTimestamp(),
  });
  await addDoc(collection(db, 'drivers'), {
    name: 'Demo Driver',
    rating: 4.9,
    vehicle: 'Scooter',
    isOnline: true,
    currentLocation: { lat: 43.658, lng: -79.39 },
    activeOrderId: null,
    fcmToken: '',
    createdAt: serverTimestamp(),
  });
}

export async function runDemoSimulationTick(): Promise<void> {
  const waitingOrdersSnap = await getDocs(
    query(
      collection(db, 'orders'),
      where('status', '==', 'waiting'),
      orderBy('createdAt', 'desc'),
      limit(3),
    ),
  );
  for (const row of waitingOrdersSnap.docs) {
    const d = row.data() as Record<string, unknown>;
    const usersCount = typeof d.usersCount === 'number' ? d.usersCount : 0;
    const mealId = typeof d.mealId === 'string' ? d.mealId : '';
    if (!mealId) continue;
    const mealSnap = await getDocs(
      query(collection(db, 'meals'), where('__name__', '==', mealId), limit(1)),
    );
    const meal = mealSnap.docs[0]?.data() as Record<string, unknown> | undefined;
    const threshold = typeof meal?.threshold === 'number' ? meal.threshold : 2;
    const next = usersCount + 1;
    const updates: Record<string, unknown> = { usersCount: next, updatedAt: serverTimestamp() };
    if (next >= threshold) {
      updates.status = 'matched';
      updates.matchedAt = serverTimestamp();
    }
    await updateDoc(doc(db, 'orders', row.id), updates);
  }

  if (waitingOrdersSnap.empty) {
    const meals = await getDocs(query(collection(db, 'meals'), where('isActive', '==', true), limit(1)));
    const mealDoc = meals.docs[0];
    if (mealDoc) {
      const meal = mealDoc.data() as Record<string, unknown>;
      await addDoc(collection(db, 'orders'), {
        mealId: mealDoc.id,
        restaurantId: meal.restaurantId ?? '',
        users: ['demo-user-1'],
        usersCount: 1,
        status: 'waiting',
        createdAt: serverTimestamp(),
        userLocation: { lat: 43.662, lng: -79.395 },
      });
    }
  }

  const movingDeliveries = await getDocs(
    query(
      collection(db, 'deliveries'),
      where('status', 'in', ['accepted', 'picked_up', 'on_the_way']),
      limit(5),
    ),
  );
  for (const row of movingDeliveries.docs) {
    const d = row.data() as Record<string, unknown>;
    const current =
      (d.driverLocation as LatLng | undefined) ??
      ({ lat: 43.658, lng: -79.39 } as LatLng);
    const nextLoc = jitter(current);
    await updateDoc(doc(db, 'deliveries', row.id), {
      driverLocation: nextLoc,
      eta: Math.max(2, (typeof d.eta === 'number' ? d.eta : 15) - 1),
      updatedAt: serverTimestamp(),
    });
    const driverId = typeof d.driverId === 'string' ? d.driverId : '';
    if (driverId) {
      await updateDoc(doc(db, 'drivers', driverId), {
        currentLocation: nextLoc,
        updatedAt: serverTimestamp(),
      });
    }
  }
}
