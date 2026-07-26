import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { adminRoutes } from '@/constants/adminRoutes';
import {
  ADMIN_AI_SUGGESTION_CHIPS,
  buildAdminAiGreeting,
} from '@/types/adminAiAssistant';
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
 * Does not redesign the dashboard — additive section only.
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
      <Text style={styles.kicker}>Admin AI Assistant</Text>
      <Text style={styles.greeting}>{greeting}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {ADMIN_AI_SUGGESTION_CHIPS.map((chip) => (
          <Pressable
            key={chip.id}
            style={styles.chip}
            onPress={() => openAssistant(chip.prompt)}
          >
            <Text style={styles.chipText}>{chip.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable style={styles.cta} onPress={() => openAssistant()}>
        <Text style={styles.ctaText}>Open Admin AI →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...adminCardShell,
    marginBottom: 16,
    borderColor: 'rgba(168,85,247,0.35)',
  },
  kicker: {
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  greeting: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    marginBottom: 12,
  },
  chips: { gap: 8, paddingBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  chipText: { color: COLORS.text, fontWeight: '700', fontSize: 12 },
  cta: {
    marginTop: 14,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  ctaText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
});
