import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

export default function CreateTabDisabledScreen() {
  const { prefillTitle, prefillPriceSplit, fromGhost } = useLocalSearchParams<{
    prefillTitle?: string;
    prefillPriceSplit?: string;
    fromGhost?: string;
  }>();

  const ghostPrefill = fromGhost === '1' && typeof prefillTitle === 'string';

  if (ghostPrefill) {
    const price =
      typeof prefillPriceSplit === 'string' && prefillPriceSplit.trim()
        ? prefillPriceSplit.trim()
        : '$8';
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#06080C',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Text
          style={{
            color: '#F8FAFC',
            fontSize: 22,
            fontWeight: '800',
            textAlign: 'center',
          }}
        >
          Start this split
        </Text>
        <Text
          style={{
            color: '#34D399',
            marginTop: 16,
            fontSize: 18,
            fontWeight: '700',
            textAlign: 'center',
          }}
        >
          {prefillTitle}
        </Text>
        <Text
          style={{
            color: 'rgba(248,250,252,0.75)',
            marginTop: 10,
            fontSize: 16,
            textAlign: 'center',
          }}
        >
          Target share: {price}
        </Text>
        <Text
          style={{
            color: 'rgba(248,250,252,0.65)',
            marginTop: 20,
            textAlign: 'center',
            lineHeight: 22,
          }}
        >
          Open Swipe and join a food card — we prefilled this idea from chat so you
          can match faster.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#06080C',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Text
        style={{
          color: '#F8FAFC',
          fontSize: 22,
          fontWeight: '800',
          textAlign: 'center',
        }}
      >
        Create disabled
      </Text>
      <Text
        style={{
          color: 'rgba(248,250,252,0.65)',
          marginTop: 8,
          textAlign: 'center',
        }}
      >
        Swipe right on admin cards to join food matches.
      </Text>
    </View>
  );
}
