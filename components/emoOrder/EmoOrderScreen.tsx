/**
 * EmoOrderScreen — Emo AI Concierge conversational UI.
 * Completely isolated from Food Share / Pick Up / existing order lifecycle.
 * Uses useEmoOrderFlow hook as the sole state source.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useEmoOrderFlow } from '@/hooks/useEmoOrderFlow';
import {
  EMO_AI_BG,
  EMO_AI_BUBBLE_AI,
  EMO_AI_PURPLE,
  EMO_AI_SURFACE,
} from '@/types/emoAi';
import type {
  EmoOrderChatMessage,
  EmoOrderAddressDraft,
  EmoReviewsRichData,
} from '@/types/emoOrder';

import { EmoOrderRestaurantCards } from './EmoOrderRestaurantCards';
import { EmoOrderMealCards, EmoOrderMealForm } from './EmoOrderMealCards';
import { EmoOrderAddressCard, EmoOrderAddressInput } from './EmoOrderAddressCard';
import { EmoOrderSummaryCard } from './EmoOrderSummaryCard';
import { EmoOrderTrackingCard } from './EmoOrderTrackingCard';
import { EmoOrderReviewsCard } from './EmoOrderReviewsCard';

// ── Types ──────────────────────────────────────────────────────────────────

type Props = {
  uid: string | null;
  userCoords: { lat: number; lng: number } | null;
  city: string | null;
  savedAddress: EmoOrderAddressDraft | null;
  userName: string | null;
  onBack: () => void;
};

// ── Typing indicator ──────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <View style={styles.aiBubble}>
      <View style={styles.typingDots}>
        <View style={[styles.dot, styles.dot1]} />
        <View style={[styles.dot, styles.dot2]} />
        <View style={[styles.dot, styles.dot3]} />
      </View>
    </View>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────

type BubbleProps = {
  message: EmoOrderChatMessage;
  selectedRestaurant: ReturnType<typeof useEmoOrderFlow>['selectedRestaurant'];
  mealSuggestions: ReturnType<typeof useEmoOrderFlow>['mealSuggestions'];
  savedAddress: EmoOrderAddressDraft | null;
  pricing: ReturnType<typeof useEmoOrderFlow>['pricing'];
  trackingStatus: ReturnType<typeof useEmoOrderFlow>['trackingStatus'];
  paying: boolean;
  onSelectRestaurant: ReturnType<typeof useEmoOrderFlow>['selectRestaurant'];
  onSelectMeal: ReturnType<typeof useEmoOrderFlow>['selectMeal'];
  onConfirmCustomMeal: ReturnType<typeof useEmoOrderFlow>['confirmCustomMeal'];
  onShowMealForm: ReturnType<typeof useEmoOrderFlow>['showMealForm'];
  onConfirmAddress: ReturnType<typeof useEmoOrderFlow>['confirmAddress'];
  onPay: ReturnType<typeof useEmoOrderFlow>['pay'];
};

function MessageBubble({
  message,
  selectedRestaurant,
  mealSuggestions,
  savedAddress,
  pricing,
  trackingStatus,
  paying,
  onSelectRestaurant,
  onSelectMeal,
  onConfirmCustomMeal,
  onShowMealForm,
  onConfirmAddress,
  onPay,
}: BubbleProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <View style={styles.userBubbleWrap}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{message.text}</Text>
        </View>
      </View>
    );
  }

  // AI message — may have rich attachment below the text bubble
  return (
    <View style={styles.aiBubbleWrap}>
      {/* Text part — only if non-null text */}
      {message.text != null ? (
        <View style={styles.aiBubble}>
          <Text style={styles.aiText}>{message.text}</Text>
        </View>
      ) : null}

      {/* Rich attachment */}
      {message.richType === 'restaurants' && message.richData ? (
        <EmoOrderRestaurantCards
          restaurants={(message.richData as { restaurants: Parameters<typeof EmoOrderRestaurantCards>[0]['restaurants'] }).restaurants}
          onSelect={onSelectRestaurant}
        />
      ) : null}

      {message.richType === 'meal_suggestions' && message.richData ? (
        <EmoOrderMealCards
          restaurantName={selectedRestaurant?.name ?? ''}
          suggestions={mealSuggestions}
          onSelect={onSelectMeal}
          onCustom={() => onShowMealForm()}
        />
      ) : null}

      {message.richType === 'meal_form' && message.richData ? (
        <EmoOrderMealForm
          prefillName={(message.richData as { prefillName?: string }).prefillName}
          onConfirm={onConfirmCustomMeal}
        />
      ) : null}

      {message.richType === 'address_confirm' && message.richData && savedAddress ? (
        <EmoOrderAddressCard
          prefilledAddress={savedAddress.address}
          prefilledLat={savedAddress.lat}
          prefilledLng={savedAddress.lng}
          onConfirm={onConfirmAddress}
        />
      ) : message.richType === 'address_confirm' && !savedAddress ? (
        <EmoOrderAddressInput onConfirm={onConfirmAddress} />
      ) : null}

      {message.richType === 'summary' &&
      message.richData &&
      selectedRestaurant &&
      pricing ? (
        <EmoOrderSummaryCard
          restaurant={selectedRestaurant}
          meal={(message.richData as { meal: Parameters<typeof EmoOrderSummaryCard>[0]['meal'] }).meal}
          address={(message.richData as { address: Parameters<typeof EmoOrderSummaryCard>[0]['address'] }).address}
          pricing={pricing}
          paying={paying}
          onPay={onPay}
        />
      ) : null}

      {message.richType === 'reviews' && message.richData ? (
        <EmoOrderReviewsCard
          {...(message.richData as EmoReviewsRichData)}
        />
      ) : null}

      {message.richType === 'tracking' && selectedRestaurant ? (
        trackingStatus ? (
          <EmoOrderTrackingCard
            restaurantName={selectedRestaurant.name}
            status={trackingStatus}
          />
        ) : (
          // Show while waiting for first Firestore event
          <TrackingConnectingCard restaurantName={selectedRestaurant.name} />
        )
      ) : null}
    </View>
  );
}

// ── Tracking connecting placeholder ──────────────────────────────────────

function TrackingConnectingCard({ restaurantName }: { restaurantName: string }) {
  return (
    <View style={styles.connectingCard}>
      <ActivityIndicator size="small" color={EMO_AI_PURPLE} />
      <View style={{ flex: 1 }}>
        <Text style={styles.connectingTitle}>{restaurantName}</Text>
        <Text style={styles.connectingText}>Connecting to live tracking...</Text>
      </View>
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────

export function EmoOrderScreen({
  uid,
  userCoords,
  city,
  savedAddress,
  userName,
  onBack,
}: Props) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);
  const [inputText, setInputText] = useState('');

  const flow = useEmoOrderFlow({ uid, userCoords, city, savedAddress, userName });

  const {
    messages,
    aiTyping,
    selectedRestaurant,
    mealSuggestions,
    pricing,
    paying,
    trackingStatus,
    selectRestaurant,
    selectMeal,
    confirmCustomMeal,
    showMealForm,
    confirmAddress,
    pay,
    sendUserMessage,
  } = flow;

  // Auto-scroll to bottom when messages change or aiTyping changes
  useEffect(() => {
    if (messages.length === 0 && !aiTyping) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 100);
    return () => clearTimeout(timer);
  }, [messages.length, aiTyping]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    void sendUserMessage(text);
  }, [inputText, sendUserMessage]);

  // Flatten messages + optional typing indicator into a single list
  const listData: Array<EmoOrderChatMessage | { id: '__typing__' }> = [
    ...messages,
    ...(aiTyping ? [{ id: '__typing__' as const }] : []),
  ];

  function renderItem({ item }: { item: (typeof listData)[number] }) {
    if ('id' in item && item.id === '__typing__') {
      return (
        <View style={styles.aiBubbleWrap}>
          <TypingIndicator />
        </View>
      );
    }
    const msg = item as EmoOrderChatMessage;
    return (
      <MessageBubble
        message={msg}
        selectedRestaurant={selectedRestaurant}
        mealSuggestions={mealSuggestions}
        savedAddress={savedAddress}
        pricing={pricing}
        trackingStatus={trackingStatus}
        paying={paying}
        onSelectRestaurant={selectRestaurant}
        onSelectMeal={selectMeal}
        onConfirmCustomMeal={confirmCustomMeal}
        onShowMealForm={showMealForm}
        onConfirmAddress={confirmAddress}
        onPay={pay}
      />
    );
  }

  const canSend = inputText.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.8)" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Emo AI</Text>
          <View style={styles.headerSubRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.headerSub}>online</Text>
          </View>
        </View>
        <View style={styles.backBtn} pointerEvents="none" />
      </View>

      {/* Message list */}
      <FlatList
        ref={listRef}
        data={listData}
        keyExtractor={(item) => ('id' in item ? String(item.id) : String((item as EmoOrderChatMessage).id))}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          listRef.current?.scrollToEnd({ animated: false });
        }}
      />

      {/* Composer */}
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={styles.input}
          placeholder="message kevin..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          blurOnSubmit={false}
          multiline={false}
        />
        <Pressable
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          <Ionicons name="arrow-up" size={20} color="#FFF" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: EMO_AI_BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  headerTitle: { fontSize: 16, fontWeight: '900', color: '#FFFFFF' },
  headerSubRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#22C55E',
  },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  aiBubbleWrap: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    marginBottom: 4,
  },
  aiBubble: {
    backgroundColor: EMO_AI_BUBBLE_AI,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  aiText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 21,
  },
  userBubbleWrap: {
    alignSelf: 'flex-end',
    maxWidth: '80%',
    marginBottom: 4,
  },
  userBubble: {
    backgroundColor: EMO_AI_PURPLE,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '600',
    lineHeight: 21,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 4,
    paddingVertical: 4,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dot1: {},
  dot2: { opacity: 0.7 },
  dot3: { opacity: 0.4 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: EMO_AI_BG,
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.3)',
    backgroundColor: EMO_AI_SURFACE,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: EMO_AI_PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.35 },
  connectingCard: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: EMO_AI_SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.25)',
  },
  connectingTitle: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  connectingText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
    fontStyle: 'italic',
  },
});
