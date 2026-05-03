import { FoodCardPaymentDisclaimer } from './FoodCardPaymentDisclaimer';
import { AIDescription } from './AIDescription';
import React from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export type FoodSwipeCardDetailsProps = {
  title: string;
  aiDescription?: string | null;
  priceLine: string;
  restaurantName: string;
  locationLine: string;
  /** null = hide timer row */
  timerText: string | null;
  joinLabel: string;
  matchDeckHint: 'joined' | 'waiting' | 'open' | null;
  uid?: string;
  joinPrimaryDisabled: boolean;
  joining: boolean;
  hostPhoto: string | null | undefined;
  hostName: string | undefined;
  showHostRow: boolean;
  onPressDetails: () => void;
  onPressJoin: () => void;
};

/**
 * Static body of the swipe card (no PanResponder / Animated).
 * Memoized to avoid re-rendering text when only pan values change.
 */
export const FoodSwipeCardDetails = React.memo(function FoodSwipeCardDetails({
  title,
  aiDescription,
  priceLine,
  restaurantName,
  locationLine,
  timerText,
  joinLabel,
  matchDeckHint,
  uid,
  joinPrimaryDisabled,
  joining,
  hostPhoto,
  hostName,
  showHostRow,
  onPressDetails,
  onPressJoin,
}: FoodSwipeCardDetailsProps) {
  return (
    <>
      <Text style={styles.cardTitle} numberOfLines={2} ellipsizeMode="tail">
        {title}
      </Text>
      <AIDescription
        description={aiDescription}
        title={title}
        compact
        numberOfLines={2}
      />
      <Text style={styles.meta} numberOfLines={1} ellipsizeMode="tail">
        {priceLine}
      </Text>
      <Text style={styles.meta} numberOfLines={1} ellipsizeMode="tail">
        {restaurantName}
      </Text>
      <Text style={styles.meta} numberOfLines={2} ellipsizeMode="tail">
        {locationLine}
      </Text>
      <FoodCardPaymentDisclaimer style={styles.cardDisclaimer} />
      {timerText ? <Text style={styles.timer}>{timerText}</Text> : null}
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={onPressDetails}
        style={styles.detailsBtn}
      >
        <Text style={styles.detailsBtnText}>View details →</Text>
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={joinPrimaryDisabled}
        onPress={onPressJoin}
        style={[styles.inlineJoinBtn, joinPrimaryDisabled && styles.inlineJoinBtnDisabled]}
      >
        {joining ? (
          <ActivityIndicator color="#07241A" />
        ) : (
          <Text style={styles.inlineJoinText}>{joinLabel}</Text>
        )}
      </TouchableOpacity>
      {!uid ? (
        <Text style={styles.waitingText}>
          Sign in to join this share and get matched with a partner.
        </Text>
      ) : matchDeckHint === 'joined' ? (
        <View style={[styles.matchPill, styles.matchPillJoined]}>
          <Text style={styles.matchPillText}>You’re in — open details for your order</Text>
        </View>
      ) : matchDeckHint === 'waiting' ? (
        <View style={[styles.matchPill, styles.matchPillWaiting]}>
          <Text style={styles.matchPillText}>Someone’s waiting — join to complete the pair</Text>
        </View>
      ) : matchDeckHint === 'open' ? (
        <View style={styles.matchPill}>
          <Text style={styles.matchPillText}>Be the first to join this share</Text>
        </View>
      ) : showHostRow ? (
        <View style={styles.hostRow}>
          {hostPhoto ? (
            <Image source={{ uri: hostPhoto }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]} />
          )}
          <Text style={styles.hostName} numberOfLines={1}>
            {hostName}
          </Text>
        </View>
      ) : (
        <Text style={styles.waitingText}>Join to create an order and get matched.</Text>
      )}
    </>
  );
});

const styles = StyleSheet.create({
  cardTitle: { color: '#F8FAFC', fontSize: 19, fontWeight: '800', lineHeight: 24 },
  meta: { color: 'rgba(248,250,252,0.7)', marginTop: 4, fontSize: 13, lineHeight: 18 },
  cardDisclaimer: { alignSelf: 'stretch' },
  timer: { color: '#34D399', marginTop: 6, fontWeight: '700', fontSize: 13 },
  detailsBtn: {
    marginTop: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.45)',
    backgroundColor: 'rgba(52, 211, 153, 0.08)',
  },
  detailsBtnText: { color: '#6EE7B7', fontWeight: '800', fontSize: 14 },
  hostRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1f2937' },
  avatarPlaceholder: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  hostName: { color: '#D1FAE5', fontWeight: '700', flex: 1 },
  matchPill: {
    marginTop: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(148,163,184,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
  },
  matchPillWaiting: {
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderColor: 'rgba(251,191,36,0.35)',
  },
  matchPillJoined: {
    backgroundColor: 'rgba(52,211,153,0.14)',
    borderColor: 'rgba(52,211,153,0.35)',
  },
  matchPillText: {
    color: 'rgba(248,250,252,0.92)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 17,
  },
  waitingText: { color: 'rgba(248,250,252,0.72)', marginTop: 6, fontWeight: '600', fontSize: 13 },
  inlineJoinBtn: {
    marginTop: 10,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#34D399',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineJoinBtnDisabled: { opacity: 0.45 },
  inlineJoinText: { color: '#07241A', fontWeight: '800', fontSize: 15 },
});
