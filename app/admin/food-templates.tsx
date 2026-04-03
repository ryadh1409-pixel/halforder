/**
 * Admin: manage `foodTemplates` catalog (max 10) for the home screen.
 */
import { adminRoutes } from '@/constants/adminRoutes';
import { isAdminUser } from '@/constants/adminUid';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { useAuth } from '@/services/AuthContext';
import {
  addFoodTemplate,
  deleteFoodTemplate,
  FOOD_TEMPLATES_MAX,
  subscribeFoodTemplates,
  updateFoodTemplate,
  type FoodTemplate,
  type FoodTemplateInput,
} from '@/services/foodTemplates';
import { pickAndUploadImage } from '@/services/uploadImage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function parsePrice(raw: string): number | null {
  const n = Number(String(raw).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export default function AdminFoodTemplatesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [list, setList] = useState<FoodTemplate[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isAdmin = isAdminUser(user);

  useEffect(() => {
    if (user && !isAdmin) {
      router.replace('/(tabs)');
    }
  }, [isAdmin, router, user]);

  useEffect(() => {
    if (!user || !isAdmin) {
      setListLoading(false);
      return;
    }
    setListLoading(true);
    const unsub = subscribeFoodTemplates(
      (rows) => {
        setList(rows);
        setListError(null);
        setListLoading(false);
      },
      (e) => {
        setListError(e.message);
        setListLoading(false);
      },
    );
    return () => unsub();
  }, [isAdmin, user]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setPriceStr('');
    setImageUrl('');
    setEditingId(null);
  };

  const onPickImage = async () => {
    const uid = user?.uid;
    if (!uid) {
      Alert.alert('Sign in', 'Admin session required.');
      return;
    }
    setUploading(true);
    try {
      const { url, error } = await pickAndUploadImage({
        uid,
        folder: 'foodTemplates',
        quality: 0.85,
      });
      if (error) {
        Alert.alert('Upload', error);
        return;
      }
      if (url) setImageUrl(url);
    } finally {
      setUploading(false);
    }
  };

  const onSave = async () => {
    if (!isAdmin || !user) {
      Alert.alert('Access denied', 'Only admin can edit templates.');
      return;
    }
    const price = parsePrice(priceStr);
    if (!name.trim()) {
      Alert.alert('Missing name', 'Enter a food name.');
      return;
    }
    if (price === null || price <= 0) {
      Alert.alert('Invalid price', 'Enter a valid price.');
      return;
    }
    if (!imageUrl.trim()) {
      Alert.alert('Image required', 'Upload an image for this card.');
      return;
    }

    const input: FoodTemplateInput = {
      name: name.trim(),
      description: description.trim(),
      price,
      imageUrl: imageUrl.trim(),
    };

    setSaving(true);
    try {
      if (editingId) {
        await updateFoodTemplate(editingId, input);
        Alert.alert('Saved', 'Template updated.');
      } else {
        if (list.length >= FOOD_TEMPLATES_MAX) {
          Alert.alert(
            'Limit reached',
            `You can have at most ${FOOD_TEMPLATES_MAX} templates. Delete one to add another.`,
          );
          return;
        }
        await addFoodTemplate(input);
        Alert.alert('Saved', 'New template added.');
      }
      resetForm();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (row: FoodTemplate) => {
    setEditingId(row.id);
    setName(row.name);
    setDescription(row.description);
    setPriceStr(String(row.price));
    setImageUrl(row.imageUrl);
  };

  const onDelete = (row: FoodTemplate) => {
    Alert.alert(
      'Delete template',
      `Remove “${row.name}”?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(row.id);
            try {
              await deleteFoodTemplate(row.id);
            } catch (e) {
              Alert.alert(
                'Error',
                e instanceof Error ? e.message : 'Could not delete.',
              );
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.muted}>Sign in to continue.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.denied}>Access denied</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topRow}>
          <TouchableOpacity
            onPress={() => router.push(adminRoutes.home)}
            hitSlop={12}
          >
            <Text style={styles.backLink}>← Admin</Text>
          </TouchableOpacity>
          <Text style={styles.badge}>
            {list.length}/{FOOD_TEMPLATES_MAX}
          </Text>
        </View>
        <Text style={styles.screenTitle}>Food catalog</Text>
        <Text style={styles.screenSub}>
          Templates appear on the home screen. Maximum {FOOD_TEMPLATES_MAX}{' '}
          items.
        </Text>

        {listError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{listError}</Text>
          </View>
        ) : null}

        <View style={[adminCardShell, styles.formCard]}>
          <Text style={styles.sectionLabel}>
            {editingId ? 'Edit template' : 'Add template'}
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={onPickImage}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#07241A" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {imageUrl ? 'Change image' : 'Upload image'}
              </Text>
            )}
          </TouchableOpacity>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.formPreview} />
          ) : null}
          <TextInput
            style={styles.input}
            placeholder="Name"
            placeholderTextColor={COLORS.textMuted}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="Description"
            placeholderTextColor={COLORS.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <TextInput
            style={styles.input}
            placeholder="Price (e.g. 12.99)"
            placeholderTextColor={COLORS.textMuted}
            value={priceStr}
            onChangeText={setPriceStr}
            keyboardType="decimal-pad"
          />
          <View style={styles.formActions}>
            {editingId ? (
              <TouchableOpacity style={styles.ghostBtn} onPress={resetForm}>
                <Text style={styles.ghostBtnText}>Cancel edit</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[
                styles.saveBtn,
                (!editingId && list.length >= FOOD_TEMPLATES_MAX) &&
                  styles.saveBtnDisabled,
              ]}
              onPress={onSave}
              disabled={
                saving || (!editingId && list.length >= FOOD_TEMPLATES_MAX)
              }
            >
              {saving ? (
                <ActivityIndicator color="#07241A" />
              ) : (
                <Text style={styles.saveBtnText}>
                  {editingId ? 'Update' : 'Save new'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          {!editingId && list.length >= FOOD_TEMPLATES_MAX ? (
            <Text style={styles.limitHint}>
              Delete a template below to add a new one.
            </Text>
          ) : null}
        </View>

        <Text style={styles.listHeading}>Current templates</Text>
        {listLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : list.length === 0 ? (
          <Text style={styles.empty}>No templates yet.</Text>
        ) : (
          list.map((row) => (
            <View key={row.id} style={styles.catalogCard}>
              {row.imageUrl ? (
                <Image
                  source={{ uri: row.imageUrl }}
                  style={styles.catalogImage}
                />
              ) : (
                <View style={[styles.catalogImage, styles.imagePlaceholder]} />
              )}
              <View style={styles.catalogBody}>
                <Text style={styles.catalogTitle}>{row.name}</Text>
                <Text style={styles.catalogPrice}>
                  ${row.price.toFixed(2)}
                </Text>
                {row.description ? (
                  <Text style={styles.catalogDesc} numberOfLines={3}>
                    {row.description}
                  </Text>
                ) : null}
                <View style={styles.catalogActions}>
                  <TouchableOpacity
                    style={styles.smallBtn}
                    onPress={() => onEdit(row)}
                  >
                    <Text style={styles.smallBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallBtn, styles.dangerBtn]}
                    onPress={() => onDelete(row)}
                    disabled={deletingId === row.id}
                  >
                    {deletingId === row.id ? (
                      <ActivityIndicator color="#FCA5A5" />
                    ) : (
                      <Text style={styles.dangerBtnText}>Delete</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16, paddingBottom: 32 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backLink: { color: COLORS.primary, fontWeight: '700', fontSize: 15 },
  badge: {
    color: COLORS.text,
    fontWeight: '800',
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.35)',
  },
  screenTitle: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: '800',
  },
  screenSub: {
    color: COLORS.textMuted,
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 20,
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    marginBottom: 12,
  },
  errorText: { color: '#FCA5A5', fontWeight: '600' },
  formCard: { marginBottom: 20 },
  sectionLabel: {
    color: COLORS.text,
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: '#34D399',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryBtnText: { color: '#07241A', fontWeight: '800' },
  formPreview: {
    width: '100%',
    height: 160,
    borderRadius: 14,
    marginBottom: 12,
    backgroundColor: '#111',
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    marginBottom: 10,
    fontSize: 16,
  },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    alignItems: 'center',
  },
  ghostBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  ghostBtnText: { color: COLORS.textMuted, fontWeight: '700' },
  saveBtn: {
    flex: 1,
    backgroundColor: '#34D399',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { color: '#07241A', fontWeight: '800' },
  limitHint: {
    marginTop: 10,
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '600',
  },
  listHeading: {
    color: COLORS.text,
    fontWeight: '800',
    fontSize: 18,
    marginBottom: 12,
  },
  empty: { color: COLORS.textMuted, marginBottom: 24 },
  catalogCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  catalogImage: {
    width: 112,
    height: '100%',
    minHeight: 120,
    backgroundColor: '#1a1f28',
  },
  imagePlaceholder: { minHeight: 120 },
  catalogBody: { flex: 1, padding: 12 },
  catalogTitle: {
    color: COLORS.text,
    fontWeight: '800',
    fontSize: 17,
  },
  catalogPrice: {
    color: '#34D399',
    fontWeight: '800',
    fontSize: 16,
    marginTop: 4,
  },
  catalogDesc: {
    color: COLORS.textMuted,
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
  },
  catalogActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  smallBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(52, 211, 153, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.4)',
  },
  smallBtnText: { color: '#A7F3D0', fontWeight: '800', fontSize: 13 },
  dangerBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  dangerBtnText: { color: '#FCA5A5', fontWeight: '800', fontSize: 13 },
  centered: { padding: 24, alignItems: 'center' },
  muted: { color: COLORS.textMuted },
  denied: { color: '#FCA5A5', fontWeight: '800' },
});
