import {
  UGC_REPORT_REASONS,
  type ReportReason,
  submitReport,
} from '@/services/reports';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export type ReportUserModalProps = {
  visible: boolean;
  onClose: () => void;
  reporterId: string;
  reportedUserId: string;
  /** Message id, order id, or other stable reference (see `services/reports`). */
  contentId: string;
  onSubmitted?: () => void;
};

export default function ReportUserModal({
  visible,
  onClose,
  reporterId,
  reportedUserId,
  contentId,
  onSubmitted,
}: ReportUserModalProps) {
  const [reason, setReason] = useState<ReportReason>('spam');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setReason('spam');
    setError(null);
    setBusy(false);
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const submit = async () => {
    if (!reporterId || !reportedUserId || reporterId === reportedUserId) {
      setError('Invalid report.');
      return;
    }
    if (!contentId.trim()) {
      setError('Missing content reference.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitReport({
        reporterId,
        reportedUserId,
        contentId: contentId.trim(),
        reason,
      });
      reset();
      onSubmitted?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit report.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Report</Text>
          <Text style={styles.sub}>Our team reviews every report.</Text>

          {UGC_REPORT_REASONS.map(({ id, label }) => {
            const active = id === reason;
            return (
              <TouchableOpacity
                key={id}
                style={[styles.chip, active && styles.chipOn]}
                onPress={() => setReason(id)}
                disabled={busy}
              >
                <Text style={[styles.chipTxt, active && styles.chipTxtOn]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}

          {error ? <Text style={styles.err}>{error}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={handleClose}
              disabled={busy}
            >
              <Text style={styles.secondaryTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, busy && styles.primaryBtnOff]}
              onPress={() => void submit()}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryTxt}>Submit</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    gap: 10,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  sub: { fontSize: 14, color: '#3C3C43', lineHeight: 20, marginBottom: 4 },
  chip: {
    borderWidth: 1,
    borderColor: '#C6C6C8',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  chipOn: { borderColor: '#007AFF', backgroundColor: 'rgba(0,122,255,0.08)' },
  chipTxt: { color: '#000', fontWeight: '500', fontSize: 16 },
  chipTxtOn: { color: '#007AFF', fontWeight: '600' },
  err: { color: '#FF3B30', fontSize: 14, marginTop: 4 },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    justifyContent: 'flex-end',
  },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  secondaryTxt: { color: '#007AFF', fontWeight: '600', fontSize: 17 },
  primaryBtn: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    minWidth: 88,
    alignItems: 'center',
  },
  primaryBtnOff: { opacity: 0.6 },
  primaryTxt: { color: '#fff', fontWeight: '600', fontSize: 17 },
});
