import { AppTextInput } from '@/components/AppTextInput';
import type { HomeBannerDoc } from '@/types/homeBanner';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const BG = '#FFFFFF';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const PRIMARY = '#16a34a';

export type HomeBannerDraft = {
  id?: string;
  imageUrl: string;
  badgeText: string;
  headline: string;
  subtitle: string;
  buttonText: string;
  buttonDestination: string;
  active: boolean;
};

export function homeBannerToDraft(banner: HomeBannerDoc): HomeBannerDraft {
  return {
    id: banner.id,
    imageUrl: banner.imageUrl,
    badgeText: banner.badgeText,
    headline: banner.headline,
    subtitle: banner.subtitle,
    buttonText: banner.buttonText,
    buttonDestination: banner.buttonDestination,
    active: banner.active,
  };
}

export const EMPTY_HOME_BANNER_DRAFT: HomeBannerDraft = {
  imageUrl: '',
  badgeText: '',
  headline: '',
  subtitle: '',
  buttonText: '',
  buttonDestination: '',
  active: true,
};

type Props = {
  visible: boolean;
  draft: HomeBannerDraft;
  saving?: boolean;
  uploading?: boolean;
  onChange: (next: HomeBannerDraft) => void;
  onPickImage: () => void;
  onCancel: () => void;
  onSave: () => void;
};

export function HomeBannerEditModal({
  visible,
  draft,
  saving = false,
  uploading = false,
  onChange,
  onPickImage,
  onCancel,
  onSave,
}: Props) {
  const [local, setLocal] = useState(draft);

  useEffect(() => {
    if (visible) setLocal(draft);
  }, [visible, draft]);

  const patch = (partial: Partial<HomeBannerDraft>) => {
    const next = { ...local, ...partial };
    setLocal(next);
    onChange(next);
  };

  const busy = saving || uploading;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>
              {draft.id ? 'Edit banner' : 'New banner'}
            </Text>

            <Text style={styles.fieldLabel}>Banner image</Text>
            {local.imageUrl ? (
              <Image
                source={{ uri: local.imageUrl }}
                style={styles.preview}
                contentFit="cover"
              />
            ) : (
              <View style={styles.previewPlaceholder}>
                <Text style={styles.previewPlaceholderText}>No image yet</Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.secondaryBtn, busy && styles.btnDisabled]}
              onPress={onPickImage}
              disabled={busy}
            >
              {uploading ? (
                <ActivityIndicator color={PRIMARY} />
              ) : (
                <Text style={styles.secondaryBtnText}>
                  {local.imageUrl ? 'Replace image' : 'Upload image'}
                </Text>
              )}
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>Badge text (optional)</Text>
            <AppTextInput
              style={styles.input}
              value={local.badgeText}
              onChangeText={(badgeText) => patch({ badgeText })}
              placeholder="e.g. HalfOrder · Downtown"
              placeholderTextColor={MUTED}
              editable={!busy}
            />

            <Text style={styles.fieldLabel}>Headline</Text>
            <AppTextInput
              style={styles.input}
              value={local.headline}
              onChangeText={(headline) => patch({ headline })}
              placeholder="Main headline"
              placeholderTextColor={MUTED}
              editable={!busy}
            />

            <Text style={styles.fieldLabel}>Subtitle</Text>
            <AppTextInput
              style={styles.input}
              value={local.subtitle}
              onChangeText={(subtitle) => patch({ subtitle })}
              placeholder="Supporting line"
              placeholderTextColor={MUTED}
              editable={!busy}
            />

            <Text style={styles.fieldLabel}>Button text (optional)</Text>
            <AppTextInput
              style={styles.input}
              value={local.buttonText}
              onChangeText={(buttonText) => patch({ buttonText })}
              placeholder="e.g. Order now"
              placeholderTextColor={MUTED}
              editable={!busy}
            />

            <Text style={styles.fieldLabel}>Button destination (optional)</Text>
            <AppTextInput
              style={styles.input}
              value={local.buttonDestination}
              onChangeText={(buttonDestination) => patch({ buttonDestination })}
              placeholder="/(tabs)/search or https://…"
              placeholderTextColor={MUTED}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
            />

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Active</Text>
                <Text style={styles.toggleHint}>
                  Hidden banners stay in admin but won&apos;t show on Home
                </Text>
              </View>
              <Switch
                value={local.active}
                onValueChange={(active) => patch({ active })}
                disabled={busy}
                trackColor={{ false: '#cbd5e1', true: '#86efac' }}
                thumbColor={local.active ? PRIMARY : '#f8fafc'}
              />
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              disabled={busy}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, busy && styles.btnDisabled]}
              onPress={onSave}
              disabled={busy}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>Save</Text>
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
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: TEXT,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: MUTED,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: TEXT,
    backgroundColor: '#f8fafc',
  },
  preview: {
    width: '100%',
    height: 140,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
  },
  previewPlaceholder: {
    width: '100%',
    height: 140,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPlaceholderText: {
    color: MUTED,
    fontWeight: '600',
  },
  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: PRIMARY,
    fontWeight: '800',
    fontSize: 15,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    marginBottom: 8,
  },
  toggleLabel: { fontSize: 15, fontWeight: '800', color: TEXT },
  toggleHint: { fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 16 },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
  },
  cancelText: { fontSize: 16, fontWeight: '700', color: MUTED },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: PRIMARY,
    alignItems: 'center',
  },
  saveText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  btnDisabled: { opacity: 0.6 },
});
