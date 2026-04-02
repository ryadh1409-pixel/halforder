import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

export default function CreateTabDisabledScreen() {
  const {
    prefillTitle,
    prefillPriceSplit,
    prefillMealCategory,
    fromSuggested,
    fromGhost,
  } = useLocalSearchParams<{
    prefillTitle?: string;
    prefillPriceSplit?: string;
    prefillMealCategory?: string;
    fromSuggested?: string;
    fromGhost?: string;
  }>();

  const suggestedPrefill =
    (fromSuggested === '1' || fromGhost === '1') &&
    typeof prefillTitle === 'string';

  if (suggestedPrefill) {
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
            color: '#9CA3AF',
            fontSize: 12,
            fontWeight: '700',
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            marginBottom: 8,
          }}
        >
          Suggested order · template only
        </Text>
        <Text
          style={{
            color: '#F8FAFC',
            fontSize: 22,
            fontWeight: '800',
            textAlign: 'center',
          }}
        >
          Start from this idea
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
        {typeof prefillMealCategory === 'string' &&
        prefillMealCategory.trim() ? (
          <Text
            style={{
              color: 'rgba(248,250,252,0.55)',
              marginTop: 12,
              textAlign: 'center',
              fontSize: 14,
            }}
          >
            Time of day: {prefillMealCategory}
          </Text>
        ) : null}
        <Text
          style={{
            color: 'rgba(248,250,252,0.65)',
            marginTop: 20,
            textAlign: 'center',
            lineHeight: 22,
          }}
        >
          This is a suggestion — not another user’s order. Open Swipe to join real
          food cards; others can join after you start.
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
        Swipe right on admin cards to join shared food orders.
      </Text>
    </View>
  );
}
