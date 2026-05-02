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
const INPUT_BG = '#ffffff';

export type FoodEditModalProps = {
  visible: boolean;
  mode: 'create' | 'edit';
  onClose: () => void;
  name: string;
  onChangeName: (t: string) => void;
  description: string;
  onChangeDescription: (t: string) => void;
  priceStr: string;
  onChangePriceStr: (t: string) => void;
  imageUrl: string;
  onPickImage: () => void;
  uploading: boolean;
  active: boolean;
  onChangeActive: (v: boolean) => void;
  saving: boolean;
  onSave: () => void;
  onDeletePress?: () => void;
};

export function FoodEditModal({
  visible,
  mode,
  onClose,
  name,
  onChangeName,
  description,
  onChangeDescription,
  priceStr,
  onChangePriceStr,
  imageUrl,
  onPickImage,
  uploading,
  active,
  onChangeActive,
  saving,
  onSave,
  onDeletePress,
}: FoodEditModalProps) {
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
            <Text style={styles.sheetTitle}>
              {mode === 'edit' ? 'Edit item' : 'Add item'}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetBody}
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={onPickImage}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color={CARD} />
              ) : (
                <Text style={styles.uploadBtnText}>
                  {imageUrl ? 'Change image' : 'Upload image'}
                </Text>
              )}
            </TouchableOpacity>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.preview} />
            ) : null}
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor={MUTED}
              value={name}
              onChangeText={onChangeName}
            />
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              placeholder="Description"
              placeholderTextColor={MUTED}
              value={description}
              onChangeText={onChangeDescription}
              multiline
            />
            <Text style={styles.fieldLabel}>Price (USD)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={MUTED}
              value={priceStr}
              onChangeText={onChangePriceStr}
              keyboardType="decimal-pad"
            />
            <View style={styles.switchRow}>
              <View style={styles.switchTextCol}>
                <Text style={styles.switchLabel}>Visible on Home</Text>
                <Text style={styles.switchHint}>
                  When off, this item is hidden from the menu strip.
                </Text>
              </View>
              <Switch
                value={active}
                onValueChange={onChangeActive}
                trackColor={{
                  false: 'rgba(148, 163, 184, 0.45)',
                  true: 'rgba(22, 163, 74, 0.45)',
                }}
                thumbColor={active ? PRIMARY : '#f1f5f9'}
              />
            </View>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={onSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={CARD} />
              ) : (
                <Text style={styles.saveText}>Save</Text>
              )}
            </TouchableOpacity>
            {mode === 'edit' && onDeletePress ? (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={onDeletePress}
              >
                <Text style={styles.deleteText}>Delete item</Text>
              </TouchableOpacity>
            ) : null}
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
    backgroundColor: INPUT_BG,
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
    marginBottom: 20,
    marginTop: 4,
  },
  switchTextCol: { flex: 1, paddingRight: 12 },
  switchLabel: { color: TEXT, fontWeight: '600' },
  switchHint: {
    color: MUTED,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  saveBtn: {
    backgroundColor: PRIMARY,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  saveText: { color: CARD, fontWeight: '700', fontSize: 16 },
  deleteBtn: {
    marginTop: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteText: { color: '#dc2626', fontWeight: '600', fontSize: 15 },
});
