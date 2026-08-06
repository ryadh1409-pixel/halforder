/**
 * AdminFoodCardWithMatches
 *
 * Wraps AdminFoodCardTile and appends a live list of all matches for that
 * food card slot. The tile + matches are one visual unit — the tile header
 * is tappable (navigates to the card detail screen), each match row is
 * tappable (navigates to the card detail screen with the match context).
 *
 * This component owns its own Firestore listener (one per slot). The listener
 * is set up on mount and torn down on unmount — no duplicate listeners arise
 * as long as each slot renders exactly one instance of this component.
 */
import { AdminFoodCardTile } from '@/components/admin/AdminFoodCardTile';
import { AdminMatchEntry } from '@/components/admin/AdminMatchEntry';
import { adminColors as COLORS } from '@/constants/adminTheme';
import { subscribeMatchesByAdminFoodShare } from '@/services/adminFoodCardDetail';
import type { AdminFoodCardSlot } from '@/services/adminFoodCardSlots';
import type { FoodShareMatchDoc } from '@/types/foodShare';
import type { AdminFoodShareAvailabilityStatus } from '@/lib/adminFoodShareAvailability';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type AdminFoodCardWithMatchesProps = {
  slot: AdminFoodCardSlot;
  priceLabel: string;
  sharingPriceLabel?: string;
  availabilityStatus: AdminFoodShareAvailabilityStatus;
  configured: boolean;
  waitingUserName?: string | null;
  staleWaiting?: boolean;
  waitingElapsedLabel?: string | null;
  /** Navigate to the food card detail page (card header tapped). */
  onPressCard: () => void;
  /** Navigate to the food card detail page with match context. */
  onPressMatch: (match: FoodShareMatchDoc) => void;
};

export function AdminFoodCardWithMatches({
  slot,
  priceLabel,
  sharingPriceLabel,
  availabilityStatus,
  configured,
  waitingUserName,
  staleWaiting,
  waitingElapsedLabel,
  onPressCard,
  onPressMatch,
}: AdminFoodCardWithMatchesProps) {
  const [matches, setMatches] = useState<FoodShareMatchDoc[]>([]);

  useEffect(() => {
    const unsub = subscribeMatchesByAdminFoodShare(
      slot.docId,
      (rows) => setMatches(rows),
    );
    return unsub;
  }, [slot.docId]);

  const activeMatches = matches.filter(
    (m) => m.lifecycle !== 'CANCELLED',
  );
  const cancelledMatches = matches.filter(
    (m) => m.lifecycle === 'CANCELLED',
  );

  return (
    <View style={styles.card}>
      {/* Existing tile — tile body already handles its own press */}
      <AdminFoodCardTile
        cardId={slot.docId}
        title={slot.title || `Slot ${slot.docId}`}
        restaurantName={slot.restaurantName}
        imageUri={slot.image}
        priceLabel={priceLabel}
        sharingPriceLabel={sharingPriceLabel}
        availabilityStatus={availabilityStatus}
        configured={configured}
        waitingUserName={waitingUserName}
        staleWaiting={staleWaiting}
        waitingElapsedLabel={waitingElapsedLabel}
        onPress={onPressCard}
      />

      {/* Matches section — only rendered when matches exist */}
      {matches.length > 0 ? (
        <View style={styles.matchSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              MATCHES
            </Text>
            <Text style={styles.matchCount}>
              {activeMatches.length} active
              {cancelledMatches.length > 0
                ? ` · ${cancelledMatches.length} cancelled`
                : ''}
            </Text>
          </View>

          {/* Active matches first */}
          {activeMatches.map((m) => (
            <AdminMatchEntry
              key={m.id}
              match={m}
              onPress={() => onPressMatch(m)}
            />
          ))}

          {/* Cancelled matches collapsed below */}
          {cancelledMatches.length > 0 ? (
            <>
              <View style={styles.cancelledDivider}>
                <Text style={styles.cancelledLabel}>Cancelled</Text>
              </View>
              {cancelledMatches.map((m) => (
                <AdminMatchEntry
                  key={m.id}
                  match={m}
                  onPress={() => onPressMatch(m)}
                />
              ))}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  matchSection: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(168,85,247,0.06)',
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: COLORS.textMuted,
  },
  matchCount: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  cancelledDivider: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(239,68,68,0.06)',
  },
  cancelledLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#F87171',
  },
});
