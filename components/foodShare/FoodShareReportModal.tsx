import {
  FOOD_SHARE_REPORT_REASONS,
  type FoodShareReportReason,
} from '@/services/reports';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';

export type FoodShareReportModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: {
    reason: FoodShareReportReason;
    description: string;
  }) => Promise<void>;
  reportedFirstName?: string;
};

export function FoodShareReportModal({
  visible,
  onClose,
  onSubmit,
  reportedFirstName = 'this user',
}: FoodShareReportModalProps) {
  const [reason, setReason] = useState<FoodShareReportReason>('harassment');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setReason('harassment');
    setDescription('');
    setError(null);
    setBusy(false);
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ reason, description: description.trim() });
      reset();
      onClose();
    } catch (e) {
      setError(getReadableErrorMessageOr(e, 'Could not submit report.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Report {reportedFirstName}</Text>
          <Text style={styles.sub}>Select a reason and add details. Our team reviews every report.</Text>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {FOOD_SHARE_REPORT_REASONS.map(({ id, label }) => {
              const active = id === reason;
              return (
                <TouchableOpacity
                  key={id}
                  style={[styles.chip, active && styles.chipOn]}
                  onPress={() => setReason(id)}
                  disabled={busy}
                >
                  <Text style={[styles.chipTxt, active && styles.chipTxtOn]}>{label}</Text>
                </TouchableOpacity>
              );
            })}

            <Text style={styles.fieldLabel}>Description (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="What happened?"
              placeholderTextColor="#8E8E93"
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={1000}
              editable={!busy}
            />
          </ScrollView>

          {error ? <Text style={styles.err}>{error}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleClose} disabled={busy}>
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
                <Text style={styles.primaryTxt}>Submit report</Text>
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
    backgroundColor: '#12151C',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '88%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  title: { fontSize: 20, fontWeight: '800', color: '#FFF' },
  sub: { fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 20, marginTop: 6, marginBottom: 12 },
  scroll: { maxHeight: 360 },
  chip: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  chipOn: { borderColor: '#7DFFB8', backgroundColor: 'rgba(125,255,184,0.1)' },
  chipTxt: { color: '#FFF', fontWeight: '600', fontSize: 15 },
  chipTxtOn: { color: '#7DFFB8' },
  fieldLabel: {
    marginTop: 8,
    marginBottom: 6,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 88,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 12,
    color: '#FFF',
    fontSize: 15,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  err: { color: '#FB7185', fontSize: 14, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16, justifyContent: 'flex-end' },
  secondaryBtn: { paddingVertical: 12, paddingHorizontal: 8 },
  secondaryTxt: { color: 'rgba(255,255,255,0.75)', fontWeight: '700', fontSize: 16 },
  primaryBtn: {
    backgroundColor: '#7DFFB8',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    minWidth: 120,
    alignItems: 'center',
  },
  primaryBtnOff: { opacity: 0.6 },
  primaryTxt: { color: '#0A0A0A', fontWeight: '800', fontSize: 16 },
});
