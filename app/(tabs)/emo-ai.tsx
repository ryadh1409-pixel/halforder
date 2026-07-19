import { EmoAiComposer } from '@/components/emoAi/EmoAiComposer';
import { EmoAiEmptyState } from '@/components/emoAi/EmoAiEmptyState';
import { EmoAiHeader } from '@/components/emoAi/EmoAiHeader';
import { EmoAiHero } from '@/components/emoAi/EmoAiHero';
import { EmoAiMessageList } from '@/components/emoAi/EmoAiMessageList';
import { EmoAiQuickReplies } from '@/components/emoAi/EmoAiQuickReplies';
import { useEmoAiChat } from '@/hooks/useEmoAiChat';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { useAuth } from '@/services/AuthContext';
import { EMO_AI_BG } from '@/types/emoAi';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EmoAiScreen() {
  const { user } = useAuth();
  const uid = isRegisteredAuthUser(user) ? user!.uid : null;

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
        <EmoAiHero />

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
            <EmoAiComposer
              disabled={busy}
              onSend={(t) => void sendMessage(t)}
            />
          </>
        )}
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
