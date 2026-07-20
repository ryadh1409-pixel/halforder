import { AppTextInput } from '@/components/AppTextInput';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import {
  DEFAULT_ONBOARDING_CONFIG,
  saveOnboardingConfig,
  subscribeOnboardingConfig,
  type OnboardingConfig,
  type OnboardingDisplayMode,
  type OnboardingSlideAdmin,
} from '@/services/onboardingAdmin';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';
import { showError, showSuccess } from '@/utils/toast';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const MODES: { id: OnboardingDisplayMode; label: string }[] = [
  { id: 'once', label: 'Show only once' },
  { id: 'every_launch', label: 'Show every app launch' },
  { id: 'every_login', label: 'Show every login' },
  { id: 'disabled', label: 'Disable onboarding' },
];

export default function OnboardingManagerScreen() {
  const [cfg, setCfg] = useState<OnboardingConfig>(DEFAULT_ONBOARDING_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    return subscribeOnboardingConfig((next) => {
      setCfg(next);
      setLoading(false);
    });
  }, []);

  const updateSlide = (id: string, patch: Partial<OnboardingSlideAdmin>) => {
    setCfg((prev) => ({
      ...prev,
      slides: prev.slides.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  };

  const moveSlide = (id: string, dir: -1 | 1) => {
    setCfg((prev) => {
      const slides = [...prev.slides].sort((a, b) => a.order - b.order);
      const idx = slides.findIndex((s) => s.id === id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= slides.length) return prev;
      const tmp = slides[idx]!;
      slides[idx] = slides[swap]!;
      slides[swap] = tmp;
      return {
        ...prev,
        slides: slides.map((s, i) => ({ ...s, order: i })),
      };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveOnboardingConfig({
        displayMode: cfg.displayMode,
        slides: cfg.slides,
      });
      showSuccess('Onboarding settings saved.');
    } catch (e) {
      showError(getReadableErrorMessageOr(e, 'Save failed.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Onboarding Manager"
        subtitle="Slides, copy, and display mode"
        fallbackRoute={adminRoutes.home}
      />
      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>Display Mode</Text>
          <View style={styles.chipRow}>
            {MODES.map((m) => (
              <Pressable
                key={m.id}
                style={[styles.chip, cfg.displayMode === m.id && styles.chipOn]}
                onPress={() => setCfg((p) => ({ ...p, displayMode: m.id }))}
              >
                <Text
                  style={[
                    styles.chipText,
                    cfg.displayMode === m.id && styles.chipTextOn,
                  ]}
                >
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.heading}>Slides</Text>
          {cfg.slides
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((slide) => (
              <View key={slide.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Card {slide.order + 1}</Text>
                  <View style={styles.chipRow}>
                    <Pressable
                      style={styles.miniChip}
                      onPress={() => moveSlide(slide.id, -1)}
                    >
                      <Text style={styles.chipText}>↑</Text>
                    </Pressable>
                    <Pressable
                      style={styles.miniChip}
                      onPress={() => moveSlide(slide.id, 1)}
                    >
                      <Text style={styles.chipText}>↓</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.miniChip, slide.enabled && styles.chipOn]}
                      onPress={() =>
                        updateSlide(slide.id, { enabled: !slide.enabled })
                      }
                    >
                      <Text style={styles.chipText}>
                        {slide.enabled ? 'Enabled' : 'Disabled'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.miniChip}
                      onPress={() =>
                        setPreviewId((id) =>
                          id === slide.id ? null : slide.id,
                        )
                      }
                    >
                      <Text style={styles.chipText}>Preview</Text>
                    </Pressable>
                  </View>
                </View>
                <AppTextInput
                  value={slide.title}
                  onChangeText={(t) => updateSlide(slide.id, { title: t })}
                  placeholder="Title"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                  multiline
                />
                <AppTextInput
                  value={slide.subtitle}
                  onChangeText={(t) => updateSlide(slide.id, { subtitle: t })}
                  placeholder="Subtitle"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                  multiline
                />
                <AppTextInput
                  value={slide.imageUri}
                  onChangeText={(t) => updateSlide(slide.id, { imageUri: t })}
                  placeholder="Image URL (optional)"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                  autoCapitalize="none"
                />
                {previewId === slide.id ? (
                  <View style={styles.preview}>
                    <Text style={styles.previewTitle}>{slide.title}</Text>
                    <Text style={styles.previewSub}>{slide.subtitle}</Text>
                    {slide.imageUri ? (
                      <Text style={styles.meta}>Image: {slide.imageUri}</Text>
                    ) : (
                      <Text style={styles.meta}>No image — emoji/default UI</Text>
                    )}
                  </View>
                ) : null}
              </View>
            ))}

          <Pressable
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={() => void save()}
            disabled={saving}
          >
            <Text style={styles.saveText}>
              {saving ? 'Saving…' : 'Save Onboarding'}
            </Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  heading: {
    color: COLORS.textMuted,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  chipOn: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(168,85,247,0.16)',
  },
  chipText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 12 },
  chipTextOn: { color: COLORS.text },
  miniChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  card: { ...adminCardShell, marginBottom: 12 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  cardTitle: { color: COLORS.text, fontWeight: '800', fontSize: 15 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    marginBottom: 8,
  },
  preview: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  previewTitle: {
    color: COLORS.text,
    fontWeight: '800',
    fontSize: 20,
    marginBottom: 8,
  },
  previewSub: { color: COLORS.textMuted, fontWeight: '600', lineHeight: 20 },
  meta: { color: COLORS.textMuted, marginTop: 8, fontSize: 12 },
  saveBtn: {
    marginTop: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
