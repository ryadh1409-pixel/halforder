import { CK } from '@/constants/checkoutUi';
import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Props = {
  value: string;
  appliedLabel?: string | null;
  onChange: (next: string) => void;
  hint?: string;
};

function PromoCodeRowInner({ value, appliedLabel, onChange, hint }: Props) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 76 : 0}
    >
      <View style={styles.block}>
        <Text style={styles.eyebrow}>Promotions</Text>
        <View style={styles.outer}>
          <Ionicons name="prism-outline" size={20} color={CK.textSecondary} />
          <TextInput
            value={value}
            placeholder="Enter promo code"
            placeholderTextColor={CK.textMuted}
            autoCapitalize="characters"
            onChangeText={onChange}
            style={styles.input}
            editable
            accessibilityLabel="Promo code"
          />
          {appliedLabel ? (
            <View style={styles.badge}>
              <Text style={styles.badgeTxt}>{appliedLabel}</Text>
            </View>
          ) : null}
        </View>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

export const PromoCodeRow = memo(PromoCodeRowInner);

const styles = StyleSheet.create({
  block: { marginTop: 6, paddingHorizontal: 16 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: CK.textMuted,
    letterSpacing: 0.6,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  outer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: CK.mapRadius,
    borderWidth: 1,
    borderColor: CK.border,
    backgroundColor: CK.bg,
    paddingHorizontal: 14,
    minHeight: 54,
    shadowColor: CK.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  input: { flex: 1, fontSize: 16.5, fontWeight: '600', color: CK.text },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(229,57,53,0.1)',
  },
  badgeTxt: { fontSize: 11, fontWeight: '900', color: CK.offer },
  hint: { marginTop: 10, fontSize: 13, fontWeight: '600', color: CK.textMuted },
});
