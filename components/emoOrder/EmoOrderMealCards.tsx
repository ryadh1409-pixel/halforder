import React, { memo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { EMO_AI_PURPLE, EMO_AI_SURFACE } from '@/types/emoAi';
import type { EmoOrderMealDraft, EmoOrderMealSuggestion } from '@/types/emoOrder';

// ── Suggestion chips ───────────────────────────────────────────────────────

type MealCardsProps = {
  restaurantName: string;
  suggestions: EmoOrderMealSuggestion[];
  onSelect: (s: EmoOrderMealSuggestion) => void;
  onCustom: () => void;
};

function EmoOrderMealCardsInner({ suggestions, onSelect, onCustom }: MealCardsProps) {
  return (
    <View style={styles.wrap}>
      {/* Disclaimer — suggestions are not the restaurant's actual menu */}
      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          {'Popular dish types for this cuisine — not the restaurant\'s actual menu. Prices are estimates only. Check the restaurant\'s menu for available items.'}
        </Text>
      </View>

      <View style={styles.grid}>
        {suggestions.map((s) => (
          <Pressable
            key={s.name}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            onPress={() => onSelect(s)}
            accessibilityRole="button"
            accessibilityLabel={s.name}
          >
            <Text style={styles.chipEmoji}>{s.emoji}</Text>
            <Text style={styles.chipName} numberOfLines={2}>
              {s.name}
            </Text>
            <Text style={styles.chipPrice}>{'~CA$'}{s.estimatedPrice.toFixed(2)}</Text>
          </Pressable>
        ))}
      </View>

      {/* Primary CTA — enter from the restaurant's actual menu */}
      <Pressable style={styles.customBtn} onPress={onCustom} accessibilityRole="button">
        <Text style={styles.customBtnText}>{'✏  Enter from restaurant\'s menu'}</Text>
      </Pressable>
    </View>
  );
}

export const EmoOrderMealCards = memo(EmoOrderMealCardsInner);

// ── Custom meal inline form ────────────────────────────────────────────────

type MealFormProps = {
  prefillName?: string;
  onConfirm: (draft: EmoOrderMealDraft) => void;
};

export function EmoOrderMealForm({ prefillName, onConfirm }: MealFormProps) {
  const [mealName, setMealName] = useState(prefillName ?? '');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const valid =
    mealName.trim().length > 0 &&
    Number.isFinite(parseFloat(price)) &&
    parseFloat(price) > 0;

  function handleConfirm() {
    if (!valid || busy) return;
    setBusy(true);
    onConfirm({
      mealName: mealName.trim(),
      estimatedPrice: parseFloat(price),
      quantity: Math.max(1, parseInt(qty, 10) || 1),
      notes: notes.trim(),
    });
  }

  return (
    <View style={styles.formWrap}>
      <Text style={styles.formLabel}>Enter from the restaurant's menu</Text>
      <TextInput
        style={styles.input}
        placeholder="Exact item name (e.g. Spicy Tuna Roll)"
        placeholderTextColor="rgba(255,255,255,0.3)"
        value={mealName}
        onChangeText={setMealName}
      />
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.halfInput]}
          placeholder="Price (CA$)"
          placeholderTextColor="rgba(255,255,255,0.3)"
          keyboardType="decimal-pad"
          value={price}
          onChangeText={setPrice}
        />
        <TextInput
          style={[styles.input, styles.qtyInput]}
          placeholder="Qty"
          placeholderTextColor="rgba(255,255,255,0.3)"
          keyboardType="number-pad"
          value={qty}
          onChangeText={setQty}
        />
      </View>
      <TextInput
        style={[styles.input, styles.notesInput]}
        placeholder="Notes (optional)"
        placeholderTextColor="rgba(255,255,255,0.3)"
        value={notes}
        onChangeText={setNotes}
        multiline
      />
      <Pressable
        style={[styles.confirmBtn, !valid && styles.confirmBtnDisabled]}
        onPress={handleConfirm}
        disabled={!valid || busy}
      >
        {busy ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <Text style={styles.confirmBtnText}>Confirm meal</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Suggestion chips
  wrap: { marginTop: 8, gap: 10 },

  // Disclaimer banner
  disclaimer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  disclaimerText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 16,
    fontStyle: 'italic',
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    width: '47%',
    padding: 12,
    borderRadius: 14,
    backgroundColor: EMO_AI_SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.22)',
    gap: 4,
  },
  chipPressed: { opacity: 0.8 },
  chipEmoji: { fontSize: 20 },
  chipName: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', lineHeight: 17 },
  // Tilde prefix in the text already signals estimated price
  chipPrice: { fontSize: 12, color: 'rgba(168,85,247,0.7)', fontWeight: '700', marginTop: 2 },
  customBtn: {
    alignSelf: 'stretch',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(168,85,247,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.3)',
    alignItems: 'center',
  },
  customBtnText: { fontSize: 14, color: EMO_AI_PURPLE, fontWeight: '800' },

  // Custom form
  formLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  formWrap: {
    marginTop: 8,
    gap: 8,
    padding: 14,
    borderRadius: 16,
    backgroundColor: EMO_AI_SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.2)',
  },
  input: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.25)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  row: { flexDirection: 'row', gap: 8 },
  halfInput: { flex: 1 },
  qtyInput: { width: 60 },
  notesInput: { minHeight: 68, paddingTop: 10, textAlignVertical: 'top' },
  confirmBtn: {
    height: 44,
    borderRadius: 12,
    backgroundColor: EMO_AI_PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
});
