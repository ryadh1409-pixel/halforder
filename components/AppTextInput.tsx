import React, { forwardRef } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  type TextInputProps,
} from 'react-native';

const ENGLISH_DEFAULTS = {
  autoCapitalize: 'none',
  autoCorrect: false,
  textAlign: 'left',
  keyboardAppearance: 'dark',
} as const satisfies Partial<TextInputProps>;

/**
 * English-first text field: LTR alignment, dark keyboard, no autocorrect.
 * Default visual style matches Emo AI inputs (pages may still override via `style`).
 */
export const AppTextInput = forwardRef<TextInput, TextInputProps>(
  function AppTextInput({ style, placeholderTextColor, ...props }, ref) {
    return (
      <TextInput
        ref={ref}
        {...ENGLISH_DEFAULTS}
        {...props}
        placeholderTextColor={placeholderTextColor ?? '#7D8493'}
        selectionColor="#A855F7"
        cursorColor="#A855F7"
        style={[styles.base, styles.ltr, style]}
        {...(Platform.OS === 'android'
          ? { textAlign: props.textAlign ?? 'left' }
          : {})}
      />
    );
  },
);

const styles = StyleSheet.create({
  base: {
    color: '#FFFFFF',
    backgroundColor: '#1C2030',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.35)',
    borderRadius: 14,
  },
  ltr: {
    writingDirection: 'ltr',
  },
});
