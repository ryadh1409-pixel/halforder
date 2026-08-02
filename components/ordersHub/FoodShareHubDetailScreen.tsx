import { FoodShareInviteButton } from '@/components/foodShare/FoodShareInviteButton';
import { FoodShareHubCard } from '@/components/ordersHub/FoodShareHubCard';
import { FoodSharePricingCard } from '@/components/foodShare/FoodSharePricingCard';
import { OrderFeedbackModal } from '@/components/feedback/OrderFeedbackModal';
import type { OrderFeedbackPayload } from '@/components/feedback/OrderFeedbackModal';
import { hasSubmittedFeedback, submitOrderFeedback } from '@/services/feedback/orderFeedbackService';
import { formatPaidAtLabel } from '@/lib/orderReceipt';
import { receiptNumberFromId } from '@/lib/orderPricing';
import { SwipeCinematicBackground } from '@/components/swipe/SwipeCinematicBackground';
import {
  HUB_STATUS_META,
  hubItemFromMatch,
  hubItemFromWaiting,
  type FoodShareHubItem,
} from '@/lib/ordersHubStatus';
import {
  resolvePickupOrDeliveryLabel,
  resolveShareDateLabel,
  resolveShareTimeLabel,
} from '@/lib/foodShareInvite';
import { foodShareLifecycleLabel } from '@/lib/foodShareLifecycle';
import { USER_ROUTES } from '@/lib/navigationPaths';
import { formatFirestoreTime } from '@/lib/admin/orderHelpers';
import { mapMatchDoc } from '@/services/foodShareMatchService';
import { auth, db } from '@/services/firebase';
import type { MatchRequestDoc } from '@/types/foodShare';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { safeToMillis } from '@/utils/safeToMillis';

const c = theme.colors;

type TimelineStep = {
  key: string;
  label: string;
  done: boolean;
  atLabel: string;
};

function ParticipantRow({
  firstName,
  photoUrl,
  status,
}: {
  firstName: string;
  photoUrl: string | null;
  status: string;
}) {
  return (
    <View style={styles.participant}>
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={[styles.avatar, styles.avatarPh]}>
          <Ionicons name="person" size={18} color="#7D8493" />
        </View>
      )}
      <View style={styles.participantCopy}>
        <Text style={styles.participantName}>{firstName}</Text>
        <Text style={styles.participantStatus}>{status}</Text>
      </View>
    </View>
  );
}

function buildTimeline(item: FoodShareHubItem | null): TimelineStep[] {
  if (!item) return [];
  const joined = item.joinedAtMs ? formatFirestoreTime(item.joinedAtMs) : '—';
  const lc = String(item.lifecycle ?? '').toUpperCase();
  const matched = item.match != null;
  const paid =
    item.match &&
    Object.values(item.match.userPayments).some((p) => p.paymentStatus === 'PAID');
  const chat =
    lc === 'MATCHED' ||
    ['ORDER_PLACED', 'DRIVER_ASSIGNED', 'PICKED_UP', 'DELIVERED', 'COMPLETED'].includes(
      lc,
    );
  const driver = ['DRIVER_ASSIGNED', 'PICKED_UP', 'DELIVERED', 'COMPLETED'].includes(lc);
  const done = lc === 'COMPLETED' || lc === 'DELIVERED';

  return [
    { key: 'joined', label: 'Joined', done: true, atLabel: joined },
    { key: 'matched', label: 'Matched', done: matched, atLabel: matched ? 'Yes' : 'Pending' },
    { key: 'paid', label: 'Paid', done: !!paid, atLabel: paid ? 'Confirmed' : 'Pending' },
    { key: 'chat', label: 'Chat created', done: !!chat, atLabel: chat ? 'Active' : 'Pending' },
    { key: 'driver', label: 'Driver assigned', done: driver, atLabel: driver ? 'Assigned' : 'Pending' },
    { key: 'completed', label: 'Completed', done, atLabel: done ? 'Done' : 'Pending' },
  ];
}

function mapRequestDoc(id: string, adminFoodShareId: string, myUid: string, data: Record<string, unknown>): MatchRequestDoc {
  const statusRaw = String(data.status ?? 'WAITING').toUpperCase();
  const status =
    statusRaw === 'MATCHED' || statusRaw === 'CANCELLED' ? statusRaw : 'WAITING';
  return {
    id,
    adminFoodShareId,
    userId: myUid,
    userFirstName: typeof data.userFirstName === 'string' ? data.userFirstName : 'You',
    status,
    matchId: typeof data.matchId === 'string' ? data.matchId : null,
    createdAtMs: safeToMillis(data.createdAt),
  };
}

export function FoodShareHubDetailScreen({
  kind,
  id,
}: {
  kind: 'waiting' | 'match';
  id: string;
}) {
  const router = useRouter();
  const myUid = auth.currentUser?.uid ?? '';
  const [loading, setLoading] = useState(true);
  const [hubItem, setHubItem] = useState<FoodShareHubItem | null>(null);
  const [shareRaw, setShareRaw] = useState<Record<string, unknown> | null>(null);
  const [request, setRequest] = useState<MatchRequestDoc | null>(null);
  const [matchRaw, setMatchRaw] = useState<ReturnType<typeof mapMatchDoc> | null>(null);
  const [paymentRaw, setPaymentRaw] = useState<Record<string, unknown> | null>(
    null,
  );
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return undefined;
    }
    if (kind === 'waiting') {
      return onSnapshot(doc(db, 'adminFoodShares', id), (snap) => {
        setShareRaw(snap.exists() ? (snap.data() as Record<string, unknown>) : null);
      });
    }
    return onSnapshot(doc(db, 'matches', id), (snap) => {
      if (!snap.exists()) {
        setMatchRaw(null);
        setLoading(false);
        return;
      }
      const match = mapMatchDoc(snap.id, snap.data() as Record<string, unknown>);
      match.createdAtMs = safeToMillis((snap.data() as Record<string, unknown>).createdAt);
      setMatchRaw(match);
      setLoading(false);
    });
  }, [id, kind]);

  useEffect(() => {
    if (kind !== 'waiting' || !id || !myUid) return undefined;
    return onSnapshot(doc(db, 'matchRequests', `${id}_${myUid}`), (snap) => {
      if (!snap.exists()) {
        setRequest(null);
        setLoading(false);
        return;
      }
      setRequest(
        mapRequestDoc(snap.id, id, myUid, snap.data() as Record<string, unknown>),
      );
      setLoading(false);
    });
  }, [id, kind, myUid]);

  useEffect(() => {
    const shareId =
      kind === 'waiting' ? id : matchRaw?.adminFoodShareId ?? null;
    if (!shareId) return undefined;
    return onSnapshot(doc(db, 'adminFoodShares', shareId), (snap) => {
      setShareRaw(snap.exists() ? (snap.data() as Record<string, unknown>) : null);
    });
  }, [id, kind, matchRaw?.adminFoodShareId]);

  useEffect(() => {
    if (kind === 'waiting') {
      if (!request) {
        setHubItem(null);
        return;
      }
      setHubItem(hubItemFromWaiting({ request, shareRaw, myUid }));
      return;
    }
    if (!matchRaw) {
      setHubItem(null);
      return;
    }
    setHubItem(
      hubItemFromMatch({
        match: matchRaw,
        request: null,
        shareRaw,
        myUid,
      }),
    );
  }, [kind, matchRaw, myUid, request, shareRaw]);

  useEffect(() => {
    if (!myUid || kind !== 'match' || !id) {
      setPaymentRaw(null);
      return undefined;
    }
    return onSnapshot(doc(db, 'payments', `${id}_${myUid}`), (snap) => {
      setPaymentRaw(snap.exists() ? (snap.data() as Record<string, unknown>) : null);
    });
  }, [id, kind, myUid]);

  const timeline = useMemo(() => buildTimeline(hubItem), [hubItem]);

  // Check if user already left feedback for this match
  useEffect(() => {
    if (!myUid || kind !== 'match' || !id) return;
    hasSubmittedFeedback(id, myUid)
      .then(setAlreadyRated)
      .catch(() => setAlreadyRated(false));
  }, [id, kind, myUid]);
  const schedule = useMemo(() => {
    const raw = shareRaw ?? {};
    return {
      pickupOrDelivery: resolvePickupOrDeliveryLabel(raw),
      dateLabel: resolveShareDateLabel(raw),
      timeLabel: resolveShareTimeLabel(raw),
      address:
        typeof raw.pickupAddress === 'string'
          ? raw.pickupAddress
          : typeof raw.venueLocation === 'string'
            ? raw.venueLocation
            : '—',
    };
  }, [shareRaw]);

  const sharePricing = useMemo(
    () => matchRaw?.costBreakdown ?? null,
    [matchRaw?.costBreakdown],
  );

  const paidAtRaw = paymentRaw?.paidAt ?? null;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <SwipeCinematicBackground />
        <View style={styles.centered}>
          <ActivityIndicator color={c.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!hubItem) {
    return (
      <SafeAreaView style={styles.safe}>
        <SwipeCinematicBackground />
        <View style={styles.centered}>
          <Text style={styles.title}>Food share not found</Text>
          <Pressable
            style={styles.cta}
            onPress={() => router.replace(USER_ROUTES.ordersHub as never)}
          >
            <Text style={styles.ctaText}>Back to Orders</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const meta = HUB_STATUS_META[hubItem.status];
  const match = hubItem.match;
  const myParticipant =
    match && match.userA.uid === myUid ? match.userA : match?.userB;
  const partnerParticipant =
    match && match.userA.uid === myUid ? match.userB : match?.userA;

  const paymentStatusLabel =
    typeof paymentRaw?.paymentStatus === 'string'
      ? paymentRaw.paymentStatus
      : match?.userPayments?.[myUid]?.paymentStatus ?? '—';
  const stripeTxnId =
    (typeof paymentRaw?.stripePaymentIntentId === 'string' &&
      paymentRaw.stripePaymentIntentId) ||
    (typeof match?.userPayments?.[myUid]?.stripePaymentIntentId === 'string' &&
      match.userPayments[myUid]!.stripePaymentIntentId) ||
    null;
  const paymentMethodLabel =
    typeof paymentRaw?.paymentMethodBrand === 'string'
      ? `${String(paymentRaw.paymentMethodBrand)}${
          typeof paymentRaw.paymentMethodLast4 === 'string'
            ? ` •••• ${paymentRaw.paymentMethodLast4}`
            : ''
        }`
      : typeof paymentRaw?.paymentMethodType === 'string'
        ? String(paymentRaw.paymentMethodType)
        : 'Card';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <SwipeCinematicBackground />
      <ScrollView contentContainerStyle={styles.pad}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </Pressable>

        {hubItem.foodImageUrl ? (
          <Image source={{ uri: hubItem.foodImageUrl }} style={styles.hero} contentFit="cover" />
        ) : (
          <View style={[styles.hero, styles.heroPh]} />
        )}

        <Text style={styles.foodName}>{hubItem.foodName}</Text>
        <Text style={styles.restaurant}>{hubItem.restaurantName}</Text>
        <View style={styles.statusPill}>
          <Text style={styles.statusEmoji}>{meta.emoji}</Text>
          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>

        {shareRaw && typeof shareRaw.description === 'string' && shareRaw.description.trim() ? (
          <Text style={styles.description}>{shareRaw.description.trim()}</Text>
        ) : null}

        {sharePricing ? (
          <FoodSharePricingCard
            pricing={sharePricing}
            variant="receipt"
            showTax
            showSavings
            style={styles.receiptCard}
          />
        ) : (
          <View style={styles.receiptCard}>
            <Text style={styles.receiptFallback}>Receipt will appear after payment.</Text>
          </View>
        )}

        {sharePricing ? (
          <Section title="Receipt">
            <Row
              label="Receipt Number"
              value={receiptNumberFromId(hubItem.matchId ?? hubItem.hubId)}
            />
            <Row label="Payment Method" value={paymentMethodLabel} />
            <Row label="Payment Status" value={String(paymentStatusLabel)} />
            <Row label="Stripe Transaction ID" value={stripeTxnId ?? '—'} />
            <Row label="Paid At" value={formatPaidAtLabel(paidAtRaw)} />
          </Section>
        ) : null}

        {match ? (
          <Section title="Participants">
            <ParticipantRow
              firstName={myParticipant?.firstName ?? 'You'}
              photoUrl={myParticipant?.photoUrl ?? null}
              status={
                match.userPayments[myUid]?.paymentStatus === 'PAID' ? 'Paid' : 'Not paid yet'
              }
            />
            <ParticipantRow
              firstName={partnerParticipant?.firstName ?? 'Partner'}
              photoUrl={partnerParticipant?.photoUrl ?? null}
              status={
                partnerParticipant &&
                match.userPayments[partnerParticipant.uid]?.paymentStatus === 'PAID'
                  ? 'Paid'
                  : 'Not paid yet'
              }
            />
          </Section>
        ) : null}

        <Section title="Logistics">
          <Row label="Pickup or delivery" value={schedule.pickupOrDelivery} />
          <Row label="Address" value={schedule.address} />
          <Row
            label="Paid At"
            value={
              paidAtRaw
                ? (() => {
                    const ms = safeToMillis(paidAtRaw);
                    return ms != null ? formatFirestoreTime(ms) : '—';
                  })()
                : '—'
            }
          />
          {match ? (
            <Row label="Lifecycle" value={foodShareLifecycleLabel(match.lifecycle)} />
          ) : null}
        </Section>

        <Section title="Audit timeline">
          {timeline.map((step) => (
            <View key={step.key} style={styles.timelineRow}>
              <View
                style={[styles.timelineDot, step.done && styles.timelineDotDone]}
              />
              <View style={styles.timelineCopy}>
                <Text style={styles.timelineLabel}>{step.label}</Text>
                <Text style={styles.timelineAt}>{step.atLabel}</Text>
              </View>
            </View>
          ))}
        </Section>

        <FoodShareHubCard item={hubItem} />

        {hubItem.status === 'waiting_partner' && shareRaw ? (
          <FoodShareInviteButton
            adminFoodShareId={hubItem.adminFoodShareId}
            shareRaw={shareRaw}
            foodName={hubItem.foodName}
            restaurantName={hubItem.restaurantName}
            sharedPrice={hubItem.sharedPrice}
            deliveryShare={hubItem.deliveryShare}
            totalPerUser={hubItem.totalPerUser}
            pickupOrDelivery={schedule.pickupOrDelivery}
            dateLabel={schedule.dateLabel}
            timeLabel={schedule.timeLabel}
          />
        ) : null}

        {/* Feedback — only show for completed/delivered match orders */}
        {kind === 'match' &&
        match &&
        ['COMPLETED', 'DELIVERED'].includes(
          String(match.lifecycle ?? '').toUpperCase(),
        ) ? (
          alreadyRated ? (
            <View style={styles.feedbackDone}>
              <Text style={styles.feedbackDoneEmoji}>⭐</Text>
              <Text style={styles.feedbackDoneText}>
                You've already rated this order. Thank you!
              </Text>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.feedbackBtn,
                pressed && styles.feedbackBtnPressed,
              ]}
              onPress={() => setFeedbackOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Rate your experience"
            >
              <Text style={styles.feedbackBtnEmoji}>⭐</Text>
              <Text style={styles.feedbackBtnText}>Rate Your Experience</Text>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.6)" />
            </Pressable>
          )
        ) : null}
      </ScrollView>

      <OrderFeedbackModal
        visible={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        isPickup={schedule.pickupOrDelivery.toLowerCase().includes('pickup')}
        restaurantName={hubItem.restaurantName}
        onSubmit={async (payload: OrderFeedbackPayload) => {
          await submitOrderFeedback(id, myUid, hubItem.restaurantName, payload);
          setAlreadyRated(true);
          setFeedbackOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.rowValueBold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0B0816' },
  pad: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  hero: {
    width: '100%',
    height: 200,
    borderRadius: 20,
    marginBottom: 14,
    backgroundColor: '#1E2230',
  },
  heroPh: { opacity: 0.5 },
  foodName: { fontSize: 26, fontWeight: '900', color: '#FFF' },
  restaurant: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B7BDC9',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginTop: 12,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(23,25,35,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statusEmoji: { fontSize: 14 },
  statusText: { fontSize: 12, fontWeight: '800' },
  description: {
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 14,
  },
  receiptCard: {
    marginBottom: 12,
  },
  receiptFallback: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    padding: 16,
    textAlign: 'center',
  },
  section: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B7BDC9',
    textTransform: 'uppercase',
    marginBottom: 10,
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  rowLabel: { fontSize: 13, color: 'rgba(255,255,255,0.6)', flex: 1 },
  rowValue: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  rowValueBold: { fontSize: 15, fontWeight: '900' },
  participant: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1E2230' },
  avatarPh: { alignItems: 'center', justifyContent: 'center' },
  participantCopy: { flex: 1 },
  participantName: { fontSize: 14, fontWeight: '800', color: '#FFF' },
  participantStatus: { fontSize: 12, color: '#B7BDC9', marginTop: 2 },
  timelineRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  timelineDotDone: { backgroundColor: '#22C55E' },
  timelineCopy: { flex: 1 },
  timelineLabel: { fontSize: 13, fontWeight: '800', color: '#FFF' },
  timelineAt: { fontSize: 12, color: '#B7BDC9', marginTop: 2 },
  title: { fontSize: 20, fontWeight: '800', color: '#FFF' },
  cta: {
    backgroundColor: '#A855F7',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  ctaText: { color: '#FFF', fontWeight: '800' },
  feedbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(250,204,21,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.28)',
  },
  feedbackBtnPressed: { opacity: 0.75 },
  feedbackBtnEmoji: { fontSize: 20 },
  feedbackBtnText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#FFF',
  },
  feedbackDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
  },
  feedbackDoneEmoji: { fontSize: 18 },
  feedbackDoneText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#86EFAC',
  },
});
