import { AdminHeader } from '@/components/admin/AdminHeader';
import {
  AdminAiMessageBubble,
  AdminAiTypingBubble,
} from '@/components/admin/AdminAiMessageBubble';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminColors as COLORS, adminFontFamily } from '@/constants/adminTheme';
import { useAdminAiAssistant } from '@/hooks/useAdminAiAssistant';
import { useAuth } from '@/services/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Full-screen Admin AI Assistant — navigates/searchs existing dashboard features only.
 */
export default function AdminAiAssistantScreen() {
  const { user } = useAuth();
  const { prompt: promptParam } = useLocalSearchParams<{ prompt?: string }>();
  const listRef = useRef<FlatList>(null);
  const seededPrompt = useRef(false);

  const {
    messages,
    draft,
    setDraft,
    send,
    streamingText,
    typing,
    chips,
    openEntity,
  } = useAdminAiAssistant(user?.displayName);

  useEffect(() => {
    if (seededPrompt.current) return;
    const p = typeof promptParam === 'string' ? promptParam.trim() : '';
    if (!p) return;
    seededPrompt.current = true;
    void send(p);
  }, [promptParam, send]);

  useEffect(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages.length, streamingText, typing]);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Admin AI"
        subtitle="Enterprise operations assistant"
        fallbackRoute={adminRoutes.home}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <AdminAiMessageBubble
              message={item}
              onOpenHref={openEntity}
              onSuggestion={(label) => void send(label)}
            />
          )}
          ListFooterComponent={
            typing ? <AdminAiTypingBubble text={streamingText} /> : null
          }
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <Text style={styles.headerHint}>Suggested prompts</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {chips.map((c) => (
                  <Pressable
                    key={c.id}
                    style={({ pressed }) => [
                      styles.chip,
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={() => void send(c.prompt)}
                  >
                    <Text style={styles.chipText}>{c.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          }
        />

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message Admin AI…"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
            multiline
            maxLength={1000}
            onSubmitEditing={() => void send()}
          />
          <Pressable
            style={[styles.send, (!draft.trim() || typing) && { opacity: 0.45 }]}
            onPress={() => void send()}
            disabled={!draft.trim() || typing}
          >
            <Ionicons name="arrow-up" size={20} color="#FFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  list: { padding: 16, paddingBottom: 12 },
  headerBlock: { marginBottom: 8 },
  headerHint: {
    fontFamily: adminFontFamily,
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  chipRow: { gap: 8, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  chipText: {
    fontFamily: adminFontFamily,
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 12,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: 'rgba(9,9,11,0.96)',
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 140,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: COLORS.text,
    fontFamily: adminFontFamily,
    fontSize: 15,
    lineHeight: 21,
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
