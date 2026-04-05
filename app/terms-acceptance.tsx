import {
  TERMS_ACCEPTANCE_STORAGE_KEY,
  emitTermsAccepted,
  normalizeReturnPathAfterTerms,
} from '@/constants/termsAcceptance';
import { theme } from '@/constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TermsAcceptanceScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [loading, setLoading] = useState(false);

  const accept = async () => {
    setLoading(true);
    try {
      await AsyncStorage.setItem(
        TERMS_ACCEPTANCE_STORAGE_KEY,
        new Date().toISOString(),
      );
      emitTermsAccepted();
      const next = normalizeReturnPathAfterTerms(
        typeof returnTo === 'string' ? returnTo : undefined,
      );
      router.replace(next as Parameters<typeof router.replace>[0]);
    } catch {
      Alert.alert('Error', 'Could not save your choice. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Terms of Use</Text>
        <Text style={styles.intro}>
          HalfOrder includes user-generated content. By continuing, you agree to
          follow these rules and our full Terms of Use and Privacy Policy (linked
          in the app).
        </Text>
        <View style={styles.bullets}>
          <Text style={styles.bullet}>• No abusive or harmful content</Text>
          <Text style={styles.bullet}>• No spam</Text>
          <Text style={styles.bullet}>• Respect other users</Text>
        </View>
      </ScrollView>
      <View style={styles.footer}>
      <TouchableOpacity
        style={[styles.primary, loading && styles.primaryDisabled]}
        onPress={accept}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={theme.colors.textOnPrimary} />
        ) : (
          <Text style={styles.primaryText}>Agree and Continue</Text>
        )}
      </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { padding: 24, paddingBottom: 120 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 16,
  },
  intro: {
    fontSize: 16,
    lineHeight: 24,
    color: theme.colors.textMuted,
    marginBottom: 24,
  },
  bullets: { gap: 14 },
  bullet: {
    fontSize: 17,
    lineHeight: 24,
    color: theme.colors.text,
    fontWeight: '500',
  },
  footer: {
    padding: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  primary: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: theme.radius.button,
    alignItems: 'center',
  },
  primaryDisabled: { opacity: 0.7 },
  primaryText: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.textOnPrimary,
  },
});
