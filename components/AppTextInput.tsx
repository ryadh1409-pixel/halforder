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
 * Pass props to override (e.g. `secureTextEntry`, `keyboardType`).
 */
export const AppTextInput = forwardRef<TextInput, TextInputProps>(
  function AppTextInput({ style, ...props }, ref) {
    return (
      <TextInput
        ref={ref}
        {...ENGLISH_DEFAULTS}
        {...props}
        style={[styles.ltr, style]}
        {...(Platform.OS === 'android' ? { textAlign: props.textAlign ?? 'left' } : {})}
      />
    );
  },
);

const styles = StyleSheet.create({
  ltr: {
    writingDirection: 'ltr',
  },
});
