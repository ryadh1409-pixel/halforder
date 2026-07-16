import {
  PROMOTION_BADGE_OPTIONS,
  type PromotionBadgeValue,
} from '@/lib/promotionBadge';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
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

export type PromotionBadgeEditModalProps = {
  visible: boolean;
  restaurantName: string;
  foodName: string;
  /** Label for the food/item field (e.g. "Food" or "Menu Item"). */
  foodFieldLabel?: string;
  value: PromotionBadgeValue;
  saving?: boolean;
  onCancel: () => void;
  onSave: (next: PromotionBadgeValue) => void;
};

export function PromotionBadgeEditModal({
  visible,
  restaurantName,
  foodName,
  foodFieldLabel = 'Food',
  value,
  saving = false,
  onCancel,
  onSave,
}: PromotionBadgeEditModalProps) {
  const [draft, setDraft] = useState<PromotionBadgeValue>(value);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Promotion Badge</Text>

          <Text style={styles.metaLabel}>Restaurant</Text>
          <Text style={styles.metaValue}>{restaurantName || '—'}</Text>

          <Text style={[styles.metaLabel, styles.metaSpacer]}>
            {foodFieldLabel}
          </Text>
          <Text style={styles.metaValue}>{foodName || '—'}</Text>

          <Text style={[styles.fieldLabel, styles.metaSpacer]}>
            Promotion Badge
          </Text>
          <View style={styles.promoGroup}>
            {PROMOTION_BADGE_OPTIONS.map((opt) => {
              const selected = draft === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  disabled={saving}
                  onPress={() => setDraft(opt.value)}
                  style={[
                    styles.promoOption,
                    selected && styles.promoOptionSelected,
                  ]}
                >
                  <View
                    style={[
                      styles.radioOuter,
                      selected && styles.radioOuterSelected,
                    ]}
                  >
                    {selected ? <View style={styles.radioInner} /> : null}
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
              onPress={() => onSave(draft)}
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
  },
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
    marginBottom: 8,
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
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(15, 23, 42, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: { borderColor: PRIMARY },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: PRIMARY,
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
    marginTop: 20,
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
