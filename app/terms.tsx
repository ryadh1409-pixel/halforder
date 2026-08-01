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

export default function TermsScreen() {
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
        <Text style={styles.title}>Terms of Service – HalfOrder</Text>
        <Text style={styles.meta}>
          <Text style={styles.metaStrong}>Last Updated:</Text> {LAST_UPDATED}
        </Text>
        <Text style={styles.paragraph}>
          Welcome to HalfOrder. By using our platform, you agree to the
          following Terms of Service. Please read them carefully before using
          the app.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>1. Overview of Service</Text>
        <Text style={styles.paragraph}>
          HalfOrder is a mobile platform that enables users to discover, share,
          and pay for food orders. The app connects users (customers), drivers,
          and restaurants through a unified marketplace.
        </Text>
        <Text style={styles.paragraph}>HalfOrder offers the following features:</Text>
        <Bullets
          items={[
            'Swipe & Match: Discover food cards and join or split a meal with other users.',
            'Full Order: Place and pay for a complete food order through the app.',
            'Food Share: Share a meal with another user and split the cost.',
            'Driver Delivery: Drivers pick up and deliver orders to customers.',
            'Restaurant Portal: Restaurants list menus and receive orders.',
            'HalfOrder Cash: Earn and redeem cashback rewards on eligible orders.',
          ]}
        />
        <Text style={styles.paragraph}>
          HalfOrder processes payments using Stripe, a third-party payment
          processor. HalfOrder is not a restaurant or delivery company.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>2. Eligibility</Text>
        <Text style={styles.paragraph}>To use HalfOrder, you must:</Text>
        <Bullets
          items={[
            'Be at least 18 years old.',
            'Have the legal capacity to enter into a binding agreement.',
            'Provide accurate, complete, and current information.',
            'Not be previously banned or suspended from the platform.',
          ]}
        />

        <Hr />

        <Text style={styles.sectionHeading}>3. Account Registration</Text>
        <Text style={styles.paragraph}>
          You may register using your email address, Google account, or Apple
          ID. You are responsible for maintaining the confidentiality of your
          account credentials and all activity under your account.
        </Text>
        <Text style={styles.paragraph}>
          Report any unauthorized use immediately to{' '}
          <Text onPress={openMail} style={styles.link}>
            {SUPPORT_EMAIL}
          </Text>
          .
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>4. Payments &amp; Billing</Text>
        <Text style={styles.paragraph}>
          HalfOrder uses Stripe to securely process all payments. By making a
          payment, you agree to Stripe's Terms of Service and Privacy Policy.
        </Text>
        <Text style={styles.paragraph}>We accept:</Text>
        <Bullets
          items={[
            'Credit and debit cards (Visa, Mastercard, Amex)',
            'Apple Pay',
            'Saved cards via Stripe',
            'HalfOrder Cash (platform credits)',
          ]}
        />
        <Text style={styles.paragraph}>
          All charges are in Canadian Dollars (CAD). Applicable taxes
          (HST/GST) are added at checkout.
        </Text>
        <Text style={styles.paragraph}>
          HalfOrder does not store your full card number. Card data is
          tokenized and stored securely by Stripe.
        </Text>
        <Text style={styles.paragraph}>
          All payments are final unless a refund is approved by HalfOrder.
          Refunds may take 5–10 business days.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>5. HalfOrder Cash &amp; Rewards</Text>
        <Bullets
          items={[
            'HalfOrder Cash has no cash value and cannot be withdrawn or transferred.',
            'Credits expire as described in the app at the time of issuance.',
            'HalfOrder may modify, suspend, or cancel the rewards program at any time.',
            'Earned credits may be forfeited if your account is suspended or terminated.',
          ]}
        />

        <Hr />

        <Text style={styles.sectionHeading}>6. Swipe &amp; Food Sharing</Text>
        <Text style={styles.paragraph}>By participating in Swipe or Food Share:</Text>
        <Bullets
          items={[
            'You agree to honor any match you accept and complete the associated payment.',
            'HalfOrder does not guarantee match quality or outcomes.',
            'Canceling a confirmed match may result in a cancellation fee or account restriction.',
            'HalfOrder is not liable for disagreements between matched users.',
          ]}
        />

        <Hr />

        <Text style={styles.sectionHeading}>7. Full Orders</Text>
        <Text style={styles.paragraph}>By placing a Full Order:</Text>
        <Bullets
          items={[
            'You authorize HalfOrder to charge your selected payment method for the total shown at checkout.',
            'Orders are sent directly to the restaurant for preparation.',
            'Cancellations may not be possible once the restaurant has confirmed the order.',
            'HalfOrder is not responsible for food quality, preparation errors, or restaurant delays.',
          ]}
        />

        <Hr />

        <Text style={styles.sectionHeading}>8. Driver Terms</Text>
        <Text style={styles.paragraph}>
          Drivers are independent contractors. By registering as a driver:
        </Text>
        <Bullets
          items={[
            "You confirm you hold a valid driver's license and are legally permitted to operate a vehicle.",
            'You are responsible for maintaining adequate vehicle insurance.',
            'You must pick up and deliver orders promptly and professionally.',
            'You must not misrepresent your location or falsify delivery confirmations.',
            'Driver earnings are paid via Stripe Connect. You are responsible for your own taxes.',
            'HalfOrder may deactivate driver accounts for misconduct or violations.',
          ]}
        />

        <Hr />

        <Text style={styles.sectionHeading}>9. Restaurant Terms</Text>
        <Text style={styles.paragraph}>Restaurants listed on HalfOrder agree to:</Text>
        <Bullets
          items={[
            'Keep menu items, prices, and descriptions accurate and up to date.',
            'Comply with all local food safety and health regulations.',
            'Fulfill accepted orders promptly.',
            'Receive payouts via Stripe Connect after platform fees are deducted.',
          ]}
        />

        <Hr />

        <Text style={styles.sectionHeading}>10. Phone Number &amp; Communications</Text>
        <Text style={styles.paragraph}>
          HalfOrder may collect your phone number for order coordination,
          status updates, and account verification. By providing your phone
          number, you consent to receiving order-related communications.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>11. User-Generated Content</Text>
        <Text style={styles.paragraph}>By posting content, you agree that:</Text>
        <Bullets
          items={[
            'You own or have rights to the content.',
            'Content does not violate any laws or rights.',
            'Content is not abusive, misleading, offensive, or harmful.',
            'You grant HalfOrder a non-exclusive, royalty-free license to display your content within the platform.',
          ]}
        />
        <Text style={styles.paragraph}>
          HalfOrder may remove any content at any time without notice.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>12. Community Guidelines</Text>
        <Text style={styles.paragraph}>Users must not:</Text>
        <Bullets
          items={[
            'Harass, threaten, or abuse other users, drivers, or restaurant staff.',
            'Post false, misleading, or fraudulent information.',
            'Attempt to manipulate ratings, reviews, or the matching system.',
            'Use the platform for any illegal purpose.',
            'Create multiple accounts to circumvent suspensions.',
          ]}
        />

        <Hr />

        <Text style={styles.sectionHeading}>13. Referral Program</Text>
        <Text style={styles.paragraph}>
          Referral rewards are subject to eligibility requirements and may be
          modified or discontinued at any time. Fraudulent referrals will result
          in disqualification and possible account suspension.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>14. Account Suspension &amp; Termination</Text>
        <Text style={styles.paragraph}>
          HalfOrder may suspend or terminate your account if you:
        </Text>
        <Bullets
          items={[
            'Violate these Terms of Service.',
            'Engage in fraudulent or harmful behavior.',
            'Receive repeated complaints from other users.',
            'Abuse the payments, rewards, or referral system.',
          ]}
        />
        <Text style={styles.paragraph}>
          No prior notice is required in serious cases. Upon termination, any
          unused HalfOrder Cash is forfeited.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>15. Food &amp; Safety Disclaimer</Text>
        <Text style={styles.paragraph}>
          HalfOrder does not prepare, handle, or deliver food directly. We do
          not verify food quality, allergen information, or restaurant health
          standards. Users with dietary restrictions must confirm with
          restaurants directly.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>16. Limitation of Liability</Text>
        <Text style={styles.paragraph}>HalfOrder is provided &quot;as is&quot;.</Text>
        <Text style={styles.paragraph}>
          To the fullest extent permitted by law, HalfOrder is not liable for:
        </Text>
        <Bullets
          items={[
            'Any indirect, incidental, or consequential damages.',
            'Failed or delayed deliveries, order errors, or restaurant closures.',
            'Disputes between users, drivers, or restaurants.',
            'Unauthorized access to your account or payment data.',
            'Food quality, safety, or allergen issues.',
          ]}
        />
        <Text style={styles.paragraph}>
          Our total liability shall not exceed the amount you paid for the
          specific transaction giving rise to the claim.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>17. Privacy</Text>
        <Text style={styles.paragraph}>
          Your use of the app is governed by our{' '}
          <Text onPress={() => router.push('/privacy')} style={styles.link}>
            Privacy Policy
          </Text>
          , which is incorporated into these Terms by reference.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>18. Changes to Terms</Text>
        <Text style={styles.paragraph}>
          We may update these Terms at any time. When we make material changes,
          we will notify you through the app and require your acceptance before
          continued use.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>19. Governing Law</Text>
        <Text style={styles.paragraph}>
          These Terms are governed by the laws of the Province of Ontario and
          the federal laws of Canada. Any disputes shall be resolved in the
          courts of Ontario, Canada.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>20. Contact Us</Text>
        <Text style={styles.paragraph}>
          For questions or support:{' '}
          <Text onPress={openMail} style={styles.link}>
            {SUPPORT_EMAIL}
          </Text>
        </Text>

        <Hr />

        <Text style={styles.footerNote}>
          By using HalfOrder, you acknowledge that you have read, understood,
          and agree to be bound by these Terms of Service.
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
