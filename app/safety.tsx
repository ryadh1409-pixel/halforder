import { LEGAL_URLS } from '@/constants/legalLinks';
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

export default function SafetyScreen() {
  const router = useRouter();

  const openMail = useCallback(() => {
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
  }, []);

  const openCanonical = useCallback(() => {
    void Linking.openURL(LEGAL_URLS.safetyCommunityGuidelines);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Safety & Community Guidelines – HalfOrder</Text>
        <TouchableOpacity onPress={openCanonical} activeOpacity={0.7}>
          <Text style={styles.canonicalLink}>View on halforder.app</Text>
        </TouchableOpacity>
        <Text style={styles.meta}>
          <Text style={styles.metaStrong}>Last Updated:</Text> {LAST_UPDATED}
        </Text>
        <Text style={styles.paragraph}>
          At HalfOrder, we are committed to creating a safe, respectful, and
          trustworthy environment for all users.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>1. Respect & Behavior</Text>
        <Text style={styles.paragraph}>Users must:</Text>
        <Bullets
          items={[
            'Treat others with respect',
            'Communicate clearly and honestly',
            'Avoid offensive, abusive, or discriminatory language',
          ]}
        />
        <Text style={styles.paragraph}>
          Harassment, threats, or inappropriate behavior will result in account
          suspension.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>2. Honest Use of the Platform</Text>
        <Text style={styles.paragraph}>You agree to:</Text>
        <Bullets
          items={[
            'Create genuine food orders only',
            'Provide accurate details (restaurant, price, location)',
            'Not mislead or scam other users',
          ]}
        />
        <Text style={styles.paragraph}>
          Any fraudulent activity will lead to immediate removal.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>3. Meeting & Personal Safety</Text>
        <Text style={styles.paragraph}>
          HalfOrder connects users, but does not supervise interactions.
        </Text>
        <Text style={styles.paragraph}>For your safety:</Text>
        <Bullets
          items={[
            'Meet in public places when possible',
            'Avoid sharing sensitive personal information',
            'Use your judgment before meeting someone',
          ]}
        />
        <Text style={styles.paragraph}>You are responsible for your personal safety.</Text>

        <Hr />

        <Text style={styles.sectionHeading}>4. Food Responsibility</Text>
        <Text style={styles.paragraph}>Users are responsible for:</Text>
        <Bullets
          items={[
            'Choosing where to order from',
            'Confirming food quality and safety',
            'Managing allergies or dietary restrictions',
          ]}
        />
        <Text style={styles.paragraph}>
          HalfOrder does not verify restaurants or food quality.
        </Text>

        <Hr />

        <Text style={styles.sectionHeading}>5. Prohibited Content</Text>
        <Text style={styles.paragraph}>The following is strictly prohibited:</Text>
        <Bullets
          items={[
            'Fake orders',
            'Spam or promotional abuse',
            'Offensive images or messages',
            'Illegal activities',
          ]}
        />

        <Hr />

        <Text style={styles.sectionHeading}>6. Reporting & Enforcement</Text>
        <Text style={styles.paragraph}>
          If you encounter unsafe behavior, report to:{' '}
          <Text onPress={openMail} style={styles.link}>
            {SUPPORT_EMAIL}
          </Text>
        </Text>
        <Text style={styles.paragraph}>We may:</Text>
        <Bullets
          items={[
            'Review content',
            'Suspend or remove accounts',
            'Take necessary action without notice',
          ]}
        />

        <Hr />

        <Text style={styles.sectionHeading}>7. Our Role</Text>
        <Text style={styles.paragraph}>HalfOrder is a coordination platform only.</Text>
        <Text style={styles.paragraph}>We do not:</Text>
        <Bullets
          items={[
            'Facilitate payments',
            'Guarantee transactions',
            'Verify users or food providers',
          ]}
        />

        <Hr />

        <Text style={styles.footerNote}>
          By using HalfOrder, you agree to follow these guidelines and help
          maintain a safe community.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backText: {
    fontSize: 16,
    color: theme.colors.accentBlue,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 6,
  },
  canonicalLink: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.accentBlue,
    textDecorationLine: 'underline',
    marginBottom: 12,
  },
  meta: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginBottom: 16,
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
  },
});
