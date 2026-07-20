import React from 'react';

export const KEYBOARD_TOOLBAR_NATIVE_ID = 'keyboardToolbar';

type KeyboardToolbarProps = {
  onFocusPrevious?: () => void;
  onFocusNext?: () => void;
  focusedIndex?: number | null;
  totalInputs?: number;
};

/**
 * Keyboard accessory toolbar intentionally disabled for production UI.
 * Call sites and KEYBOARD_TOOLBAR_NATIVE_ID remain for compatibility;
 * native keyboard dismiss / screen navigation are unchanged.
 */
export function KeyboardToolbar(_props: KeyboardToolbarProps) {
  return null;
}
