import { adminCardShell, adminColors as COLORS, adminFontFamily } from '@/constants/adminTheme';
import { adminRoutes } from '@/constants/adminRoutes';
import {
  ADMIN_AI_SUGGESTION_CHIPS,
  buildAdminAiGreeting,
} from '@/types/adminAiAssistant';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

/**
 * Compact Admin AI entry card on the Admin Dashboard home.
 */
export function AdminAiAssistantPanel({
  displayName,
}: {
  displayName: string | null | undefined;
}) {
  const router = useRouter();
  const greeting = useMemo(() => {
    const first =
      (displayName ?? '').trim().split(/\s+/).filter(Boolean)[0] || 'there';
    return buildAdminAiGreeting(first);
  }, [displayName]);

  const openAssistant = (prompt?: string) => {
    const href = prompt
      ? `${adminRoutes.adminAiAssistant}?prompt=${encodeURIComponent(prompt)}`
      : adminRoutes.adminAiAssistant;
    router.push(href as never);
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Ionicons name="sparkles" size={18} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Admin AI</Text>
          <Text style={styles.greeting} numberOfLines={2}>
            {greeting}
          </Text>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {ADMIN_AI_SUGGESTION_CHIPS.map((chip) => (
          <Pressable
            key={chip.id}
            style={({ pressed }) => [styles.chip, pressed && { opacity: 0.85 }]}
            onPress={() => openAssistant(chip.prompt)}
          >
            <Text style={styles.chipText}>{chip.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable
        style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
        onPress={() => openAssistant()}
      >
        <Text style={styles.ctaText}>Open Assistant</Text>
        <Ionicons name="arrow-forward" size={16} color="#FFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...adminCardShell,
    marginBottom: 20,
    borderColor: 'rgba(168,85,247,0.35)',
    backgroundColor: 'rgba(168,85,247,0.08)',
  },
  headerRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    fontFamily: adminFontFamily,
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  greeting: {
    fontFamily: adminFontFamily,
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  chips: { gap: 8, paddingBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(9,9,11,0.55)',
  },
  chipText: {
    fontFamily: adminFontFamily,
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 12,
  },
  cta: {
    marginTop: 14,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ctaText: {
    fontFamily: adminFontFamily,
    color: '#FFF',
    fontWeight: '800',
    fontSize: 13,
  },
});
