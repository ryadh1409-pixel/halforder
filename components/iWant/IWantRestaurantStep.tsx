import {
  resolveRestaurantFromMapsLink,
  searchRestaurants,
  type RestaurantSearchOrigin,
} from '@/services/iWant/resolveRestaurant';
import {
  EMO_AI_PURPLE,
  EMO_AI_PURPLE_SOFT,
  EMO_AI_SURFACE,
} from '@/types/emoAi';
import type { IWantRestaurantDraft } from '@/types/iWant';
import { showError, showSuccess } from '@/utils/toast';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Props = {
  origin: RestaurantSearchOrigin | null;
  city: string | null;
  onSelect: (restaurant: IWantRestaurantDraft) => void;
};

function ratingStars(rating: number): string {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return `${'★'.repeat(full)}${'☆'.repeat(5 - full)}`;
}

function shortAddress(address: string | null | undefined): string {
  if (!address?.trim()) return '';
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return parts.join(', ');
  return parts.slice(0, 2).join(', ');
}

export function IWantRestaurantStep({ origin, city, onSelect }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<IWantRestaurantDraft[]>([]);
  const [searching, setSearching] = useState(false);
  const [mapsExpanded, setMapsExpanded] = useState(false);
  const [mapsLink, setMapsLink] = useState('');
  const [resolvingLink, setResolvingLink] = useState(false);

  const originStable = useMemo(() => {
    if (
      !origin ||
      !Number.isFinite(origin.latitude) ||
      !Number.isFinite(origin.longitude)
    ) {
      return null;
    }
    return origin;
  }, [origin]);

  const cityStable = useMemo(() => city?.trim() || null, [city]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return undefined;
    }

    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      void searchRestaurants(q, { origin: originStable, city: cityStable })
        .then((rows) => {
          if (!cancelled) setSearchResults(rows);
        })
        .catch(() => {
          if (!cancelled) setSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cityStable, originStable, searchQuery]);

  const handleResolveLink = useCallback(async () => {
    if (!mapsLink.trim()) {
      showError('Paste a Google Maps link first.');
      return;
    }
    setResolvingLink(true);
    try {
      const resolved = await resolveRestaurantFromMapsLink(mapsLink);
      showSuccess('Restaurant found');
      onSelect(resolved);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not resolve Maps link.');
    } finally {
      setResolvingLink(false);
    }
  }, [mapsLink, onSelect]);

  return (
    <View style={styles.section}>
      <Text style={styles.greeting}>Hi 👋</Text>
      <Text style={styles.title}>🍽️ Where would you like to order from?</Text>
      <Text style={styles.subtitle}>
        {cityStable
          ? `Search restaurants in ${cityStable}.`
          : 'Search any restaurant near you.'}
      </Text>

      <View style={styles.searchShell}>
        <Ionicons name="search" size={20} color="#C084FC" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search restaurant..."
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searching ? (
          <ActivityIndicator color={EMO_AI_PURPLE} size="small" />
        ) : searchQuery.length > 0 ? (
          <Pressable
            onPress={() => setSearchQuery('')}
            hitSlop={8}
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={18} color="#64748B" />
          </Pressable>
        ) : null}
      </View>

      {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 ? (
        <Text style={styles.emptyHint}>
          No restaurants found in your current city.
        </Text>
      ) : null}

      <View style={styles.results}>
        {searchResults.map((row, index) => (
          <Pressable
            key={`${row.placeId ?? row.name}-${row.address ?? index}`}
            style={({ pressed }) => [
              styles.card,
              index > 0 && styles.cardDivider,
              pressed && styles.cardPressed,
            ]}
            onPress={() => onSelect(row)}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="restaurant" size={18} color={EMO_AI_PURPLE} />
            </View>
            <View style={styles.cardCopy}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {row.name}
              </Text>
              {row.address ? (
                <Text style={styles.cardAddress} numberOfLines={1}>
                  {shortAddress(row.address)}
                </Text>
              ) : null}
              <View style={styles.metaRow}>
                {typeof row.rating === 'number' ? (
                  <Text style={styles.ratingTxt}>
                    {ratingStars(row.rating)}{' '}
                    <Text style={styles.ratingNum}>{row.rating.toFixed(1)}</Text>
                  </Text>
                ) : null}
                {row.placeType ? (
                  <Text style={styles.typeChip}>{row.placeType}</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.cardAside}>
              {row.distanceLabel ? (
                <Text style={styles.distance}>{row.distanceLabel}</Text>
              ) : null}
              <Ionicons name="chevron-forward" size={16} color="#64748B" />
            </View>
          </Pressable>
        ))}
      </View>

      <View style={styles.fallbackBlock}>
        <Pressable
          style={styles.fallbackToggle}
          onPress={() => setMapsExpanded((v) => !v)}
          accessibilityRole="button"
        >
          <Text style={styles.fallbackPrompt}>Can't find your restaurant?</Text>
          <Text style={styles.fallbackAction}>
            Paste a Google Maps link
            <Text style={styles.fallbackChevron}>
              {mapsExpanded ? ' ▲' : ' ▼'}
            </Text>
          </Text>
        </Pressable>

        {mapsExpanded ? (
          <View style={styles.mapsPanel}>
            <TextInput
              style={styles.mapsInput}
              placeholder="https://maps.google.com/…"
              placeholderTextColor="#64748B"
              value={mapsLink}
              onChangeText={setMapsLink}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              style={[styles.mapsBtn, resolvingLink && styles.btnDisabled]}
              disabled={resolvingLink}
              onPress={() => void handleResolveLink()}
            >
              {resolvingLink ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.mapsBtnTxt}>Use Maps link</Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 4 },
  greeting: {
    fontSize: 20,
    fontWeight: '800',
    color: '#E9D5FF',
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 32,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#B7BDC9',
    marginBottom: 18,
    lineHeight: 21,
  },
  searchShell: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(168, 85, 247, 0.45)',
    backgroundColor: EMO_AI_SURFACE,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: EMO_AI_PURPLE,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    paddingVertical: 14,
  },
  emptyHint: {
    marginTop: 14,
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  results: {
    marginTop: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  cardDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  cardPressed: {
    opacity: 0.72,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: EMO_AI_PURPLE_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCopy: { flex: 1, minWidth: 0 },
  cardTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  cardAddress: {
    marginTop: 3,
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  metaRow: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  ratingTxt: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  ratingNum: {
    color: '#E2E8F0',
    fontWeight: '700',
    letterSpacing: 0,
  },
  typeChip: {
    color: '#C4B5FD',
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  cardAside: {
    alignItems: 'flex-end',
    gap: 6,
  },
  distance: {
    color: '#A78BFA',
    fontSize: 12,
    fontWeight: '800',
  },
  fallbackBlock: {
    marginTop: 28,
    paddingTop: 8,
  },
  fallbackToggle: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  fallbackPrompt: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  fallbackAction: {
    color: '#C084FC',
    fontSize: 13,
    fontWeight: '800',
  },
  fallbackChevron: {
    color: '#64748B',
    fontWeight: '700',
  },
  mapsPanel: {
    marginTop: 10,
    gap: 10,
  },
  mapsInput: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.28)',
    backgroundColor: EMO_AI_SURFACE,
    paddingHorizontal: 14,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  mapsBtn: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(168, 85, 247, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapsBtnTxt: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  btnDisabled: { opacity: 0.55 },
});
