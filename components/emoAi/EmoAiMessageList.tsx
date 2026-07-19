import { EMO_AI_BUBBLE_AI, EMO_AI_PURPLE, EMO_AI_SURFACE } from '@/types/emoAi';
import type { EmoAiMessage } from '@/types/emoAi';
import { Image } from 'expo-image';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const AVATAR = require('../../assets/emo-ai/hero.png');

function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function TypingDots() {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  const opacity = a.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  return (
    <View style={[styles.row, styles.rowAi]}>
      <Image source={AVATAR} style={styles.msgAvatar} contentFit="cover" />
      <Animated.View style={[styles.aiBubble, styles.typingBubble, { opacity }]}>
        <Text style={styles.typingText}>Emo is chewing…</Text>
      </Animated.View>
    </View>
  );
}

type Props = {
  messages: EmoAiMessage[];
  streamingText: string;
  typing: boolean;
};

export function EmoAiMessageList({ messages, streamingText, typing }: Props) {
  const listRef = useRef<FlatList<EmoAiMessage>>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 60);
    return () => clearTimeout(t);
  }, [messages.length, streamingText, typing]);

  return (
    <FlatList
      ref={listRef}
      data={messages}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => {
        const mine = item.role === 'user';
        return (
          <View style={[styles.row, mine ? styles.rowMine : styles.rowAi]}>
            {!mine ? (
              <Image source={AVATAR} style={styles.msgAvatar} contentFit="cover" />
            ) : (
              <View style={styles.msgAvatarSpacer} />
            )}
            <View style={styles.bubbleCol}>
              {!mine ? <Text style={styles.sender}>Emo AI</Text> : null}
              <View style={[styles.bubble, mine ? styles.userBubble : styles.aiBubble]}>
                <Text style={styles.bubbleText}>{item.content}</Text>
              </View>
              <Text style={[styles.time, mine && styles.timeMine]}>
                {formatTime(item.createdAtMs)}
              </Text>
            </View>
          </View>
        );
      }}
      ListFooterComponent={
        streamingText || typing ? (
          <View>
            {streamingText ? (
              <View style={[styles.row, styles.rowAi]}>
                <Image source={AVATAR} style={styles.msgAvatar} contentFit="cover" />
                <View style={styles.bubbleCol}>
                  <Text style={styles.sender}>Emo AI</Text>
                  <View style={[styles.bubble, styles.aiBubble]}>
                    <Text style={styles.bubbleText}>{streamingText}</Text>
                  </View>
                </View>
              </View>
            ) : (
              <TypingDots />
            )}
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 14,
    maxWidth: '92%',
  },
  rowAi: { alignSelf: 'flex-start' },
  rowMine: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    backgroundColor: EMO_AI_SURFACE,
  },
  msgAvatarSpacer: { width: 0 },
  bubbleCol: { flexShrink: 1, maxWidth: '100%' },
  sender: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7D8493',
    marginBottom: 4,
    marginLeft: 4,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  aiBubble: {
    backgroundColor: EMO_AI_BUBBLE_AI,
    borderBottomLeftRadius: 6,
  },
  userBubble: {
    backgroundColor: EMO_AI_PURPLE,
    borderBottomRightRadius: 6,
  },
  bubbleText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  time: {
    marginTop: 4,
    marginLeft: 4,
    fontSize: 11,
    color: '#7D8493',
    fontWeight: '500',
  },
  timeMine: {
    textAlign: 'right',
    marginRight: 4,
    marginLeft: 0,
  },
  typingBubble: {
    paddingVertical: 12,
  },
  typingText: {
    color: '#B7BDC9',
    fontSize: 14,
    fontWeight: '600',
  },
});
