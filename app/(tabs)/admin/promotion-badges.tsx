import { AdminHeader } from '@/components/admin/AdminHeader';
import { PromotionBadgeEditModal } from '@/components/admin/PromotionBadgeEditModal';
import { AppTextInput } from '@/components/AppTextInput';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import type { PromotionBadgeValue } from '@/lib/promotionBadge';
import {
  formatPromotionBadgeCurrent,
  isMenuItemPromotionTarget,
  isRestaurantPromotionTarget,
  savePromotionBadgeTarget,
  subscribePromotionBadgeTargets,
  type PromotionBadgeTarget,
} from '@/services/adminPromotionBadges';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { requireRole } from '@/utils/requireRole';
import { showError, showSuccess } from '@/utils/toast';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Section = {
  title: string;
  data: PromotionBadgeTarget[];
};

function matchesQuery(row: PromotionBadgeTarget, q: string): boolean {
  if (!q) return true;
  return (
    row.restaurantName.toLowerCase().includes(q) ||
    row.foodName.toLowerCase().includes(q) ||
    formatPromotionBadgeCurrent(row.promotionBadge).toLowerCase().includes(q)
  );
}

export default function AdminPromotionBadgesScreen() {
  const { authorized, loading: roleLoading } = requireRole(['admin']);
  const [rows, setRows] = useState<PromotionBadgeTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState('');
  const [editing, setEditing] = useState<PromotionBadgeTarget | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authorized) return undefined;
    const unsub = subscribePromotionBadgeTargets(
      (list) => {
        setRows(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [authorized]);

  const sections = useMemo((): Section[] => {
    const q = queryText.trim().toLowerCase();
    const restaurantRows = rows
      .filter(isRestaurantPromotionTarget)
      .filter((r) => matchesQuery(r, q));
    const menuRows = rows
      .filter(isMenuItemPromotionTarget)
      .filter((r) => matchesQuery(r, q));
    return [
      { title: 'Restaurant Promotions', data: restaurantRows },
      { title: 'Menu Item Promotions', data: menuRows },
    ];
  }, [rows, queryText]);

  const onSave = async (next: PromotionBadgeValue) => {
    if (!editing) return;
    setSaving(true);
    try {
      await savePromotionBadgeTarget(editing, next);
      showSuccess('Promotion badge saved.');
      setEditing(null);
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  if (roleLoading || !authorized) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Promotion Badges"
        subtitle="Restaurants and menu items"
        fallbackRoute={adminRoutes.home}
      />

      <View style={styles.searchWrap}>
        <AppTextInput
          style={styles.search}
          placeholder="Search restaurant or menu item…"
          placeholderTextColor={COLORS.textMuted}
          value={queryText}
          onChangeText={setQueryText}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            <Text style={styles.empty}>No restaurants or menu items found.</Text>
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          )}
          renderSectionFooter={({ section }) =>
            section.data.length === 0 ? (
              <Text style={styles.sectionEmpty}>
                {section.title === 'Menu Item Promotions'
                  ? 'No menu items found.'
                  : 'No restaurant promotions found.'}
              </Text>
            ) : null
          }
          renderItem={({ item }) => {
            const current = formatPromotionBadgeCurrent(item.promotionBadge);
            return (
              <View style={styles.card}>
                <Text style={styles.restaurant} numberOfLines={1}>
                  {item.restaurantName}
                </Text>
                <Text style={styles.food} numberOfLines={2}>
                  {item.foodName}
                </Text>
                <Text style={styles.currentLabel}>Current:</Text>
                <Text style={styles.currentValue}>{current}</Text>
                <Text style={styles.kind}>
                  {item.kind === 'foodShare'
                    ? `Food share · slot ${item.id}`
                    : item.kind === 'menuItem'
                      ? 'Menu item'
                      : 'Restaurant listing'}
                </Text>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => setEditing(item)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      <PromotionBadgeEditModal
        visible={editing != null}
        restaurantName={editing?.restaurantName ?? ''}
        foodName={editing?.foodName ?? ''}
        foodFieldLabel={
          editing?.kind === 'menuItem' ? 'Menu Item' : 'Food'
        }
        value={editing?.promotionBadge ?? 'none'}
        saving={saving}
        onCancel={() => {
          if (!saving) setEditing(null);
        }}
        onSave={onSave}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  search: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  list: { padding: 16, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 10,
    marginTop: 8,
  },
  sectionEmpty: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 16,
  },
  empty: {
    textAlign: 'center',
    color: COLORS.textMuted,
    marginTop: 32,
    fontSize: 15,
  },
  card: {
    ...adminCardShell,
    marginBottom: 12,
  },
  restaurant: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
  },
  food: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  currentLabel: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  currentValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  kind: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  editBtn: {
    marginTop: 14,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: {
    color: COLORS.onPrimary,
    fontWeight: '800',
    fontSize: 15,
  },
});
