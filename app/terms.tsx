import { theme } from '@/constants/theme';
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
const LAST_UPDATED = 'April 2026';

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
        <Text style={styles.meta}>
          <Text style={styles.metaStrong}>Last Updated:</Text> {LAST_UPDATED}
        </Text>
        <Text style={styles.paragraph}>
          Welcome to HalfOrder. By using our platform, you agree to the following Terms
          of Service. Please read them carefully.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>1. Overview of Service</Text>
        <Text style={styles.paragraph}>
          HalfOrder is a platform that connects users who want to share food orders. The
          app facilitates coordination between users but does not sell, prepare, or
          deliver food.
        </Text>
        <Text style={styles.paragraph}>
          HalfOrder is not a restaurant, delivery service, or payment processor.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>2. User Responsibilities</Text>
        <Text style={styles.paragraph}>By using HalfOrder, you agree that:</Text>
        <Bullets
          items={[
            'You are at least 18 years old.',
            'You provide accurate and truthful information.',
            'You are solely responsible for your interactions with other users.',
            'You agree to behave respectfully and not engage in fraud, harassment, or illegal activities.',
          ]}
        />
        <Text style={styles.paragraph}>HalfOrder is not responsible for user behavior.</Text>

        <Hr />

        <Text style={styles.sectionHeading}>3. Payments Disclaimer</Text>
        <Text style={styles.paragraph}>
          All payments are handled directly between users{' '}
          <Text style={styles.bold}>outside of the app</Text>.
        </Text>
        <Text style={styles.paragraph}>HalfOrder:</Text>
        <Bullets
          items={[
            'Does NOT process payments',
            'Does NOT hold money',
            'Does NOT guarantee transactions',
          ]}
        />
        <Text style={styles.paragraph}>
          You agree that any financial interaction is entirely at your own risk.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>4. Food &amp; Safety Disclaimer</Text>
        <Text style={styles.paragraph}>HalfOrder does not verify:</Text>
        <Bullets items={['Food quality', 'Food safety', 'Restaurant standards']} />
        <Text style={styles.paragraph}>Users are responsible for:</Text>
        <Bullets
          items={[
            'Choosing where to order from',
            'Ensuring food meets their dietary needs',
          ]}
        />
        <Text style={styles.paragraph}>
          HalfOrder is not liable for any health issues, allergies, or damages.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>5. User-Generated Content</Text>
        <Text style={styles.paragraph}>Users may create content such as:</Text>
        <Bullets items={['Food orders', 'Messages', 'Photos']} />
        <Text style={styles.paragraph}>By posting content, you agree that:</Text>
        <Bullets
          items={[
            'You own or have rights to the content',
            'Content does not violate any laws',
            'Content is not abusive, misleading, or harmful',
          ]}
        />
        <Text style={styles.paragraph}>
          HalfOrder reserves the right to remove any content at any time.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>6. Account Suspension</Text>
        <Text style={styles.paragraph}>
          We may suspend or terminate accounts if users:
        </Text>
        <Bullets
          items={[
            'Violate these terms',
            'Engage in suspicious or harmful behavior',
            'Abuse the platform',
          ]}
        />
        <Text style={styles.paragraph}>
          No prior notice is required in serious cases.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>7. Limitation of Liability</Text>
        <Text style={styles.paragraph}>HalfOrder is provided &quot;as is&quot;.</Text>
        <Text style={styles.paragraph}>We are NOT responsible for:</Text>
        <Bullets
          items={[
            'Failed meetups between users',
            'Payment disputes',
            'Food quality issues',
            'User misconduct',
          ]}
        />
        <Text style={styles.paragraph}>
          To the fullest extent permitted by law, HalfOrder disclaims all liability.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>8. Privacy</Text>
        <Text style={styles.paragraph}>
          Your use of the app is also governed by our{' '}
          <Text onPress={() => router.push('/privacy')} style={styles.link}>
            Privacy Policy
          </Text>
          .
        </Text>
        <Text style={styles.paragraph}>
          We only collect necessary data to operate the platform and improve user
          experience.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>9. Changes to Terms</Text>
        <Text style={styles.paragraph}>We may update these Terms at any time.</Text>
        <Text style={styles.paragraph}>
          Users will be notified of major changes. Continued use of the app means you
          accept the updated terms.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>10. Contact</Text>
        <Text style={styles.paragraph}>
          For any questions or concerns:{' '}
          <Text onPress={openMail} style={styles.link}>
            {SUPPORT_EMAIL}
          </Text>
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>11. Governing Law</Text>
        <Text style={styles.paragraph}>
          These Terms are governed by the laws of Canada.
        </Text>

        <Hr />

        <Text style={styles.footerNote}>
          By using HalfOrder, you acknowledge that you understand and agree to these
          Terms.
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
  bold: { fontWeight: '700' },
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
