import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Image, Text, View } from 'react-native';

export default function CreateTabDisabledScreen() {
  const {
    prefillTitle,
    prefillPriceSplit,
    prefillMealCategory,
    fromSuggested,
    fromGhost,
    fromFoodTemplate,
    prefillImageUrl,
    prefillDescription,
  } = useLocalSearchParams<{
    prefillTitle?: string;
    prefillPriceSplit?: string;
    prefillMealCategory?: string;
    fromSuggested?: string;
    fromGhost?: string;
    fromFoodTemplate?: string;
    prefillImageUrl?: string;
    prefillDescription?: string;
    templateId?: string;
  }>();

  const templatePrefill =
    fromFoodTemplate === '1' && typeof prefillTitle === 'string';

  const suggestedPrefill =
    (fromSuggested === '1' || fromGhost === '1') &&
    typeof prefillTitle === 'string';

  if (templatePrefill) {
    const price =
      typeof prefillPriceSplit === 'string' && prefillPriceSplit.trim()
        ? prefillPriceSplit.trim()
        : '';
    const desc =
      typeof prefillDescription === 'string' ? prefillDescription.trim() : '';
    const img =
      typeof prefillImageUrl === 'string' ? prefillImageUrl.trim() : '';
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
          Menu item · ready to order
        </Text>
        <Text
          style={{
            color: '#F8FAFC',
            fontSize: 22,
            fontWeight: '800',
            textAlign: 'center',
          }}
        >
          Start this order
        </Text>
        {img ? (
          <Image
            source={{ uri: img }}
            style={{
              width: '100%',
              maxWidth: 280,
              height: 160,
              borderRadius: 16,
              marginTop: 20,
              backgroundColor: '#1a1f28',
            }}
            resizeMode="cover"
          />
        ) : null}
        <Text
          style={{
            color: '#34D399',
            marginTop: 20,
            fontSize: 18,
            fontWeight: '700',
            textAlign: 'center',
          }}
        >
          {prefillTitle}
        </Text>
        {price ? (
          <Text
            style={{
              color: 'rgba(248,250,252,0.75)',
              marginTop: 10,
              fontSize: 16,
              textAlign: 'center',
            }}
          >
            Price: {price}
          </Text>
        ) : null}
        {desc ? (
          <Text
            style={{
              color: 'rgba(248,250,252,0.55)',
              marginTop: 12,
              textAlign: 'center',
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            {desc}
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
          Details are filled from the catalog. Swipe right on live food cards to
          join shared orders, or use chat to plan your next meal.
        </Text>
      </View>
    );
  }

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
          This is a suggestion — not another user’s order. Open Swipe to join
          real food cards; others can join after you start.
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
