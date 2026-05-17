import type { SwipeFoodCard as SwipeFoodCardType } from '@/types/swipe';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  card: SwipeFoodCardType;
};

function SwipeFoodCardInner({ card }: Props) {
  const activity =
    card.recentJoiners.length > 0
      ? `${card.recentJoiners[0]} joined recently`
      : card.peopleJoined > 1
        ? `${card.peopleJoined} people interested`
        : 'Be the first to split this order';

  return (
    <View style={styles.face}>
      <Image
        source={{ uri: card.heroImageUri }}
        style={styles.hero}
        contentFit="cover"
        transition={280}
      />
      <LinearGradient
        colors={[
          'transparent',
          'rgba(0,0,0,0.2)',
          'rgba(0,0,0,0.75)',
          'rgba(0,0,0,0.95)',
        ]}
        locations={[0, 0.35, 0.72, 1]}
        style={styles.gradient}
      />

      <View style={styles.livePill}>
        <View style={styles.liveDot} />
        <Text style={styles.liveTxt}>Live nearby</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.restaurant} numberOfLines={1}>
          {card.restaurantName}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {card.title}
        </Text>
        <Text style={styles.split}>{card.splitPriceLabel}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>Arrives in {card.time}</Text>
          <Text style={styles.dot}> · </Text>
          <Text style={styles.meta}>{card.distance}</Text>
        </View>

        <View style={styles.social}>
          <View style={styles.avatarStack}>
            {[card.userAvatar, null, null].map((uri, i) => (
              <View
                key={i}
                style={[
                  styles.avatar,
                  { marginLeft: i === 0 ? 0 : -10, zIndex: 3 - i },
                ]}
              >
                {uri ? (
                  <Image source={{ uri }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatarPh}>
                    <Text style={styles.avatarPhTxt}>
                      {(card.recentJoiners[i] ?? card.userName).slice(0, 1)}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
          <View style={styles.socialCopy}>
            <Text style={styles.activity}>{activity}</Text>
            <Text style={styles.spots}>
              {card.spotsLeft <= 0
                ? 'Full'
                : `${card.spotsLeft} spot${card.spotsLeft === 1 ? '' : 's'} left`}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export const SwipeFoodCard = memo(SwipeFoodCardInner);

const styles = StyleSheet.create({
  face: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#141820',
  },
  hero: { ...StyleSheet.absoluteFillObject },
  gradient: { ...StyleSheet.absoluteFillObject },
  livePill: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#06C167',
  },
  liveTxt: { fontSize: 12, fontWeight: '800', color: '#FFF' },
  body: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 22,
    paddingTop: 48,
  },
  restaurant: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  split: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: '900',
    color: '#7DFFB8',
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  meta: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.82)' },
  dot: { color: 'rgba(255,255,255,0.5)' },
  social: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    gap: 12,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#1a1a22',
    overflow: 'hidden',
    backgroundColor: '#333',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarPh: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#444',
  },
  avatarPhTxt: { color: '#FFF', fontWeight: '900', fontSize: 14 },
  socialCopy: { flex: 1, minWidth: 0 },
  activity: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  spots: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
  },
});
