import { adminCardShell, adminColors as COLORS, adminFontFamily } from '@/constants/adminTheme';
import type { AdminAiEntityCard, AdminAiMessage } from '@/types/adminAiAssistant';
import { Image } from 'expo-image';
import React, { useEffect } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

function EntityCard({
  item,
  onPress,
}: {
  item: AdminAiEntityCard;
  onPress: (href: string) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.entity, pressed && { opacity: 0.88 }]}
      onPress={() => {
        if (item.href) onPress(item.href);
      }}
    >
      {item.photoUrl ? (
        <Image
          source={{ uri: item.photoUrl }}
          style={styles.avatar}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarLetter}>
            {(item.title || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.entityBody}>
        <Text style={styles.entityTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {item.subtitle ? (
          <Text style={styles.entitySub} numberOfLines={1}>
            {item.subtitle}
          </Text>
        ) : null}
        {item.meta?.map((m) => (
          <Text key={m} style={styles.entityMeta} numberOfLines={1}>
            {m}
          </Text>
        ))}
      </View>
    </Pressable>
  );
}

export function AdminAiMessageBubble({
  message,
  onOpenHref,
  onSuggestion,
}: {
  message: AdminAiMessage;
  onOpenHref: (href: string) => void;
  onSuggestion?: (label: string) => void;
}) {
  const isUser = message.role === 'user';
  return (
    <Animated.View
      entering={FadeInDown.duration(280)}
      style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}
    >
      {!isUser ? (
        <View style={styles.assistantAvatar}>
          <Text style={styles.assistantAvatarText}>AI</Text>
        </View>
      ) : null}
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ]}
      >
        {!isUser ? <Text style={styles.brand}>Admin AI</Text> : null}
        <Text style={[styles.body, isUser && styles.bodyUser]}>{message.content}</Text>
        {message.entities?.length ? (
          <View style={styles.entityList}>
            {message.entities.map((e) => (
              <EntityCard key={`${e.kind}-${e.id}`} item={e} onPress={onOpenHref} />
            ))}
          </View>
        ) : null}
        {message.navigate && !message.entities?.length ? (
          <Pressable
            style={styles.navBtn}
            onPress={() => onOpenHref(message.navigate!.href)}
          >
            <Text style={styles.navBtnText}>{message.navigate.label} →</Text>
          </Pressable>
        ) : null}
        {message.suggestions?.length && onSuggestion ? (
          <View style={styles.chipWrap}>
            {message.suggestions.slice(0, 6).map((s) => (
              <Pressable
                key={s}
                style={styles.chip}
                onPress={() => onSuggestion(s)}
              >
                <Text style={styles.chipText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

function TypingDots() {
  const a = useSharedValue(0.35);
  const b = useSharedValue(0.35);
  const c = useSharedValue(0.35);

  useEffect(() => {
    a.value = withRepeat(
      withSequence(withTiming(1, { duration: 320 }), withTiming(0.35, { duration: 320 })),
      -1,
      false,
    );
    const t1 = setTimeout(() => {
      b.value = withRepeat(
        withSequence(withTiming(1, { duration: 320 }), withTiming(0.35, { duration: 320 })),
        -1,
        false,
      );
    }, 120);
    const t2 = setTimeout(() => {
      c.value = withRepeat(
        withSequence(withTiming(1, { duration: 320 }), withTiming(0.35, { duration: 320 })),
        -1,
        false,
      );
    }, 240);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [a, b, c]);

  const sa = useAnimatedStyle(() => ({ opacity: a.value }));
  const sb = useAnimatedStyle(() => ({ opacity: b.value }));
  const sc = useAnimatedStyle(() => ({ opacity: c.value }));

  return (
    <View style={styles.dots}>
      <Animated.View style={[styles.dot, sa]} />
      <Animated.View style={[styles.dot, sb]} />
      <Animated.View style={[styles.dot, sc]} />
    </View>
  );
}

export function AdminAiTypingBubble({ text }: { text: string }) {
  return (
    <View style={[styles.row, styles.rowAssistant]}>
      <View style={styles.assistantAvatar}>
        <Text style={styles.assistantAvatarText}>AI</Text>
      </View>
      <View style={[styles.bubble, styles.bubbleAssistant]}>
        <Text style={styles.brand}>Admin AI</Text>
        {text ? (
          <Text style={styles.body}>{text}</Text>
        ) : (
          <View style={styles.typingRow}>
            <TypingDots />
            <Text style={styles.typingText}>Thinking…</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: 16,
    maxWidth: '92%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  rowUser: { alignSelf: 'flex-end' },
  rowAssistant: { alignSelf: 'flex-start' },
  assistantAvatar: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  assistantAvatarText: {
    fontFamily: adminFontFamily,
    color: COLORS.primary,
    fontWeight: '900',
    fontSize: 10,
  },
  bubble: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexShrink: 1,
  },
  bubbleUser: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 6,
  },
  bubbleAssistant: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 6,
  },
  brand: {
    fontFamily: adminFontFamily,
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 11,
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  body: {
    fontFamily: adminFontFamily,
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '500',
  },
  bodyUser: { color: '#FFFFFF', fontWeight: '600' },
  entityList: { marginTop: 12, gap: 8 },
  entity: {
    ...adminCardShell,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    marginBottom: 0,
  },
  avatar: { width: 44, height: 44, borderRadius: 14 },
  avatarFallback: {
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: adminFontFamily,
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 16,
  },
  entityBody: { flex: 1, minWidth: 0 },
  entityTitle: {
    fontFamily: adminFontFamily,
    color: COLORS.text,
    fontWeight: '800',
    fontSize: 15,
  },
  entitySub: {
    fontFamily: adminFontFamily,
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  entityMeta: {
    fontFamily: adminFontFamily,
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  navBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: COLORS.primarySoft,
  },
  navBtnText: {
    fontFamily: adminFontFamily,
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 13,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  chipText: {
    fontFamily: adminFontFamily,
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 12,
  },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  typingText: {
    fontFamily: adminFontFamily,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  dots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
});

