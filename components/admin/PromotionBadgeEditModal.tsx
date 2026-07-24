import {
  DEFAULT_PROMOTION_DESTINATIONS,
  PROMOTION_BADGE_OPTIONS,
  PROMOTION_DESTINATION_OPTIONS,
  type PromotionBadgeValue,
  type PromotionDestinations,
} from '@/lib/promotionBadge';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const BG = '#FFFFFF';
const CARD = '#ffffff';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const PRIMARY = '#16a34a';

export type PromotionCampaignDraft = {
  promotionBadges: Exclude<PromotionBadgeValue, 'none'>[];
  promotionDestinations: PromotionDestinations;
};

export type PromotionBadgeEditModalProps = {
  visible: boolean;
  restaurantName: string;
  foodName: string;
  /** Label for the food/item field (e.g. "Food" or "Menu Item"). */
  foodFieldLabel?: string;
  /** Primary / legacy single value (used when badges not provided). */
  value?: PromotionBadgeValue;
  badges?: ReadonlyArray<Exclude<PromotionBadgeValue, 'none'>>;
  destinations?: PromotionDestinations;
  saving?: boolean;
  onCancel: () => void;
  onSave: (next: PromotionCampaignDraft) => void;
};

export function PromotionBadgeEditModal({
  visible,
  restaurantName,
  foodName,
  foodFieldLabel = 'Food',
  value = 'none',
  badges,
  destinations,
  saving = false,
  onCancel,
  onSave,
}: PromotionBadgeEditModalProps) {
  const [draftBadges, setDraftBadges] = useState<
    Exclude<PromotionBadgeValue, 'none'>[]
  >([]);
  const [draftDestinations, setDraftDestinations] =
    useState<PromotionDestinations>({ ...DEFAULT_PROMOTION_DESTINATIONS });

  useEffect(() => {
    if (!visible) return;
    const initial =
      badges && badges.length > 0
        ? [...badges]
        : value !== 'none'
          ? [value as Exclude<PromotionBadgeValue, 'none'>]
          : [];
    setDraftBadges(initial);
    setDraftDestinations({
      ...DEFAULT_PROMOTION_DESTINATIONS,
      ...(destinations ?? {}),
    });
  }, [visible, value, badges, destinations]);

  const toggleBadge = (opt: PromotionBadgeValue) => {
    if (opt === 'none') {
      setDraftBadges([]);
      return;
    }
    setDraftBadges((prev) => {
      if (prev.includes(opt)) return prev.filter((v) => v !== opt);
      return [...prev, opt];
    });
  };

  const toggleDestination = (key: keyof PromotionDestinations) => {
    setDraftDestinations((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const noneSelected = draftBadges.length === 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Promotion Campaign</Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.metaLabel}>Restaurant</Text>
            <Text style={styles.metaValue}>{restaurantName || '—'}</Text>

            <Text style={[styles.metaLabel, styles.metaSpacer]}>
              {foodFieldLabel}
            </Text>
            <Text style={styles.metaValue}>{foodName || '—'}</Text>

            <Text style={[styles.fieldLabel, styles.metaSpacer]}>
              Promotion Type
            </Text>
            <Text style={styles.hint}>
              Select one or more. Free Delivery and Free Service Fee waive those
              fees at checkout when saved on a restaurant.
            </Text>
            <View style={styles.promoGroup}>
              {PROMOTION_BADGE_OPTIONS.map((opt) => {
                const selected =
                  opt.value === 'none'
                    ? noneSelected
                    : draftBadges.includes(
                        opt.value as Exclude<PromotionBadgeValue, 'none'>,
                      );
                return (
                  <Pressable
                    key={opt.value}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    disabled={saving}
                    onPress={() => toggleBadge(opt.value)}
                    style={[
                      styles.promoOption,
                      selected && styles.promoOptionSelected,
                    ]}
                  >
                    <View
                      style={[
                        styles.checkOuter,
                        selected && styles.checkOuterSelected,
                      ]}
                    >
                      {selected ? <View style={styles.checkInner} /> : null}
                    </View>
                    <Text
                      style={[
                        styles.promoOptionText,
                        selected && styles.promoOptionTextSelected,
                      ]}
                    >
                      {opt.radioLabel}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, styles.metaSpacer]}>
              Display Locations
            </Text>
            <Text style={styles.hint}>
              Choose where selected promotions appear for customers.
            </Text>
            <View style={styles.promoGroup}>
              {PROMOTION_DESTINATION_OPTIONS.map((opt) => {
                const selected = draftDestinations[opt.key] === true;
                return (
                  <Pressable
                    key={opt.key}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    disabled={saving || noneSelected}
                    onPress={() => toggleDestination(opt.key)}
                    style={[
                      styles.promoOption,
                      selected && styles.promoOptionSelected,
                      noneSelected && styles.promoOptionDisabled,
                    ]}
                  >
                    <View
                      style={[
                        styles.checkOuter,
                        selected && styles.checkOuterSelected,
                      ]}
                    >
                      {selected ? <View style={styles.checkInner} /> : null}
                    </View>
                    <Text
                      style={[
                        styles.promoOptionText,
                        selected && styles.promoOptionTextSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              disabled={saving}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.btnDisabled]}
              onPress={() =>
                onSave({
                  promotionBadges: draftBadges,
                  promotionDestinations: draftDestinations,
                })
              }
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={CARD} />
              ) : (
                <Text style={styles.saveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    maxHeight: '92%',
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 8 },
  title: {
    color: TEXT,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metaValue: {
    marginTop: 4,
    fontSize: 17,
    fontWeight: '700',
    color: TEXT,
  },
  metaSpacer: { marginTop: 14 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: MUTED,
    marginBottom: 4,
  },
  hint: {
    fontSize: 12,
    fontWeight: '500',
    color: MUTED,
    marginBottom: 8,
    lineHeight: 16,
  },
  promoGroup: { gap: 8 },
  promoOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.1)',
    backgroundColor: CARD,
  },
  promoOptionSelected: {
    borderColor: 'rgba(22, 163, 74, 0.45)',
    backgroundColor: 'rgba(22, 163, 74, 0.06)',
  },
  promoOptionDisabled: { opacity: 0.45 },
  checkOuter: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(15, 23, 42, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOuterSelected: { borderColor: PRIMARY, backgroundColor: PRIMARY },
  checkInner: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  promoOptionText: {
    color: TEXT,
    fontSize: 15,
    fontWeight: '600',
  },
  promoOptionTextSelected: { fontWeight: '700' },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.12)',
    alignItems: 'center',
  },
  cancelText: { color: MUTED, fontWeight: '700' },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: CARD, fontWeight: '700' },
  btnDisabled: { opacity: 0.55 },
});
