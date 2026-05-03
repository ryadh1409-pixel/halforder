/**
 * Home menu templates: 2-column grid + section FAB + edit modal.
 */
import { FoodCard } from '../../../../components/FoodCard';
import { FoodEditModal } from '../../../../components/FoodEditModal';
import { systemConfirm } from '../../../../components/SystemDialogHost';
import { adminColors as COLORS } from '../../../../constants/adminTheme';
import { useAuth } from '../../../../services/AuthContext';
import {
  addTemplate,
  deleteTemplate,
  subscribeTemplates,
  updateTemplate,
} from '../../../../services/adminService';
import { FOOD_TEMPLATES_MAX } from '../../../../services/foodTemplates';
import { pickAndUploadImage } from '../../../../services/uploadImage';
import type { FoodTemplate, FoodTemplateWrite } from '../../../../types/food';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { getUserFriendlyError } from '../../../../utils/errorHandler';
import { showError, showSuccess } from '../../../../utils/toast';

const PRIMARY = '#16a34a';

function parsePrice(raw: string): number | null {
  const n = Number(String(raw).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

type CatalogContextValue = {
  list: FoodTemplate[];
  loading: boolean;
  error: string | null;
  openCreate: () => void;
  openEdit: (row: FoodTemplate) => void;
  toggleTemplateActive: (row: FoodTemplate, next: boolean) => void;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

const COL_GAP = 12;
const ROW_HEIGHT = 196;

export function AdminFoodCatalogProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [list, setList] = useState<FoodTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!enabled || !user) {
      setLoading(false);
      setList([]);
      return;
    }
    setLoading(true);
    const unsub = subscribeTemplates(
      (rows) => {
        setList(rows);
        setError(null);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [enabled, user]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setName('');
    setDescription('');
    setPriceStr('');
    setImageUrl('');
    setActive(true);
  }, []);

  const openCreate = useCallback(() => {
    resetForm();
    setModalOpen(true);
  }, [resetForm]);

  const openEdit = useCallback((row: FoodTemplate) => {
    setEditingId(row.id);
    setName(row.name);
    setDescription(row.description);
    setPriceStr(String(row.price));
    setImageUrl(row.imageUrl);
    setActive(row.active);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    resetForm();
  }, [resetForm]);

  const onPickImage = async () => {
    const uid = user?.uid;
    if (!uid) return;
    setUploading(true);
    try {
      const { url, error: uploadErr } = await pickAndUploadImage({
        uid,
        folder: 'foodTemplates',
        quality: 0.85,
      });
      if (uploadErr) showError(uploadErr);
      if (url) setImageUrl(url);
    } finally {
      setUploading(false);
    }
  };

  const onSave = async () => {
    const price = parsePrice(priceStr);
    if (!name.trim()) {
      showError('Enter a name.');
      return;
    }
    if (!description.trim()) {
      showError('Enter a description.');
      return;
    }
    if (price === null) {
      showError('Enter a valid price.');
      return;
    }
    if (!imageUrl.trim()) {
      showError('Upload an image.');
      return;
    }

    const payload: FoodTemplateWrite = {
      name: name.trim(),
      description: description.trim(),
      price,
      imageUrl: imageUrl.trim(),
      active,
    };

    setSaving(true);
    try {
      if (editingId) {
        await updateTemplate(editingId, payload);
        setModalOpen(false);
        resetForm();
        showSuccess('Template updated.');
      } else {
        if (list.length >= FOOD_TEMPLATES_MAX) {
          showError(
            `Maximum ${FOOD_TEMPLATES_MAX} templates. Delete one to add another.`,
          );
          return;
        }
        await addTemplate(payload);
        setModalOpen(false);
        resetForm();
        showSuccess('Template added.');
      }
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const onDeletePress = useCallback(() => {
    if (!editingId) return;
    const row = list.find((r) => r.id === editingId);
    if (!row) return;
    void (async () => {
      const ok = await systemConfirm({
        title: 'Delete',
        message: `Remove “${row.name}”?`,
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!ok) return;
      try {
        await deleteTemplate(row.id);
        setModalOpen(false);
        resetForm();
        showSuccess('Template removed.');
      } catch (e) {
        showError(getUserFriendlyError(e));
      }
    })();
  }, [editingId, list, resetForm]);

  const toggleTemplateActive = useCallback(
    async (row: FoodTemplate, next: boolean) => {
      try {
        await updateTemplate(row.id, {
          name: row.name,
          description: row.description,
          price: row.price,
          imageUrl: row.imageUrl,
          active: next,
        });
      } catch (e) {
        showError(getUserFriendlyError(e));
      }
    },
    [],
  );

  const ctx = useMemo<CatalogContextValue>(
    () => ({
      list,
      loading,
      error,
      openCreate,
      openEdit,
      toggleTemplateActive,
    }),
    [list, loading, error, openCreate, openEdit, toggleTemplateActive],
  );

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <CatalogContext.Provider value={ctx}>
      {children}
      <FoodEditModal
        visible={modalOpen}
        mode={editingId ? 'edit' : 'create'}
        onClose={closeModal}
        name={name}
        onChangeName={setName}
        description={description}
        onChangeDescription={setDescription}
        priceStr={priceStr}
        onChangePriceStr={setPriceStr}
        imageUrl={imageUrl}
        onPickImage={onPickImage}
        uploading={uploading}
        active={active}
        onChangeActive={setActive}
        saving={saving}
        onSave={onSave}
        onDeletePress={editingId ? onDeletePress : undefined}
      />
    </CatalogContext.Provider>
  );
}

export function AdminFoodCatalogList() {
  const ctx = useContext(CatalogContext);
  const { width: winW } = useWindowDimensions();
  if (!ctx) return null;
  const { list, loading, error, openEdit, toggleTemplateActive } = ctx;

  const parentPad = 16 * 2;
  const innerPad = 16 * 2;
  const cellW = (winW - parentPad - innerPad - COL_GAP) / 2;

  if (error) {
    return (
      <View style={styles.errorBanner}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={PRIMARY} />
        <Text style={styles.loaderCap}>Loading catalog…</Text>
      </View>
    );
  }

  if (list.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>No menu items yet</Text>
        <Text style={styles.emptySub}>
          Use + in this section to add your first item (max {FOOD_TEMPLATES_MAX}).
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={list}
      keyExtractor={(item) => item.id}
      numColumns={2}
      scrollEnabled={false}
      style={{
        minHeight: Math.ceil(list.length / 2) * ROW_HEIGHT,
        marginTop: 8,
      }}
      columnWrapperStyle={{ gap: COL_GAP, marginBottom: COL_GAP }}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => (
        <View style={{ width: cellW }}>
          <FoodCard
            imageUri={item.imageUrl || null}
            title={item.name}
            priceLabel={`$${item.price.toFixed(2)}`}
            active={item.active}
            onPress={() => openEdit(item)}
            onActiveChange={(v) => toggleTemplateActive(item, v)}
          />
        </View>
      )}
    />
  );
}

export function AdminFoodCatalogFab() {
  const ctx = useContext(CatalogContext);
  if (!ctx) return null;
  const { list, openCreate } = ctx;
  const atCap = list.length >= FOOD_TEMPLATES_MAX;

  return (
    <View style={fabStyles.wrap} pointerEvents="box-none">
      <TouchableOpacity
        style={[fabStyles.fab, atCap && fabStyles.fabMuted]}
        onPress={() => {
          if (atCap) {
            showError(
              `You already have ${FOOD_TEMPLATES_MAX} templates. Delete one to add another.`,
            );
            return;
          }
          openCreate();
        }}
        activeOpacity={0.9}
      >
        <Text style={fabStyles.fabPlus}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const fabStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    alignItems: 'flex-end',
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  fabMuted: { opacity: 0.45 },
  fabPlus: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '400',
    marginTop: -2,
  },
});

const styles = StyleSheet.create({
  loader: { paddingVertical: 24, alignItems: 'center' },
  loaderCap: { marginTop: 8, color: COLORS.textMuted, fontWeight: '600' },
  emptyWrap: {
    paddingVertical: 20,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  emptyTitle: { color: COLORS.text, fontWeight: '700', fontSize: 16 },
  emptySub: {
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  errorBanner: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: COLORS.dangerBg,
    marginTop: 8,
  },
  errorText: { color: COLORS.error, fontWeight: '600' },
});

export default AdminFoodCatalogList;
