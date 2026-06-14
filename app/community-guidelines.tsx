import { acceptCommunityGuidelines } from '@/services/chatModeration';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { showError, showSuccess } from '@/utils/toast';

const GUIDELINES = [
  'Be respectful in all meal-share chats.',
  'No harassment, threats, or hate speech.',
  'No spam, scams, or fraud attempts.',
  'Do not share passwords, payment cards, or sensitive personal data.',
  'Report unsafe behavior — we review every report.',
];

export default function CommunityGuidelinesScreen() {
  const router = useRouter();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const [busy, setBusy] = useState(false);

  const handleAccept = () => {
    void (async () => {
      setBusy(true);
      try {
        await acceptCommunityGuidelines();
        showSuccess('Thanks for helping keep HalfOrder safe.');
        if (typeof redirect === 'string' && redirect.trim()) {
          router.replace(redirect as never);
        } else {
          router.back();
        }
      } catch (e) {
        const err = e as { code?: string; message?: string };
        console.error('[GUIDELINES ACCEPT] screen failure', {
          code: err?.code ?? 'unknown',
          message: err?.message ?? String(e),
          error: e,
          redirect,
        });
        showError('Could not save acceptance. Try again.');
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.pad}>
        <Ionicons name="shield-checkmark" size={48} color="#7DFFB8" />
        <Text style={styles.title}>Community Guidelines</Text>
        <Text style={styles.sub}>
          Before chatting in meal shares, please agree to our respectful communication
          standards. This helps us meet App Store and Google Play safety requirements.
        </Text>

        <View style={styles.card}>
          {GUIDELINES.map((line) => (
            <View key={line} style={styles.row}>
              <Ionicons name="checkmark-circle" size={18} color="#7DFFB8" />
              <Text style={styles.line}>{line}</Text>
            </View>
          ))}
        </View>

        <Pressable
          style={[styles.btn, busy && styles.btnDisabled]}
          disabled={busy}
          onPress={handleAccept}
        >
          {busy ? (
            <ActivityIndicator color="#0A0A0A" />
          ) : (
            <Text style={styles.btnTxt}>I agree — continue to chat</Text>
          )}
        </Pressable>

        <Pressable style={styles.linkBtn} onPress={() => router.push('/safety' as never)}>
          <Text style={styles.linkTxt}>Read full safety policy</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const c = theme.colors;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#06080C' },
  pad: { padding: 24, alignItems: 'center', gap: 14 },
  title: { color: '#FFF', fontSize: 26, fontWeight: '900', textAlign: 'center' },
  sub: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 12,
    marginTop: 8,
  },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  line: { flex: 1, color: '#FFF', fontSize: 15, lineHeight: 21, fontWeight: '600' },
  btn: {
    width: '100%',
    marginTop: 12,
    height: 52,
    borderRadius: 999,
    backgroundColor: '#7DFFB8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnTxt: { color: '#0A0A0A', fontWeight: '900', fontSize: 16 },
  linkBtn: { paddingVertical: 12 },
  linkTxt: { color: c.primary, fontWeight: '700' },
});
