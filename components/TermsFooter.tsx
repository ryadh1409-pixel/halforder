import { LEGAL_URLS } from '@/constants/legalLinks';
import { theme } from '@/constants/theme';
import React, { useCallback } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type TermsFooterProps = {
  /** Extra margin above the footer (e.g. after a primary CTA). */
  style?: StyleProp<ViewStyle>;
};

async function openUrl(url: string): Promise<void> {
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    }
  } catch {
    // Avoid crashing if the system cannot open the URL.
  }
}

/**
 * App Store–style subscription disclaimer: auto-renew copy + tappable legal links.
 * Uses public URLs so Safari / in-app browser matches your marketing site when configured.
 */
export function TermsFooter({ style }: TermsFooterProps) {
  const onPrivacy = useCallback(() => {
    void openUrl(LEGAL_URLS.privacy);
  }, []);
  const onTerms = useCallback(() => {
    void openUrl(LEGAL_URLS.terms);
  }, []);

  return (
    <View style={[styles.wrap, style]} accessibilityRole="text">
      <Text style={styles.renewalText} accessibilityLabel="Monthly subscription renews automatically.">
        Monthly subscription renews automatically.
      </Text>
      <View style={styles.linksRow}>
        <Pressable
          onPress={onPrivacy}
          hitSlop={12}
          accessibilityRole="link"
          accessibilityLabel="Privacy Policy. Opens in browser."
        >
          <Text style={styles.linkText}>Privacy Policy</Text>
        </Pressable>
        <Text style={styles.separator}> | </Text>
        <Pressable
          onPress={onTerms}
          hitSlop={12}
          accessibilityRole="link"
          accessibilityLabel="Terms of Service. Opens in browser."
        >
          <Text style={styles.linkText}>Terms of Service</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  renewalText: {
    fontSize: Platform.select({ ios: 13, default: 12 }),
    lineHeight: Platform.select({ ios: 18, default: 17 }),
    color: theme.colors.textSecondary,
    textAlign: 'center',
    letterSpacing: Platform.OS === 'ios' ? -0.08 : 0,
    maxWidth: 320,
  },
  linksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  linkText: {
    fontSize: Platform.select({ ios: 13, default: 12 }),
    lineHeight: Platform.select({ ios: 18, default: 17 }),
    color: theme.colors.textMuted,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  separator: {
    fontSize: Platform.select({ ios: 13, default: 12 }),
    color: theme.colors.textSecondary,
  },
});
