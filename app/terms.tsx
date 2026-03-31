import { LEGAL_URLS } from '@/constants/legalLinks';
import { theme } from '@/constants/theme';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SUPPORT_EMAIL = 'support@halforder.app';
const LAST_UPDATED = 'March 31, 2026';

export default function TermsScreen() {
  const router = useRouter();
  const handleOpenMail = async () => {
    const url = `mailto:${SUPPORT_EMAIL}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) return;
      await Linking.openURL(url);
    } catch {
      // Keep screen stable even if mail client is unavailable.
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Terms of Service – HalfOrder</Text>
        <Text style={styles.meta}>Last updated: {LAST_UPDATED}</Text>

        <Text style={styles.paragraph}>
          These Terms of Service (&quot;Terms&quot;) govern your use of HalfOrder
          (&quot;HalfOrder,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), a
          mobile application that helps people share food, split meals, and divide costs with
          others. By creating an account or using HalfOrder, you agree to these Terms.
        </Text>

        <Text style={styles.sectionHeading}>1. User responsibilities</Text>
        <Text style={styles.paragraph}>You agree that you will:</Text>
        <Text style={styles.bullet}>
          • Provide accurate profile information and keep your login credentials secure.
        </Text>
        <Text style={styles.bullet}>
          • Use HalfOrder only for lawful purposes and in compliance with applicable regulations.
        </Text>
        <Text style={styles.bullet}>
          • Communicate honestly with other users about shared orders, timing, and payment
          expectations.
        </Text>
        <Text style={styles.bullet}>
          • Not harass, threaten, defraud, or endanger others; not post unlawful or infringing
          content.
        </Text>
        <Text style={styles.bullet}>
          • Report objectionable content through in-app tools and cooperate with any reasonable
          safety review.
        </Text>
        <Text style={styles.paragraph}>
          You are solely responsible for your interactions with other users and for any meetups
          or exchanges that you arrange. HalfOrder is a facilitation platform only and does not
          supervise offline conduct.
        </Text>

        <Text style={styles.sectionHeading}>2. Payments and refunds</Text>
        <Text style={styles.paragraph}>
          HalfOrder may offer optional paid plans or in-app purchases processed by Apple App Store
          or Google Play. Those stores&apos; payment terms apply to those transactions. Unless
          required by applicable law or the applicable store policy, all fees are non-refundable,
          and you are responsible for canceling renewal subscriptions through your store account
          settings before the next billing date if you do not wish to renew.
        </Text>
        <Text style={styles.paragraph}>
          Payments or splits between users for food orders are agreements between you and other
          users. HalfOrder is not a party to those agreements, is not a bank or money transmitter,
          and does not guarantee payment performance. Disputes between users should be resolved
          directly between the parties involved.
        </Text>

        <Text style={styles.sectionHeading}>3. Privacy and data usage</Text>
        <Text style={styles.paragraph}>
          We process personal data as described in our Privacy Policy ({LEGAL_URLS.privacy}),
          including account details, profile information, device and usage data, and content you
          submit (such as messages). By using HalfOrder, you acknowledge this processing and agree
          to the Privacy Policy.
        </Text>

        <Text style={styles.sectionHeading}>4. Liability disclaimer</Text>
        <Text style={styles.paragraph}>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, HALFORDER AND ITS AFFILIATES, OFFICERS,
          DIRECTORS, EMPLOYEES, AND AGENTS PROVIDE THE SERVICE &quot;AS IS&quot; AND &quot;AS
          AVAILABLE,&quot; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING
          IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
          NON-INFRINGEMENT.
        </Text>
        <Text style={styles.paragraph}>
          WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF
          HARMFUL COMPONENTS. WE ARE NOT RESPONSIBLE FOR FOOD QUALITY, ALLERGENS, DELIVERY ISSUES,
          PAYMENT DISPUTES BETWEEN USERS, OR ANY LOSS ARISING FROM YOUR RELIANCE ON INFORMATION
          PROVIDED BY OTHER USERS.
        </Text>
        <Text style={styles.paragraph}>
          TO THE EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF THESE
          TERMS OR THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID TO HALFORDER
          FOR THE SERVICE IN THE TWELVE (12) MONTHS BEFORE THE CLAIM OR (B) ONE HUNDRED US
          DOLLARS (US $100). SOME JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS; IN THOSE CASES,
          OUR LIABILITY WILL BE LIMITED TO THE FULLEST EXTENT PERMITTED BY LAW.
        </Text>

        <Text style={styles.sectionHeading}>5. Content and moderation</Text>
        <Text style={styles.paragraph}>
          You retain rights to content you submit, but grant HalfOrder a worldwide, non-exclusive
          license to host, store, and display that content as needed to operate the Service. We
          may remove content or restrict accounts that violate these Terms or pose safety risks,
          at our reasonable discretion.
        </Text>

        <Text style={styles.sectionHeading}>6. Termination</Text>
        <Text style={styles.paragraph}>
          You may stop using HalfOrder at any time. We may suspend or terminate access for
          conduct that violates these Terms, creates risk, or is required by law.
        </Text>

        <Text style={styles.sectionHeading}>7. Changes</Text>
        <Text style={styles.paragraph}>
          We may update these Terms. We will post the revised Terms in the app and update the
          &quot;Last updated&quot; date. Continued use after changes become effective constitutes
          acceptance unless applicable law requires additional consent.
        </Text>

        <Text style={styles.sectionHeading}>8. Contact</Text>
        <Text style={styles.paragraph}>
          Questions about these Terms:{' '}
        </Text>
        <TouchableOpacity onPress={handleOpenMail}>
          <Text style={styles.link}>{SUPPORT_EMAIL}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: { marginRight: 12 },
  backText: { fontSize: 16, color: theme.colors.accentBlue, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 48 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  meta: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 8,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
    color: theme.colors.text,
    marginBottom: 12,
  },
  bullet: {
    fontSize: 16,
    lineHeight: 24,
    color: theme.colors.text,
    marginBottom: 6,
    paddingLeft: 4,
  },
  link: {
    fontSize: 16,
    lineHeight: 24,
    color: theme.colors.accentBlue,
    textDecorationLine: 'underline',
    marginBottom: 12,
  },
});
