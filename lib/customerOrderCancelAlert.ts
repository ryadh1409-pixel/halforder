import { Alert } from 'react-native';

export function showRestaurantAcceptedCancelAlert(): void {
  Alert.alert(
    'Cannot cancel order',
    'Restaurant already accepted your order and preparation may have started.',
    [
      { text: 'OK', style: 'cancel' },
      {
        text: 'Contact support',
        onPress: () => {
          Alert.alert('Coming soon', 'Support chat will be available here soon.');
        },
      },
    ],
  );
}
