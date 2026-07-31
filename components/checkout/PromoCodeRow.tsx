import { CK, checkoutPressableProps } from '@/constants/checkoutUi';
import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppTextInput } from '../AppTextInput';

type Props = {
  value: string;
  appliedLabel?: string | null;
  onChange: (next: string) => void;
  onApply?: () => void;
  applying?: boolean;
  hint?: string;
  error?: string | null;
};

function PromoCodeRowInner({
  value,
  appliedLabel,
  onChange,
  onApply,
  applying,
  hint,
  error,
}: Props) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 76 : 0}
    >
      <View style={styles.block}>
        <Text style={styles.eyebrow}>Promo code</Text>
        <View style={styles.outer}>
          <Ionicons name="ticket-outline" size={18} color={CK.textMuted} />
          <AppTextInput
            value={value}
            placeholder="Enter code"
            placeholderTextColor="rgba(183,189,201,0.45)"
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
          ) : onApply ? (
            <Pressable
              {...checkoutPressableProps}
              onPress={onApply}
              disabled={applying || !value.trim()}
              style={({ pressed }) => [
                styles.applyBtn,
                (applying || !value.trim()) && styles.applyDisabled,
                pressed && !applying && value.trim() ? styles.applyPressed : null,
              ]}
            >
              {applying ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.applyTxt}>Apply</Text>
              )}
            </Pressable>
          ) : null}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

export const PromoCodeRow = memo(PromoCodeRowInner);

const styles = StyleSheet.create({
  block: {
    marginTop: 0,
    marginBottom: 0,
    paddingHorizontal: 16,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '700',
    color: CK.textSecondary,
    letterSpacing: -0.1,
    marginBottom: 10,
  },
  outer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingLeft: 12,
    paddingRight: 6,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: CK.text,
    letterSpacing: 0.3,
    paddingVertical: 10,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(229,57,53,0.12)',
  },
  badgeTxt: { fontSize: 11, fontWeight: '800', color: CK.offer },
  applyBtn: {
    minHeight: 36,
    minWidth: 72,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#A855F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyPressed: { opacity: 0.88 },
  applyDisabled: { opacity: 0.4 },
  applyTxt: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.1,
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(183,189,201,0.55)',
    lineHeight: 16,
  },
  error: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    color: CK.offer,
  },
});
