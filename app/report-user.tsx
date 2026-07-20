import { AppTextInput } from '@/components/AppTextInput';
import { goBackFromProfileScreen } from '@/lib/profileBack';
import { useAuth } from '@/services/AuthContext';
import {
  reportContentIdUser,
  submitReport,
  type ReportReason,
} from '@/services/reports';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { showError, showSuccess } from '@/utils/toast';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BG = '#000000';
const CARD = '#171923';
const TEXT = '#FFFFFF';
const MUTED = '#B7BDC9';
const PRIMARY = '#A855F7';
const BORDER = 'rgba(255,255,255,0.12)';

/**
 * Dedicated Report User screen — UI moved from Profile (logic unchanged).
 */
export default function ReportUserScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [reportUserId, setReportUserId] = useState('');
  const [reportReason, setReportReason] = useState<ReportReason>('spam');
  const [submittingReport, setSubmittingReport] = useState(false);

  const handleSubmit = async () => {
    if (!uid) return;
    const target = reportUserId.trim();
    if (!target) {
      showError('Enter the user ID you want to report.');
      return;
    }
    if (target === uid) {
      showError('You cannot report yourself.');
      return;
    }
    setSubmittingReport(true);
    try {
      await submitReport({
        reporterId: uid,
        reportedUserId: target,
        contentId: reportContentIdUser(target),
        reason: reportReason,
      });
      showSuccess('Thanks. We will review this report.');
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSubmittingReport(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => goBackFromProfileScreen(router)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backLink}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Report User</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.bodyMuted}>
            Submit a report by user ID, or use Report in any order or direct
            message chat.
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, styles.rowCenter]}
            onPress={() => router.push('/help')}
            accessibilityRole="button"
            accessibilityLabel="Open help to report from an order"
          >
            <MaterialIcons name="flag" size={20} color={TEXT} />
            <Text style={styles.primaryButtonText}>
              Report from Help &amp; past orders
            </Text>
          </TouchableOpacity>

          <AppTextInput
            value={reportUserId}
            onChangeText={setReportUserId}
            placeholder="Reported user ID"
            placeholderTextColor={MUTED}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.reasonRow}>
            {(['spam', 'abuse', 'inappropriate'] as ReportReason[]).map(
              (reason) => {
                const active = reason === reportReason;
                return (
                  <TouchableOpacity
                    key={reason}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setReportReason(reason)}
                  >
                    <Text
                      style={[styles.chipText, active && styles.chipTextActive]}
                    >
                      {reason}
                    </Text>
                  </TouchableOpacity>
                );
              },
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.primaryButton,
              submittingReport && styles.buttonDisabled,
            ]}
            onPress={() => void handleSubmit()}
            disabled={submittingReport || !uid}
          >
            {submittingReport ? (
              <ActivityIndicator size="small" color={TEXT} />
            ) : (
              <Text style={styles.primaryButtonText}>Submit report</Text>
            )}
          </TouchableOpacity>

          {!uid ? (
            <Text style={[styles.bodyMuted, { marginTop: 12 }]}>
              Sign in to submit a report.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backLink: { color: PRIMARY, fontSize: 16, fontWeight: '600' },
  screenTitle: { fontSize: 20, fontWeight: '800', color: TEXT, flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  bodyMuted: {
    color: MUTED,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: PRIMARY,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  rowCenter: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: TEXT,
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: { opacity: 0.6 },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: TEXT,
    backgroundColor: BG,
    marginBottom: 12,
  },
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: BG,
  },
  chipActive: {
    borderColor: PRIMARY,
    backgroundColor: 'rgba(168, 85, 247, 0.18)',
  },
  chipText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  chipTextActive: {
    color: TEXT,
  },
});
