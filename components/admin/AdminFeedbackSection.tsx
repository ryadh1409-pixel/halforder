/**
 * AdminFeedbackSection
 *
 * Read-only inline section for the Admin Dashboard showing all customer
 * feedback submitted after completed orders. Each entry is enriched with
 * user profile data (name, email, photo) and food category from Firestore.
 *
 * READ-ONLY — no write operations.
 */
import { adminColors as COLORS } from '@/constants/adminTheme';
import {
  subscribeAdminFeedback,
  type AdminFeedbackEntry,
} from '@/services/adminFeedbackService';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// ─── Sub-components ───────────────────────────────────────────────────────────

function StarRow({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  if (value == null) return null;
  const filled = Math.round(value);
  return (
    <View style={s.starRow}>
      <Text style={s.starLabel}>{label}</Text>
      <View style={s.starsWrap}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Text key={n} style={[s.star, { color: n <= filled ? '#FBBF24' : 'rgba(255,255,255,0.15)' }]}>
            ★
          </Text>
        ))}
        <Text style={s.starNum}>{value}/5</Text>
      </View>
    </View>
  );
}

function Avatar({ name, photoUrl }: { name: string | null; photoUrl: string | null }) {
  const initials = name
    ? name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('')
    : '?';

  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={s.avatar}
        contentFit="cover"
      />
    );
  }
  return (
    <View style={[s.avatar, s.avatarInitials]}>
      <Text style={s.avatarText}>{initials}</Text>
    </View>
  );
}

function OrderTypeBadge({ type }: { type: string }) {
  const isHalf = type === 'halforder';
  return (
    <View style={[s.badge, isHalf ? s.badgeHalf : s.badgeFull]}>
      <Text style={[s.badgeTxt, isHalf ? s.badgeHalfTxt : s.badgeFullTxt]}>
        {isHalf ? 'HalfOrder' : 'FullOrder'}
      </Text>
    </View>
  );
}

function MetaRow({ icon, label, value }: { icon: string; label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={s.metaRow}>
      <Text style={s.metaIcon}>{icon}</Text>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function IdRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={s.idRow}>
      <Text style={s.idLabel}>{label}</Text>
      <Text style={s.idValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function FeedbackCard({ entry }: { entry: AdminFeedbackEntry }) {
  const date = entry.submittedAtMs
    ? new Date(entry.submittedAtMs).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <View style={s.card}>
      {/* ── Header: avatar + customer info + type badge ── */}
      <View style={s.cardHeader}>
        <Avatar name={entry.customerName} photoUrl={entry.customerPhotoUrl} />
        <View style={s.customerInfo}>
          <Text style={s.customerName} numberOfLines={1}>
            {entry.customerName ?? 'Unknown customer'}
          </Text>
          {entry.customerEmail ? (
            <Text style={s.customerEmail} numberOfLines={1}>
              {entry.customerEmail}
            </Text>
          ) : null}
        </View>
        <OrderTypeBadge type={entry.orderType} />
      </View>

      {/* ── Identifiers ── */}
      <View style={s.idsBlock}>
        <IdRow label="User ID" value={entry.userId || null} />
        {entry.orderType === 'halforder' ? (
          <IdRow label="Match ID" value={entry.orderId || null} />
        ) : (
          <IdRow label="Order ID" value={entry.orderId || null} />
        )}
        {entry.orderType === 'halforder' && entry.orderId && entry.orderId !== entry.orderId ? (
          <IdRow label="Order ID" value={entry.orderId} />
        ) : null}
        {entry.adminFoodShareId ? (
          <IdRow label="Food Card Slot" value={`#${entry.adminFoodShareId}`} />
        ) : null}
      </View>

      {/* ── Restaurant + Food category ── */}
      <View style={s.metaBlock}>
        <MetaRow icon="🏪" label="Restaurant" value={entry.restaurantName} />
        <MetaRow icon="🍽️" label="Food" value={entry.foodName} />
      </View>

      {/* ── Ratings ── */}
      <View style={s.ratingsBlock}>
        <StarRow label="Order" value={entry.orderRating || null} />
        <StarRow label="Restaurant" value={entry.restaurantRating || null} />
        <StarRow label="Driver" value={entry.driverRating} />
      </View>

      {/* ── Comment ── */}
      {entry.comment ? (
        <View style={s.commentBlock}>
          <Ionicons name="chatbubble-outline" size={12} color={COLORS.textMuted} style={{ marginRight: 4 }} />
          <Text style={s.commentText}>"{entry.comment}"</Text>
        </View>
      ) : null}

      {/* ── Footer: date ── */}
      {date ? (
        <Text style={s.dateText}>{date}</Text>
      ) : null}
    </View>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

type Props = {
  /** Called when the "View all" header button is pressed (navigate to full page). */
  onViewAll?: () => void;
};

export function AdminFeedbackSection({ onViewAll }: Props) {
  const [entries, setEntries] = useState<AdminFeedbackEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeAdminFeedback(
      (rows) => {
        setEntries(rows);
        setError(null);
      },
      (err) => setError(err.message),
    );
    return unsub;
  }, []);

  return (
    <View style={s.section}>
      {/* ── Section header ── */}
      <View style={s.sectionHeader}>
        <View style={s.sectionTitleRow}>
          <Text style={s.sectionTitle}>Customer Feedback</Text>
          {entries != null && entries.length > 0 ? (
            <View style={s.countBadge}>
              <Text style={s.countText}>{entries.length}</Text>
            </View>
          ) : null}
        </View>
        {onViewAll ? (
          <Pressable
            onPress={onViewAll}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="View all feedback"
          >
            <Text style={s.viewAll}>View all →</Text>
          </Pressable>
        ) : null}
      </View>

      {/* ── Summary stats (when entries loaded) ── */}
      {entries != null && entries.length > 0 ? (() => {
        const orderRatings = entries.map((e) => e.orderRating).filter(Boolean);
        const restRatings = entries.map((e) => e.restaurantRating).filter(Boolean);
        const driverRatings = entries
          .map((e) => e.driverRating)
          .filter((r): r is number => r != null);
        const avg = (nums: number[]) =>
          nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : '—';
        return (
          <View style={s.summaryRow}>
            <View style={s.summaryBox}>
              <Text style={s.summaryVal}>{entries.length}</Text>
              <Text style={s.summaryLabel}>Total</Text>
            </View>
            <View style={s.summaryBox}>
              <Text style={s.summaryVal}>{avg(orderRatings)} ★</Text>
              <Text style={s.summaryLabel}>Avg Order</Text>
            </View>
            <View style={s.summaryBox}>
              <Text style={s.summaryVal}>{avg(restRatings)} ★</Text>
              <Text style={s.summaryLabel}>Avg Rest.</Text>
            </View>
            <View style={s.summaryBox}>
              <Text style={s.summaryVal}>{avg(driverRatings)} ★</Text>
              <Text style={s.summaryLabel}>Avg Driver</Text>
            </View>
          </View>
        );
      })() : null}

      {/* ── Content ── */}
      {error ? (
        <View style={s.errorBox}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : entries == null ? (
        <View style={s.loadingBox}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={s.loadingText}>Loading feedback…</Text>
        </View>
      ) : entries.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyEmoji}>💬</Text>
          <Text style={s.emptyText}>No feedback yet</Text>
          <Text style={s.emptyHint}>Ratings will appear here after customers complete orders.</Text>
        </View>
      ) : (
        entries.map((entry) => (
          <FeedbackCard key={entry.id} entry={entry} />
        ))
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  section: {
    marginTop: 4,
    paddingBottom: 8,
  },

  // Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 0.2,
  },
  countBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 99,
    backgroundColor: 'rgba(168,85,247,0.18)',
    alignItems: 'center',
  },
  countText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
  },
  viewAll: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Summary
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 8,
    alignItems: 'center',
  },
  summaryVal: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // Card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 12,
  },

  // Card header: avatar + customer + badge
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    flexShrink: 0,
  },
  avatarInitials: {
    backgroundColor: 'rgba(168,85,247,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.primary,
  },
  customerInfo: {
    flex: 1,
    minWidth: 0,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  customerEmail: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textMuted,
    marginTop: 1,
  },

  // Badges
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 99,
    flexShrink: 0,
  },
  badgeTxt: { fontSize: 10, fontWeight: '800' },
  badgeHalf: { backgroundColor: 'rgba(109,40,217,0.20)' },
  badgeHalfTxt: { color: '#C084FC' },
  badgeFull: { backgroundColor: 'rgba(29,78,216,0.20)' },
  badgeFullTxt: { color: '#93C5FD' },

  // ID rows
  idsBlock: {
    gap: 3,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  idLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    width: 72,
    flexShrink: 0,
  },
  idValue: {
    fontSize: 10,
    fontWeight: '500',
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
    flex: 1,
  },

  // Meta rows
  metaBlock: {
    gap: 4,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaIcon: {
    fontSize: 13,
    width: 20,
    textAlign: 'center',
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    width: 68,
    flexShrink: 0,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },

  // Ratings
  ratingsBlock: {
    gap: 6,
    marginBottom: 10,
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  starLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    width: 68,
  },
  starsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  star: {
    fontSize: 15,
    lineHeight: 18,
  },
  starNum: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginLeft: 4,
  },

  // Comment
  commentBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    marginBottom: 8,
  },
  commentText: {
    flex: 1,
    fontSize: 13,
    fontStyle: 'italic',
    color: COLORS.text,
    lineHeight: 19,
  },

  // Date
  dateText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textMuted,
    textAlign: 'right',
  },

  // States
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyEmoji: { fontSize: 36, marginBottom: 10 },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  emptyHint: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    color: COLORS.error,
  },
});
