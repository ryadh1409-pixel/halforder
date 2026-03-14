import React from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export const KEYBOARD_TOOLBAR_NATIVE_ID = 'keyboardToolbar';

type KeyboardToolbarProps = {
  onFocusPrevious?: () => void;
  onFocusNext?: () => void;
  focusedIndex?: number | null;
  totalInputs?: number;
};

export function KeyboardToolbar({
  onFocusPrevious,
  onFocusNext,
  focusedIndex = null,
  totalInputs = 0,
}: KeyboardToolbarProps) {
  if (Platform.OS !== 'ios') return null;

  const canGoPrev =
    focusedIndex !== null && totalInputs > 0 && focusedIndex > 0;
  const canGoNext =
    focusedIndex !== null &&
    totalInputs > 0 &&
    focusedIndex < totalInputs - 1;

  return (
    <InputAccessoryView nativeID={KEYBOARD_TOOLBAR_NATIVE_ID}>
      <View style={styles.toolbar}>
        <TouchableOpacity
          onPress={onFocusPrevious}
          style={styles.button}
          disabled={!canGoPrev}
        >
          <Text style={[styles.icon, !canGoPrev && styles.iconDisabled]}>
            ⬆ Previous
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onFocusNext}
          style={styles.button}
          disabled={!canGoNext}
        >
          <Text style={[styles.icon, !canGoNext && styles.iconDisabled]}>
            ⬇ Next
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Keyboard.dismiss()}
          style={styles.button}
        >
          <Text style={styles.icon}>✅ Done</Text>
        </TouchableOpacity>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 12,
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  icon: {
    fontSize: 15,
    color: '#FFF',
    fontWeight: '600',
  },
  iconDisabled: {
    opacity: 0.4,
    color: '#999',
  },
});
