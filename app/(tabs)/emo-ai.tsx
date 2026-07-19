import { EmoAiComposer } from '@/components/emoAi/EmoAiComposer';
import { EmoAiEmptyState } from '@/components/emoAi/EmoAiEmptyState';
import { EmoAiHeader } from '@/components/emoAi/EmoAiHeader';
import { EmoAiHero } from '@/components/emoAi/EmoAiHero';
import { EmoAiMessageList } from '@/components/emoAi/EmoAiMessageList';
import { EmoAiQuickReplies } from '@/components/emoAi/EmoAiQuickReplies';
import { UE } from '@/constants/uberEatsTheme';
import { useEmoAiChat } from '@/hooks/useEmoAiChat';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { useAuth } from '@/services/AuthContext';
import { EMO_AI_BG } from '@/types/emoAi';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

export default function EmoAiScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const uid = isRegisteredAuthUser(user) ? user!.uid : null;
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const {
    ready,
    started,
    messages,
    streamingText,
    typing,
    error,
    startChatting,
    sendMessage,
  } = useEmoAiChat(uid);

  const busy = typing || Boolean(streamingText);

  /**
   * Floating CustomTabBar footprint (pinned to screen bottom).
   * Composer sits immediately above this spacer — never under the tabs.
   */
  const tabBarBottomOffset = Math.max(14, insets.bottom + 4);
  const tabBarReserve = keyboardOpen
    ? 0
    : UE.tabBarHeight + tabBarBottomOffset + 10;

  useEffect(() => {
    const showEvt =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const lastUserMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m?.role === 'user') return m.content;
    }
    return null;
  }, [messages]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <EmoAiHeader
          onInfoPress={() =>
            Alert.alert(
              'Emo AI',
              'Your meal companion — here to hang out while you eat. Not customer support.',
            )
          }
        />
        <EmoAiHero
          typing={typing && !streamingText}
          streaming={Boolean(streamingText)}
          streamingTick={streamingText.length}
          lastUserMessage={lastUserMessage}
        />

        {!ready ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#A855F7" />
          </View>
        ) : !started ? (
          <EmoAiEmptyState onStart={() => void startChatting()} />
        ) : (
          <>
            <View style={styles.chat}>
              <EmoAiMessageList
                messages={messages}
                streamingText={streamingText}
                typing={typing && !streamingText}
              />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <EmoAiQuickReplies
              disabled={busy}
              onSelect={(t) => void sendMessage(t)}
            />
            {/* Messages → composer → tab-bar reserve (tabs float in this space) */}
            <EmoAiComposer
              disabled={busy}
              onSend={(t) => void sendMessage(t)}
            />
          </>
        )}

        <View style={{ height: tabBarReserve }} pointerEvents="none" />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: EMO_AI_BG,
  },
  flex: { flex: 1 },
  chat: { flex: 1, minHeight: 0 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
});
