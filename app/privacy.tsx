import { goBackFromProfileScreen } from '@/lib/profileBack';
import { theme } from '../constants/theme';
import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
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
const LAST_UPDATED = 'August 2026';

function Bullets({ items }: { items: string[] }) {
  return (
    <>
      {items.map((line, i) => (
        <Text key={`${i}-${line}`} style={styles.bullet}>
          • {line}
        </Text>
      ))}
    </>
  );
}

function Hr() {
  return <View style={styles.hr} />;
}

export default function PrivacyScreen() {
  const router = useRouter();

  const openMail = useCallback(() => {
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => goBackFromProfileScreen(router)}
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
        <Text style={styles.title}>Privacy Policy – HalfOrder</Text>
        <Text style={styles.meta}>
          <Text style={styles.metaStrong}>Last Updated:</Text> {LAST_UPDATED}
        </Text>
        <Text style={styles.paragraph}>
          HalfOrder (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) respects your privacy and
          is committed to protecting your personal data. This Privacy Policy
          explains what information we collect, how we use it, and your rights.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>1. Information We Collect</Text>

        <Text style={styles.subheading}>a. Personal Information</Text>
        <Bullets
          items={[
            'Full name',
            'Email address',
            'Phone number (for order coordination and account verification)',
            'Profile photo (if uploaded)',
            'Sign-in method (Email/Password, Google, or Apple ID)',
          ]}
        />

        <Text style={styles.subheading}>b. Payment Information</Text>
        <Bullets
          items={[
            'Payment method type (card brand, last 4 digits) — stored by Stripe',
            'Apple Pay tokens — processed by Apple and Stripe; we never see your full card details',
            'Transaction history (order amounts, dates, payment status)',
            'HalfOrder Cash balance and transaction records',
          ]}
        />
        <Text style={styles.paragraph}>
          We do NOT store your full card number, CVV, or expiry date. All card
          data is handled by Stripe.
        </Text>

        <Text style={styles.subheading}>c. Location Data</Text>
        <Bullets
          items={[
            'Approximate GPS location — to show nearby restaurants and match users for food sharing.',
            'Driver location — collected during active deliveries to show real-time tracking to customers.',
          ]}
        />
        <Text style={styles.paragraph}>
          We do NOT track your location continuously in the background when you
          are not actively using the app.
        </Text>

        <Text style={styles.subheading}>d. Usage &amp; Activity Data</Text>
        <Bullets
          items={[
            'Orders created, joined, or completed',
            'Swipe and match activity',
            'Messages sent between users',
            'App screens viewed and features used',
            'Referrals sent and accepted',
          ]}
        />

        <Text style={styles.subheading}>e. Device Information</Text>
        <Bullets
          items={[
            'Device type and operating system',
            'Push notification token',
            'App version',
            'Crash logs and error reports',
          ]}
        />

        <Hr />

        <Text style={styles.sectionHeading}>2. How We Use Your Information</Text>
        <Text style={styles.paragraph}>We use your data to:</Text>
        <Bullets
          items={[
            'Provide all HalfOrder features (Swipe, Full Order, Food Share, delivery)',
            'Process payments and manage HalfOrder Cash balances',
            'Match users with nearby restaurants and food-sharing opportunities',
            'Enable real-time delivery tracking for customers and drivers',
            'Send order confirmations, status updates, and push notifications',
            'Detect and prevent fraud, abuse, or unauthorized activity',
            'Improve app performance, fix bugs, and develop new features',
            'Comply with legal obligations and enforce our Terms of Service',
          ]}
        />

        <Hr />

        <Text style={styles.sectionHeading}>3. Payment &amp; Stripe</Text>
        <Text style={styles.paragraph}>
          All payments are processed by Stripe, Inc., a PCI-DSS-compliant
          payment processor.
        </Text>
        <Bullets
          items={[
            'Your card details are encrypted and sent directly to Stripe — we never see or store your full card number.',
            'Apple Pay tokens are processed by Apple and Stripe without exposing your card data to HalfOrder.',
            'Driver payouts are processed via Stripe Connect.',
            'Restaurant payouts are processed via Stripe Connect after applicable platform fees.',
          ]}
        />

        <Hr />

        <Text style={styles.sectionHeading}>4. Location Data</Text>
        <Text style={styles.paragraph}>We request location access to:</Text>
        <Bullets
          items={[
            'Show restaurants and food cards near you.',
            'Set your delivery address automatically.',
            'Track driver location during active deliveries (drivers only).',
          ]}
        />
        <Text style={styles.paragraph}>
          You can revoke location access at any time in your device Settings.
          Some features may not work without location access.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>5. Photos &amp; Camera</Text>
        <Text style={styles.paragraph}>We may request camera or photo access to:</Text>
        <Bullets
          items={[
            'Upload a profile photo.',
            'Add food photos to your orders or food cards.',
          ]}
        />
        <Text style={styles.paragraph}>
          We only access photos you explicitly select. We do NOT scan your full
          photo library.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>6. Messaging &amp; Chat</Text>
        <Text style={styles.paragraph}>Messages between users are stored to:</Text>
        <Bullets
          items={[
            'Enable in-app communication.',
            'Resolve disputes between users.',
            'Detect and prevent abuse or harmful content.',
          ]}
        />
        <Text style={styles.paragraph}>
          We do NOT sell or share your messages with third parties for
          advertising purposes.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>7. Driver Data</Text>
        <Text style={styles.paragraph}>For driver accounts, we collect:</Text>
        <Bullets
          items={[
            'Real-time location during active deliveries.',
            'Delivery history, completion rate, and ratings.',
            'Stripe Connect account details for payout processing.',
          ]}
        />
        <Text style={styles.paragraph}>
          Driver location is shared with the assigned customer during an active
          delivery only.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>8. Restaurant Data</Text>
        <Text style={styles.paragraph}>For restaurant accounts, we collect:</Text>
        <Bullets
          items={[
            'Restaurant name, address, and contact details.',
            'Menu items, prices, and photos.',
            'Order history and fulfillment data.',
            'Stripe Connect account details for payout processing.',
          ]}
        />

        <Hr />

        <Text style={styles.sectionHeading}>9. Data Sharing</Text>
        <Text style={styles.paragraph}>
          We do NOT sell your personal data to advertisers or third parties.
        </Text>
        <Text style={styles.paragraph}>We may share your data with:</Text>
        <Bullets
          items={[
            'Stripe — for payment processing and payouts.',
            'Firebase (Google) — for database, authentication, storage, and push notifications.',
            'Other users — your display name and photo are visible to users you match or transact with.',
            'Law enforcement — if required by applicable law or court order.',
            'Safety purposes — to protect users or prevent fraud.',
          ]}
        />

        <Hr />

        <Text style={styles.sectionHeading}>10. Push Notifications</Text>
        <Text style={styles.paragraph}>We send notifications for:</Text>
        <Bullets
          items={[
            'Order confirmations and status updates.',
            'New messages from other users.',
            'Driver assignment and delivery updates.',
            'Promotions and platform announcements.',
          ]}
        />
        <Text style={styles.paragraph}>
          You can disable push notifications at any time in your device Settings.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>11. Data Security</Text>
        <Text style={styles.paragraph}>We use industry-standard security measures:</Text>
        <Bullets
          items={[
            'Firebase Security Rules to restrict data access.',
            'Encrypted connections (HTTPS/TLS) for all data in transit.',
            "Stripe's PCI-DSS-compliant infrastructure for payment data.",
            'Firebase Authentication for secure account access.',
          ]}
        />
        <Text style={styles.paragraph}>However, no system is 100% secure.</Text>

        <Hr />

        <Text style={styles.sectionHeading}>12. Your Rights</Text>
        <Text style={styles.paragraph}>
          Under Canadian privacy law (PIPEDA), you have the right to:
        </Text>
        <Bullets
          items={[
            'Access the personal data we hold about you.',
            'Correct inaccurate or outdated information.',
            'Delete your account and associated personal data.',
            'Withdraw consent for data processing (may limit functionality).',
            'Port your data in a machine-readable format.',
          ]}
        />
        <Text style={styles.paragraph}>
          To exercise any of these rights, contact us at:{' '}
          <Text onPress={openMail} style={styles.link}>
            {SUPPORT_EMAIL}
          </Text>
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>13. Data Retention</Text>
        <Bullets
          items={[
            'Account data — retained until you request deletion.',
            'Transaction records — retained for 7 years for legal and tax compliance.',
            'Messages — retained for 2 years for dispute resolution.',
            'Deleted account data — removed within 30 days, except where legally required.',
          ]}
        />

        <Hr />

        <Text style={styles.sectionHeading}>14. Children&apos;s Privacy</Text>
        <Text style={styles.paragraph}>
          HalfOrder is not intended for users under 18. We do not knowingly
          collect data from minors. If we become aware that a minor has created
          an account, we will promptly delete it.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>15. Third-Party Services</Text>
        <Text style={styles.paragraph}>HalfOrder uses:</Text>
        <Bullets
          items={[
            'Firebase (Google) — database, authentication, storage, notifications.',
            'Stripe — payment processing and payouts.',
            'Google Maps — location and address autocomplete.',
            'Apple Sign In — sign-in via Apple ID.',
          ]}
        />

        <Hr />

        <Text style={styles.sectionHeading}>16. Changes to This Policy</Text>
        <Text style={styles.paragraph}>
          We may update this Privacy Policy. When we make material changes, we
          will notify you through the app and require your acknowledgment before
          continued use.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>17. Governing Law</Text>
        <Text style={styles.paragraph}>
          This Privacy Policy is governed by the laws of Canada, including
          PIPEDA and applicable provincial legislation.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>18. Contact Us</Text>
        <Text style={styles.paragraph}>
          For privacy questions or data requests:{' '}
          <Text onPress={openMail} style={styles.link}>
            {SUPPORT_EMAIL}
          </Text>
        </Text>

        <Hr />

        <Text style={styles.footerNote}>
          By using HalfOrder, you consent to the collection and use of your
          information as described in this Privacy Policy.
        </Text>
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
  metaStrong: { fontWeight: '700', color: theme.colors.text },
  hr: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginVertical: 16,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 4,
    marginBottom: 8,
  },
  subheading: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: 10,
    marginBottom: 6,
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
    fontWeight: '600',
  },
  footerNote: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.textMuted,
    marginTop: 4,
    paddingTop: 8,
  },
});
