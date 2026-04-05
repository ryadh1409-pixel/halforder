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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export type ReportUserModalProps = {
  visible: boolean;
  onClose: () => void;
  reporterId: string;
  reportedUserId: string;
  orderId?: string | null;
  chatId?: string | null;
  onSubmitted?: () => void;
};

export default function ReportUserModal({
  visible,
  onClose,
  reporterId,
  reportedUserId,
  orderId,
  chatId,
  onSubmitted,
}: ReportUserModalProps) {
  const [reason, setReason] = useState<ReportReason>('spam');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setReason('spam');
    setDetail('');
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
    setBusy(true);
    setError(null);
    try {
      await submitReport({
        reporterId,
        reportedUserId,
        reason,
        message: detail.trim(),
        orderId: orderId ?? null,
        chatId: chatId ?? null,
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
          <Text style={styles.title}>Report user</Text>
          <Text style={styles.sub}>
            Reports are reviewed. False reports may affect your account.
          </Text>

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

          <TextInput
            style={styles.input}
            placeholder="Optional details"
            placeholderTextColor="#6B7280"
            value={detail}
            onChangeText={setDetail}
            multiline
            editable={!busy}
          />

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
                <ActivityIndicator color="#052E1A" />
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
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#141A22',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 28,
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  sub: { fontSize: 13, color: '#94A3B8', lineHeight: 18, marginBottom: 4 },
  chip: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  chipOn: { borderColor: '#34D399', backgroundColor: 'rgba(52,211,153,0.12)' },
  chipTxt: { color: '#CBD5E1', fontWeight: '600', fontSize: 14 },
  chipTxtOn: { color: '#F8FAFC' },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 12,
    color: '#F8FAFC',
    textAlignVertical: 'top',
    marginTop: 4,
  },
  err: { color: '#FCA5A5', fontSize: 13, marginTop: 4 },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    justifyContent: 'flex-end',
  },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  secondaryTxt: { color: '#94A3B8', fontWeight: '700' },
  primaryBtn: {
    backgroundColor: '#34D399',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  primaryBtnOff: { opacity: 0.6 },
  primaryTxt: { color: '#052E1A', fontWeight: '800' },
});
