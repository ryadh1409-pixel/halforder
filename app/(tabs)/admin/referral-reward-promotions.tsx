import { AdminHeader } from '@/components/admin/AdminHeader';
import { AppTextInput } from '@/components/AppTextInput';
import { ADMIN_FOOD_CARD_SLOT_IDS } from '@/constants/adminFoodCards';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { mapAdminFoodShareDoc } from '@/services/adminFoodSharesService';
import { db } from '@/services/firebase';
import {
  deleteSwipeReferralPromotion,
  loadSwipeReferralPromotionAnalytics,
  saveSwipeReferralPromotion,
  setSwipeReferralPromotionActive,
  subscribeSwipeReferralPromotions,
} from '@/services/swipeReferralPromotion';
import {
  defaultSwipeReferralBadgeText,
  type SwipeReferralPromotion,
  type SwipeReferralPromotionAnalytics,
} from '@/types/swipeReferralPromotion';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { requireRole } from '@/utils/requireRole';
import { showError, showSuccess } from '@/utils/toast';
import { documentId, onSnapshot, query, where, collection } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type CardOption = { id: string; label: string };

type Draft = {
  id?: string;
  name: string;
  discountPercent: string;
  startInput: string;
  endInput: string;
  active: boolean;
  maxRedemptions: string;
  cardIds: string[];
  badgeText: string;
};

const EMPTY: Draft = {
  name: '',
  discountPercent: '50',
  startInput: '',
  endInput: '',
  active: true,
  maxRedemptions: '',
  cardIds: [],
  badgeText: '',
};

function parseDateInput(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

function formatDate(ms: number | null): string {
  if (ms == null) return '—';
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function AdminReferralRewardPromotionsScreen() {
  const { authorized, loading: roleLoading } = requireRole(['admin']);
  const [rows, setRows] = useState<SwipeReferralPromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<CardOption[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [analytics, setAnalytics] = useState<
    Record<string, SwipeReferralPromotionAnalytics>
  >({});

  useEffect(() => {
    if (!authorized) return undefined;
    const unsub = subscribeSwipeReferralPromotions(
      (next) => {
        setRows(next);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [authorized]);

  useEffect(() => {
    const q = query(
      collection(db, 'adminFoodShares'),
      where(documentId(), 'in', [...ADMIN_FOOD_CARD_SLOT_IDS]),
    );
    return onSnapshot(q, (snap) => {
      const opts: CardOption[] = [];
      for (const d of snap.docs) {
        const mapped = mapAdminFoodShareDoc(
          d.id,
          d.data() as Record<string, unknown>,
        );
        if (mapped.fulfillmentMode === 'pickup') continue;
        opts.push({
          id: d.id,
          label: `#${d.id} · ${mapped.foodName} · ${mapped.restaurantName}`,
        });
      }
      opts.sort((a, b) => a.id.localeCompare(b.id));
      setCards(opts);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<string, SwipeReferralPromotionAnalytics> = {};
      for (const row of rows) {
        next[row.id] = await loadSwipeReferralPromotionAnalytics(row.id);
      }
      if (!cancelled) setAnalytics(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const openCreate = () => {
    setDraft({
      ...EMPTY,
      badgeText: defaultSwipeReferralBadgeText(50),
    });
  };

  const openEdit = (row: SwipeReferralPromotion) => {
    setDraft({
      id: row.id,
      name: row.name,
      discountPercent: String(row.discountPercent),
      startInput: row.startAtMs
        ? new Date(row.startAtMs).toISOString().slice(0, 10)
        : '',
      endInput: row.endAtMs
        ? new Date(row.endAtMs).toISOString().slice(0, 10)
        : '',
      active: row.active,
      maxRedemptions:
        row.maxRedemptions != null ? String(row.maxRedemptions) : '',
      cardIds: [...row.cardIds],
      badgeText: row.badgeText,
    });
  };

  const toggleCard = (id: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const has = prev.cardIds.includes(id);
      return {
        ...prev,
        cardIds: has
          ? prev.cardIds.filter((c) => c !== id)
          : [...prev.cardIds, id],
      };
    });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const percent = Number.parseFloat(draft.discountPercent);
      if (!Number.isFinite(percent) || percent <= 0) {
        throw new Error('Enter a valid discount percentage');
      }
      const maxRaw = draft.maxRedemptions.trim();
      const maxRedemptions = maxRaw
        ? Math.max(0, Math.floor(Number.parseInt(maxRaw, 10)))
        : null;
      await saveSwipeReferralPromotion({
        id: draft.id,
        name: draft.name,
        discountPercent: percent,
        startAtMs: parseDateInput(draft.startInput),
        endAtMs: parseDateInput(draft.endInput)
          ? (parseDateInput(draft.endInput) as number) + 24 * 60 * 60 * 1000 - 1
          : null,
        active: draft.active,
        maxRedemptions:
          maxRedemptions != null && Number.isFinite(maxRedemptions)
            ? maxRedemptions
            : null,
        cardIds: draft.cardIds,
        badgeText: draft.badgeText,
      });
      showSuccess('Promotion saved');
      setDraft(null);
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const cardLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cards) m.set(c.id, c.label);
    return m;
  }, [cards]);

  if (roleLoading || !authorized) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <AdminHeader
        title="Referral Reward"
        subtitle="Swipe Delivery invite promotions"
        fallbackRoute={adminRoutes.home}
      />

      <View style={styles.toolbar}>
        <Text style={styles.hint}>
          Reward inviters only after a friend pays the same Swipe card.
        </Text>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
          <Text style={styles.addBtnTxt}>+ New promotion</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No referral reward promotions yet.</Text>
          }
          renderItem={({ item }) => {
            const stats = analytics[item.id];
            return (
              <Pressable style={styles.card} onPress={() => openEdit(item)}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  <Text
                    style={[
                      styles.status,
                      item.active ? styles.statusOn : styles.statusOff,
                    ]}
                  >
                    {item.active ? 'Active' : 'Inactive'}
                  </Text>
                </View>
                <Text style={styles.meta}>
                  {item.discountPercent}% · {formatDate(item.startAtMs)} →{' '}
                  {formatDate(item.endAtMs)}
                </Text>
                <Text style={styles.meta} numberOfLines={2}>
                  Cards:{' '}
                  {item.cardIds
                    .map((id) => cardLabelMap.get(id) ?? `#${id}`)
                    .join(', ') || '—'}
                </Text>
                <Text style={styles.badgePreview} numberOfLines={1}>
                  {item.badgeText}
                </Text>
                {stats ? (
                  <View style={styles.stats}>
                    <Text style={styles.stat}>
                      Invites {stats.invitationsSent}
                    </Text>
                    <Text style={styles.stat}>
                      Referrals {stats.successfulReferrals}
                    </Text>
                    <Text style={styles.stat}>
                      Issued {stats.rewardsIssued}
                    </Text>
                    <Text style={styles.stat}>
                      Redeemed {stats.rewardsRedeemed}
                    </Text>
                    <Text style={styles.stat}>
                      Conv {stats.conversionRate}%
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}

      <Modal visible={draft != null} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>
                {draft?.id ? 'Edit promotion' : 'New promotion'}
              </Text>
              <Text style={styles.label}>Promotion name</Text>
              <AppTextInput
                value={draft?.name ?? ''}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, name: t } : d))
                }
                placeholder="Share & Save 50%"
              />
              <Text style={styles.label}>Discount %</Text>
              <AppTextInput
                value={draft?.discountPercent ?? '50'}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, discountPercent: t } : d))
                }
                keyboardType="decimal-pad"
                placeholder="50"
              />
              <Text style={styles.label}>Badge text</Text>
              <AppTextInput
                value={draft?.badgeText ?? ''}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, badgeText: t } : d))
                }
                placeholder={defaultSwipeReferralBadgeText(50)}
              />
              <Text style={styles.label}>Start date (YYYY-MM-DD)</Text>
              <AppTextInput
                value={draft?.startInput ?? ''}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, startInput: t } : d))
                }
                placeholder="Optional"
              />
              <Text style={styles.label}>End date (YYYY-MM-DD)</Text>
              <AppTextInput
                value={draft?.endInput ?? ''}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, endInput: t } : d))
                }
                placeholder="Optional"
              />
              <Text style={styles.label}>Max redemptions</Text>
              <AppTextInput
                value={draft?.maxRedemptions ?? ''}
                onChangeText={(t) =>
                  setDraft((d) => (d ? { ...d, maxRedemptions: t } : d))
                }
                keyboardType="number-pad"
                placeholder="Unlimited"
              />
              <View style={styles.switchRow}>
                <Text style={styles.label}>Active</Text>
                <Switch
                  value={draft?.active === true}
                  onValueChange={(v) =>
                    setDraft((d) => (d ? { ...d, active: v } : d))
                  }
                />
              </View>
              <Text style={styles.label}>Swipe Delivery cards</Text>
              {cards.map((c) => {
                const on = draft?.cardIds.includes(c.id) === true;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.cardPick, on && styles.cardPickOn]}
                    onPress={() => toggleCard(c.id)}
                  >
                    <Text style={styles.cardPickTxt}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setDraft(null)}
                >
                  <Text style={styles.cancelTxt}>Cancel</Text>
                </TouchableOpacity>
                {draft?.id ? (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => {
                      Alert.alert(
                        'Delete promotion?',
                        'Existing unlocked rewards stay with users.',
                        [
                          { text: 'Keep', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: () => {
                              void deleteSwipeReferralPromotion(draft.id!).then(
                                () => {
                                  showSuccess('Deleted');
                                  setDraft(null);
                                },
                              );
                            },
                          },
                        ],
                      );
                    }}
                  >
                    <Text style={styles.deleteTxt}>Delete</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                  disabled={saving}
                  onPress={() => void save()}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveTxt}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>

              {draft?.id ? (
                <TouchableOpacity
                  style={styles.toggleActive}
                  onPress={() => {
                    void setSwipeReferralPromotionActive(
                      draft.id!,
                      !draft.active,
                    ).then(() => {
                      setDraft((d) =>
                        d ? { ...d, active: !d.active } : d,
                      );
                      showSuccess(
                        draft.active ? 'Deactivated' : 'Activated',
                      );
                    });
                  }}
                >
                  <Text style={styles.toggleActiveTxt}>
                    {draft.active ? 'Deactivate now' : 'Activate now'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  toolbar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 10,
  },
  hint: { color: COLORS.textMuted, fontWeight: '600', fontSize: 13 },
  addBtn: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addBtnTxt: { color: '#fff', fontWeight: '800' },
  list: { padding: 16, paddingBottom: 40, gap: 12 },
  empty: {
    textAlign: 'center',
    color: COLORS.textMuted,
    marginTop: 40,
    fontWeight: '600',
  },
  card: {
    ...adminCardShell,
    padding: 14,
    marginBottom: 10,
    gap: 6,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: { flex: 1, color: COLORS.text, fontWeight: '900', fontSize: 16 },
  status: { fontWeight: '800', fontSize: 12 },
  statusOn: { color: '#22C55E' },
  statusOff: { color: COLORS.textMuted },
  meta: { color: COLORS.textMuted, fontWeight: '600', fontSize: 12 },
  badgePreview: { color: COLORS.primary, fontWeight: '800', fontSize: 12 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  stat: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '92%',
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.text,
    marginBottom: 12,
  },
  label: {
    marginTop: 10,
    marginBottom: 6,
    color: COLORS.textMuted,
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cardPick: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  cardPickOn: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(168,85,247,0.12)',
  },
  cardPickTxt: { color: COLORS.text, fontWeight: '700', fontSize: 13 },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    marginBottom: 8,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelTxt: { color: COLORS.text, fontWeight: '800' },
  deleteBtn: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteTxt: { color: '#F87171', fontWeight: '800' },
  saveBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveTxt: { color: '#fff', fontWeight: '900' },
  toggleActive: { alignItems: 'center', paddingVertical: 12 },
  toggleActiveTxt: { color: COLORS.primary, fontWeight: '800' },
});
