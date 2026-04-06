import Toast from 'react-native-toast-message';

const VISIBILITY_MS = 3000;

/** Short error toast — never pass raw Firebase / stack text. */
export function showError(message: string): void {
  Toast.show({
    type: 'error',
    text1: 'Oops',
    text2: message,
    position: 'bottom',
    visibilityTime: VISIBILITY_MS,
    autoHide: true,
  });
}

export function showSuccess(message: string): void {
  Toast.show({
    type: 'success',
    text1: 'Success',
    text2: message,
    position: 'bottom',
    visibilityTime: VISIBILITY_MS,
    autoHide: true,
  });
}
