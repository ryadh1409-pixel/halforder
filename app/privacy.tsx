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

export default function PrivacyScreen() {
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
        <Text style={styles.title}>Privacy Policy – HalfOrder</Text>
        <Text style={styles.meta}>
          <Text style={styles.metaStrong}>Last Updated:</Text> {LAST_UPDATED}
        </Text>
        <Text style={styles.paragraph}>
          HalfOrder (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) respects your privacy and is
          committed to protecting your personal data. This Privacy Policy explains how
          we collect, use, and protect your information.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>1. Information We Collect</Text>
        <Text style={styles.paragraph}>
          We may collect the following types of information:
        </Text>
        <Text style={styles.subheading}>a. Personal Information</Text>
        <Bullets
          items={['Name', 'Email address', 'Profile photo (if uploaded)']}
        />
        <Text style={styles.subheading}>b. Usage Data</Text>
        <Bullets
          items={[
            'App activity (creating/joining orders)',
            'Messages between users',
            'Device information (device type, OS)',
          ]}
        />
        <Text style={styles.subheading}>c. Location Data</Text>
        <Text style={styles.paragraph}>
          We may collect approximate location to help match users nearby.
        </Text>
        <Text style={styles.paragraph}>
          We do NOT track precise real-time GPS location in the background.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>2. How We Use Your Information</Text>
        <Text style={styles.paragraph}>We use your data to:</Text>
        <Bullets
          items={[
            'Provide and operate the app',
            'Match users with nearby orders',
            'Enable messaging between users',
            'Improve app performance and experience',
            'Detect fraud or misuse',
          ]}
        />

        <Hr />

        <Text style={styles.sectionHeading}>3. Photos &amp; Media</Text>
        <Text style={styles.paragraph}>If you upload images (e.g., food photos):</Text>
        <Bullets
          items={[
            'We only access photos you choose to upload',
            'We do NOT access your full photo library',
            'Images are stored securely',
          ]}
        />

        <Hr />

        <Text style={styles.sectionHeading}>4. Messaging &amp; Content</Text>
        <Text style={styles.paragraph}>Messages between users are stored to:</Text>
        <Bullets items={['Enable communication', 'Prevent abuse or harmful behavior']} />
        <Text style={styles.paragraph}>
          We do NOT sell or share your messages with third parties.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>5. Data Sharing</Text>
        <Text style={styles.paragraph}>We do NOT sell your personal data.</Text>
        <Text style={styles.paragraph}>We may share data only in these cases:</Text>
        <Bullets
          items={[
            'With service providers (e.g., Firebase) to run the app',
            'If required by law',
            'To protect users or prevent fraud',
          ]}
        />

        <Hr />

        <Text style={styles.sectionHeading}>6. Payments</Text>
        <Text style={styles.paragraph}>HalfOrder does NOT process payments.</Text>
        <Text style={styles.paragraph}>
          HalfOrder is used for coordination only. Any arrangements are made
          independently between users.
        </Text>
        <Text style={styles.paragraph}>We do NOT store any financial information.</Text>

        <Hr />

        <Text style={styles.sectionHeading}>7. Data Security</Text>
        <Text style={styles.paragraph}>
          We use industry-standard security measures to protect your data.
        </Text>
        <Text style={styles.paragraph}>However, no system is 100% secure.</Text>

        <Hr />

        <Text style={styles.sectionHeading}>8. Your Rights</Text>
        <Text style={styles.paragraph}>You have the right to:</Text>
        <Bullets
          items={[
            'Access your data',
            'Request deletion of your account and data',
            'Update your information',
          ]}
        />
        <Text style={styles.paragraph}>
          To request this, contact us at:{' '}
          <Text onPress={openMail} style={styles.link}>
            {SUPPORT_EMAIL}
          </Text>
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>9. Data Retention</Text>
        <Text style={styles.paragraph}>
          We keep your data only as long as necessary to provide the service.
        </Text>
        <Text style={styles.paragraph}>
          We may retain some data for legal or safety purposes.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>10. Children&apos;s Privacy</Text>
        <Text style={styles.paragraph}>HalfOrder is not intended for users under 18.</Text>
        <Text style={styles.paragraph}>We do not knowingly collect data from children.</Text>

        <Hr />

        <Text style={styles.sectionHeading}>11. Changes to This Policy</Text>
        <Text style={styles.paragraph}>We may update this Privacy Policy.</Text>
        <Text style={styles.paragraph}>We will notify users of major changes.</Text>

        <Hr />

        <Text style={styles.sectionHeading}>12. Contact</Text>
        <Text style={styles.paragraph}>
          For any questions:{' '}
          <Text onPress={openMail} style={styles.link}>
            {SUPPORT_EMAIL}
          </Text>
        </Text>

        <Hr />

        <Text style={styles.footerNote}>
          By using HalfOrder, you agree to this Privacy Policy.
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
