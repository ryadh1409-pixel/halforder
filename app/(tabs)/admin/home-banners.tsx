import { AdminHeader } from '@/components/admin/AdminHeader';
import {
  EMPTY_HOME_BANNER_DRAFT,
  HomeBannerEditModal,
  homeBannerToDraft,
  type HomeBannerDraft,
} from '@/components/admin/HomeBannerEditModal';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { useAuth } from '@/services/AuthContext';
import {
  deleteHomeBanner,
  reorderHomeBanner,
  saveHomeBanner,
  saveHomeBannerVisibility,
  setHomeBannerActive,
  subscribeHomeBannerSettings,
  subscribeHomeBanners,
} from '@/services/homeBanners';
import { pickAndUploadImage } from '@/services/uploadImage';
import type { HomeBannerDoc } from '@/types/homeBanner';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { requireRole } from '@/utils/requireRole';
import { showError, showSuccess } from '@/utils/toast';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AdminHomeBannersScreen() {
  const { authorized, loading: roleLoading } = requireRole(['admin']);
  const { user } = useAuth();
  const [rows, setRows] = useState<HomeBannerDoc[]>([]);
  const [visible, setVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<HomeBannerDraft>(EMPTY_HOME_BANNER_DRAFT);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!authorized) return undefined;
    const unsubRows = subscribeHomeBanners(
      (list) => {
        setRows(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
    const unsubSettings = subscribeHomeBannerSettings((settings) => {
      setVisible(settings.visible);
    });
    return () => {
      unsubRows();
      unsubSettings();
    };
  }, [authorized]);

  const activeCount = useMemo(
    () => rows.filter((r) => r.active).length,
    [rows],
  );

  const onToggleVisibility = async (next: boolean) => {
    setSettingsBusy(true);
    setVisible(next);
    try {
      await saveHomeBannerVisibility(next);
      showSuccess(next ? 'Home banners visible.' : 'Home banners hidden.');
    } catch (e) {
      setVisible(!next);
      showError(getUserFriendlyError(e));
    } finally {
      setSettingsBusy(false);
    }
  };

  const openCreate = () => {
    setDraft(EMPTY_HOME_BANNER_DRAFT);
    setModalOpen(true);
  };

  const openEdit = (banner: HomeBannerDoc) => {
    setDraft(homeBannerToDraft(banner));
    setModalOpen(true);
  };

  const onPickImage = async () => {
    const uid = user?.uid;
    if (!uid) {
      showError('Sign in required');
      return;
    }
    setUploading(true);
    try {
      const { url, error } = await pickAndUploadImage({
        uid,
        folder: 'homeBanners',
      });
      if (error) {
        showError(error);
        return;
      }
      if (url) {
        setDraft((prev) => {
          const next = { ...prev, imageUrl: url };
          return next;
        });
      }
    } finally {
      setUploading(false);
    }
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await saveHomeBanner({
        id: draft.id,
        imageUrl: draft.imageUrl,
        badgeText: draft.badgeText,
        headline: draft.headline,
        subtitle: draft.subtitle,
        buttonText: draft.buttonText,
        buttonDestination: draft.buttonDestination,
        active: draft.active,
      });
      showSuccess('Banner saved.');
      setModalOpen(false);
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const onToggleActive = async (banner: HomeBannerDoc) => {
    setBusyId(banner.id);
    try {
      await setHomeBannerActive(banner.id, !banner.active);
      showSuccess(banner.active ? 'Banner hidden.' : 'Banner activated.');
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = (banner: HomeBannerDoc) => {
    Alert.alert(
      'Delete banner',
      `Remove "${banner.headline}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setBusyId(banner.id);
            void deleteHomeBanner(banner.id)
              .then(() => showSuccess('Banner deleted.'))
              .catch((e) => showError(getUserFriendlyError(e)))
              .finally(() => setBusyId(null));
          },
        },
      ],
    );
  };

  const onReorder = async (banner: HomeBannerDoc, direction: 'up' | 'down') => {
    setBusyId(banner.id);
    try {
      await reorderHomeBanner(banner.id, direction, rows);
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setBusyId(null);
    }
  };

  if (roleLoading || !authorized) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Home Banners"
        subtitle="Promotional carousel on the marketplace Home screen"
        fallbackRoute={adminRoutes.home}
      />

      <View style={styles.settingsCard}>
        <View style={styles.settingsCopy}>
          <Text style={styles.settingsTitle}>Home Banner Visibility</Text>
          <Text style={styles.settingsSub}>
            {visible
              ? `${activeCount} active banner${activeCount === 1 ? '' : 's'} can appear on Home`
              : 'Banner section is hidden from Home'}
          </Text>
        </View>
        <Switch
          value={visible}
          onValueChange={onToggleVisibility}
          disabled={settingsBusy}
          trackColor={{ false: '#cbd5e1', true: '#86efac' }}
          thumbColor={visible ? COLORS.primary : '#f8fafc'}
        />
      </View>

      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.createBtn} onPress={openCreate}>
          <Text style={styles.createBtnText}>+ New banner</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No banners yet. Create one to show on the Home screen.
            </Text>
          }
          renderItem={({ item, index }) => (
            <View style={styles.card}>
              {item.imageUrl ? (
                <Image
                  source={{ uri: item.imageUrl }}
                  style={styles.thumb}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Text style={styles.thumbEmptyText}>No image</Text>
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={styles.headline} numberOfLines={2}>
                  {item.headline || 'Untitled banner'}
                </Text>
                {item.badgeText ? (
                  <Text style={styles.badge} numberOfLines={1}>
                    {item.badgeText}
                  </Text>
                ) : null}
                {item.subtitle ? (
                  <Text style={styles.subtitle} numberOfLines={2}>
                    {item.subtitle}
                  </Text>
                ) : null}
                <Text style={styles.meta}>
                  Order {item.sortOrder + 1} · {item.active ? 'Active' : 'Hidden'}
                </Text>
                <View style={styles.rowActions}>
                  <TouchableOpacity
                    style={[styles.smallBtn, index === 0 && styles.smallBtnDisabled]}
                    disabled={index === 0 || busyId === item.id}
                    onPress={() => void onReorder(item, 'up')}
                  >
                    <Text style={styles.smallBtnText}>↑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.smallBtn,
                      index === rows.length - 1 && styles.smallBtnDisabled,
                    ]}
                    disabled={index === rows.length - 1 || busyId === item.id}
                    onPress={() => void onReorder(item, 'down')}
                  >
                    <Text style={styles.smallBtnText}>↓</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.smallBtn}
                    onPress={() => openEdit(item)}
                    disabled={busyId === item.id}
                  >
                    <Text style={styles.smallBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.smallBtn}
                    onPress={() => void onToggleActive(item)}
                    disabled={busyId === item.id}
                  >
                    <Text style={styles.smallBtnText}>
                      {item.active ? 'Hide' : 'Show'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallBtn, styles.deleteBtn]}
                    onPress={() => onDelete(item)}
                    disabled={busyId === item.id}
                  >
                    <Text style={[styles.smallBtnText, styles.deleteBtnText]}>
                      Delete
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        />
      )}

      <HomeBannerEditModal
        visible={modalOpen}
        draft={draft}
        saving={saving}
        uploading={uploading}
        onChange={setDraft}
        onPickImage={() => void onPickImage()}
        onCancel={() => {
          if (!saving && !uploading) setModalOpen(false);
        }}
        onSave={() => void onSave()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsCard: {
    ...adminCardShell,
    marginHorizontal: 16,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsCopy: { flex: 1 },
  settingsTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  settingsSub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  toolbar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  createBtn: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  list: { padding: 16, paddingBottom: 32, gap: 12 },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    color: COLORS.textMuted,
    fontWeight: '600',
    lineHeight: 20,
  },
  card: {
    ...adminCardShell,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: 120,
    backgroundColor: '#e2e8f0',
  },
  thumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbEmptyText: { color: COLORS.textMuted, fontWeight: '600' },
  cardBody: { padding: 14 },
  headline: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  badge: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  meta: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  smallBtnDisabled: { opacity: 0.4 },
  smallBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  deleteBtn: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  deleteBtnText: { color: '#dc2626' },
});
