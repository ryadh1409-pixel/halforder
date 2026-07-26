import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import type { AdminAiEntityCard, AdminAiMessage } from '@/types/adminAiAssistant';
import { Image } from 'expo-image';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

function EntityCard({
  item,
  onPress,
}: {
  item: AdminAiEntityCard;
  onPress: (href: string) => void;
}) {
  return (
    <Pressable
      style={styles.entity}
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
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ]}
      >
        {!isUser ? <Text style={styles.brand}>Admin AI</Text> : null}
        <Text style={styles.body}>{message.content}</Text>
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
    </View>
  );
}

export function AdminAiTypingBubble({ text }: { text: string }) {
  return (
    <View style={[styles.row, styles.rowAssistant]}>
      <View style={[styles.bubble, styles.bubbleAssistant]}>
        <Text style={styles.brand}>Admin AI</Text>
        {text ? (
          <Text style={styles.body}>{text}</Text>
        ) : (
          <View style={styles.typingRow}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.typingText}>Thinking…</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 12, maxWidth: '94%' },
  rowUser: { alignSelf: 'flex-end' },
  rowAssistant: { alignSelf: 'flex-start' },
  bubble: {
    borderRadius: 16,
    padding: 14,
  },
  bubbleUser: {
    backgroundColor: COLORS.primary,
  },
  bubbleAssistant: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  brand: {
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 11,
    marginBottom: 6,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  body: {
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  entityList: { marginTop: 10, gap: 8 },
  entity: {
    ...adminCardShell,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    marginBottom: 0,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    backgroundColor: 'rgba(168,85,247,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: COLORS.primary, fontWeight: '800', fontSize: 16 },
  entityBody: { flex: 1, minWidth: 0 },
  entityTitle: { color: COLORS.text, fontWeight: '800', fontSize: 15 },
  entitySub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  entityMeta: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  navBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(168,85,247,0.18)',
  },
  navBtnText: { color: COLORS.primary, fontWeight: '800', fontSize: 13 },
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
  chipText: { color: COLORS.text, fontWeight: '700', fontSize: 12 },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingText: { color: COLORS.textMuted, fontWeight: '600' },
});
