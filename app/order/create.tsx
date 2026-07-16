import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CreateOrderScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#09090B' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '800', textAlign: 'center' }}>
          Order creation removed
        </Text>
        <Text style={{ color: 'rgba(248,250,252,0.65)', marginTop: 8, textAlign: 'center' }}>
          Users can only swipe and join admin-created food cards.
        </Text>
      </View>
    </SafeAreaView>
  );
}
