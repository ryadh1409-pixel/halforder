import React from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import Toast, { type ToastConfig } from 'react-native-toast-message';

import { palette } from '../constants/theme';
import {
  getReadableErrorMessage,
  type ReadableErrorContext,
} from './errorMessages';
import { logError } from './errorLogger';
import {
  getUserFriendlyError,
  type UserFriendlyErrorOptions,
} from '@/services/errors/userFriendlyErrors';
import { platformElevation } from './platformElevation';

let lastFriendlyError: { message: string; at: number } | null = null;
const ERROR_DEDUP_MS = 2500;

const VISIBILITY_MS = 3000;

const cardBase: ViewStyle = {
  width: '90%',
  backgroundColor: '#111111',
  borderLeftWidth: 4,
  padding: 14,
  borderRadius: 12,
  ...platformElevation({
    web: '0px 4px 10px rgba(0, 0, 0, 0.3)',
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 5 },
  }),
};

export const toastConfig: ToastConfig = {
  success: ({ text2 }) => (
    <View style={[cardBase, { borderLeftColor: palette.primaryOrange }]}>
      <Text
        style={{
          color: palette.primaryOrange,
          fontWeight: 'bold',
          marginBottom: 4,
        }}
      >
        Success
      </Text>
      <Text style={{ color: '#fff' }}>{text2}</Text>
    </View>
  ),
  error: ({ text2 }) => (
    <View style={[cardBase, { borderLeftColor: '#ff3b30' }]}>
      <Text
        style={{
          color: '#ff3b30',
          fontWeight: 'bold',
          marginBottom: 4,
        }}
      >
        Error
      </Text>
      <Text style={{ color: '#fff' }}>{text2}</Text>
    </View>
  ),
  info: ({ text1, text2 }) => (
    <View style={[cardBase, { borderLeftColor: '#9ca3af' }]}>
      <Text
        style={{
          color: palette.primaryOrange,
          fontWeight: 'bold',
          marginBottom: 4,
        }}
      >
        {text1?.trim() ? text1 : 'Notice'}
      </Text>
      <Text style={{ color: '#fff' }}>{text2}</Text>
    </View>
  ),
};

/** Short error toast — never pass raw Firebase / stack text. */
export function showError(message: string): void {
  Toast.show({
    type: 'error',
    text2: message,
    position: 'bottom',
    visibilityTime: VISIBILITY_MS,
    autoHide: true,
  });
}

/** Log full error, map to friendly copy, dedupe rapid repeats. */
export function showFriendlyError(
  error: unknown,
  context: ReadableErrorContext | UserFriendlyErrorOptions = 'default',
): void {
  logError(error);
  const message =
    typeof context === 'string'
      ? getUserFriendlyError(error, { context })
      : getUserFriendlyError(error, context);
  const now = Date.now();
  if (
    lastFriendlyError &&
    lastFriendlyError.message === message &&
    now - lastFriendlyError.at < ERROR_DEDUP_MS
  ) {
    return;
  }
  lastFriendlyError = { message, at: now };
  showError(message);
}

export function showSuccess(message: string): void {
  Toast.show({
    type: 'success',
    text2: message,
    position: 'bottom',
    visibilityTime: VISIBILITY_MS,
    autoHide: true,
  });
}

/** In-app notice (e.g. foreground notifications) — not framed as success/error. */
export function showNotice(title: string, message: string): void {
  Toast.show({
    type: 'info',
    text1: title,
    text2: message,
    position: 'bottom',
    visibilityTime: VISIBILITY_MS,
    autoHide: true,
  });
}

/** Snackbar-style toast with tap-to-undo (5s). */
export function showUndoToast(message: string, onUndo: () => void): void {
  Toast.show({
    type: 'info',
    text1: message,
    text2: 'Tap to undo',
    position: 'bottom',
    visibilityTime: 5000,
    autoHide: true,
    onPress: () => {
      Toast.hide();
      onUndo();
    },
  });
}
