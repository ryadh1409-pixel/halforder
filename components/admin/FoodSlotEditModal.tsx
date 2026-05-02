import React from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const BG = '#f8fafc';
const CARD = '#ffffff';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const PRIMARY = '#16a34a';

export type FoodSlotDraft = {
  title: string;
  image: string;
  price: string;
  sharingPrice: string;
  venueLocation: string;
  active: boolean;
  aiDescription: string;
  restaurantName: string;
};

export type FoodSlotEditModalProps = {
  visible: boolean;
  slotLabel: string;
  draft: FoodSlotDraft;
  onChange: (patch: Partial<FoodSlotDraft>) => void;
  onClose: () => void;
  onSave: () => void;
  onReset: () => void;
  onPickImage: () => void;
  onGenerateAi: () => void;
  saving: boolean;
  uploading: boolean;
  aiBusy: boolean;
};

export function FoodSlotEditModal({
  visible,
  slotLabel,
  draft,
  onChange,
  onClose,
  onSave,
  onReset,
  onPickImage,
  onGenerateAi,
  saving,
  uploading,
  aiBusy,
}: FoodSlotEditModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{slotLabel}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetBody}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Active</Text>
              <Switch
                value={draft.active}
                onValueChange={(v) => onChange({ active: v })}
                trackColor={{
                  false: 'rgba(148, 163, 184, 0.45)',
                  true: 'rgba(22, 163, 74, 0.45)',
                }}
                thumbColor={draft.active ? PRIMARY : '#f1f5f9'}
              />
            </View>

            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={onPickImage}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color={CARD} />
              ) : (
                <Text style={styles.uploadBtnText}>
                  {draft.image ? 'Change image' : 'Upload image'}
                </Text>
              )}
            </TouchableOpacity>
            {draft.image ? (
              <Image source={{ uri: draft.image }} style={styles.preview} />
            ) : null}

            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="Title"
              placeholderTextColor={MUTED}
              value={draft.title}
              onChangeText={(t) => onChange({ title: t })}
            />
            <Text style={styles.fieldLabel}>Restaurant / venue label</Text>
            <TextInput
              style={styles.input}
              placeholder="Restaurant name"
              placeholderTextColor={MUTED}
              value={draft.restaurantName}
              onChangeText={(t) => onChange({ restaurantName: t })}
            />
            <Text style={styles.fieldLabel}>Total price (USD)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={MUTED}
              value={draft.price}
              onChangeText={(t) => onChange({ price: t })}
              keyboardType="decimal-pad"
            />
            <Text style={styles.fieldLabel}>Price per person (sharing)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={MUTED}
              value={draft.sharingPrice}
              onChangeText={(t) => onChange({ sharingPrice: t })}
              keyboardType="decimal-pad"
            />
            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput
              style={styles.input}
              placeholder="Venue location"
              placeholderTextColor={MUTED}
              value={draft.venueLocation}
              onChangeText={(t) => onChange({ venueLocation: t })}
            />
            <Text style={styles.fieldLabel}>AI description (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              placeholder="Description"
              placeholderTextColor={MUTED}
              value={draft.aiDescription}
              onChangeText={(t) => onChange({ aiDescription: t })}
              multiline
            />
            <TouchableOpacity
              style={[styles.secondaryBtn, aiBusy && styles.btnDisabled]}
              disabled={aiBusy}
              onPress={onGenerateAi}
            >
              <Text style={styles.secondaryBtnText}>
                {aiBusy ? 'Generating…' : 'Generate AI description'}
              </Text>
            </TouchableOpacity>

            <View style={styles.actions}>
              <TouchableOpacity style={styles.ghostBtn} onPress={onReset}>
                <Text style={styles.ghostBtnText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.btnDisabled]}
                disabled={saving}
                onPress={onSave}
              >
                {saving ? (
                  <ActivityIndicator color={CARD} />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheet: {
    flex: 1,
    backgroundColor: BG,
    paddingTop: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.08)',
  },
  sheetTitle: { color: TEXT, fontSize: 20, fontWeight: '700' },
  close: { color: PRIMARY, fontWeight: '600', fontSize: 16 },
  sheetBody: { padding: 16, paddingBottom: 40 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: MUTED,
    marginBottom: 6,
  },
  uploadBtn: {
    backgroundColor: PRIMARY,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  uploadBtnText: { color: CARD, fontWeight: '700' },
  preview: {
    width: '100%',
    height: 160,
    borderRadius: 16,
    marginBottom: 14,
    backgroundColor: '#e2e8f0',
  },
  input: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.1)',
    color: TEXT,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    fontSize: 16,
  },
  inputMulti: { minHeight: 88, textAlignVertical: 'top' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  switchLabel: { color: TEXT, fontWeight: '600' },
  secondaryBtn: {
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    alignItems: 'center',
    marginBottom: 16,
  },
  secondaryBtnText: { color: '#4f46e5', fontWeight: '700' },
  btnDisabled: { opacity: 0.55 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  ghostBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.12)',
    alignItems: 'center',
  },
  ghostBtnText: { color: MUTED, fontWeight: '700' },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: CARD, fontWeight: '700' },
});
