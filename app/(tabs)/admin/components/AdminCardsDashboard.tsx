import { FoodCard } from '../../../../components/FoodCard';
import {
  FoodSlotEditModal,
  type FoodSlotDraft,
} from '../../../../components/admin/FoodSlotEditModal';
import { adminColors as COLORS } from '../../../../constants/adminTheme';
import {
  ADMIN_FOOD_CARD_SLOT_COUNT,
  type AdminFoodCardSlotId,
} from '../../../../constants/adminFoodCards';
import { PickerMediaType } from '../../../../lib/imagePickerMedia';
import { auth, storage } from '../../../../services/firebase';
import { generateFoodCardAiDescription } from '../../../../services/foodCardAiDescription';
import {
  saveAdminFoodCardSlot,
  subscribeAdminFoodCardSlots,
  type AdminFoodCardSlot,
} from '../../../../services/adminFoodCardSlots';
import * as ImagePicker from 'expo-image-picker';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { getUserFriendlyError } from '../../../../utils/errorHandler';
import { showError, showNotice, showSuccess } from '../../../../utils/toast';

function emptyDraft(): FoodSlotDraft {
  return {
    title: '',
    image: '',
    price: '',
    sharingPrice: '',
    venueLocation: '',
    active: false,
    aiDescription: '',
    restaurantName: 'HalfOrder',
  };
}

const COL_GAP = 12;
const ROW_HEIGHT = 196;

export function AdminCardsDashboard() {
  const { width: winW } = useWindowDimensions();
  const cellW = (winW - 16 * 4 - COL_GAP) / 2;

  const [remote, setRemote] = useState<AdminFoodCardSlot[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, FoodSlotDraft>>({});
  const [editingSlot, setEditingSlot] = useState<AdminFoodCardSlot | null>(
    null,
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [aiBusyId, setAiBusyId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeAdminFoodCardSlots((rows) => {
      setRemote(rows);
      setDrafts((prev) => {
        const next = { ...prev };
        rows.forEach((r) => {
          if (!next[r.docId]) {
            next[r.docId] = {
              title: r.title,
              image: r.image,
              price: r.price > 0 ? String(r.price) : '',
              sharingPrice:
                r.sharingPrice > 0 ? String(r.sharingPrice) : '',
              venueLocation: r.venueLocation,
              active: r.active,
              aiDescription: r.aiDescription,
              restaurantName: r.restaurantName,
            };
          }
        });
        return next;
      });
    });
    return unsub;
  }, []);

  const ensureDraft = useCallback(
    (docId: string): FoodSlotDraft => drafts[docId] ?? emptyDraft(),
    [drafts],
  );

  const setField = useCallback(
    (docId: AdminFoodCardSlotId, patch: Partial<FoodSlotDraft>) => {
      setDrafts((prev) => ({
        ...prev,
        [docId]: { ...(prev[docId] ?? emptyDraft()), ...patch },
      }));
    },
    [],
  );

  const syncDraftFromRemote = useCallback((r: AdminFoodCardSlot) => {
    setDrafts((prev) => ({
      ...prev,
      [r.docId]: {
        title: r.title,
        image: r.image,
        price: r.price > 0 ? String(r.price) : '',
        sharingPrice:
          r.sharingPrice > 0 ? String(r.sharingPrice) : '',
        venueLocation: r.venueLocation,
        active: r.active,
        aiDescription: r.aiDescription,
        restaurantName: r.restaurantName,
      },
    }));
  }, []);

  const persistSlot = useCallback(
    async (
      slot: AdminFoodCardSlot,
      d: FoodSlotDraft,
      showToast: boolean,
    ): Promise<boolean> => {
      const docId = slot.docId;
      const priceNum = Number(d.price);
      const sharingNum = Number(d.sharingPrice);
      if (!d.title.trim() || !d.image.trim()) {
        showError('Title and image are required to save.');
        return false;
      }
      if (!Number.isFinite(priceNum) || priceNum <= 0) {
        showError('Enter a valid total price.');
        return false;
      }
      if (!Number.isFinite(sharingNum) || sharingNum <= 0) {
        showError('Enter a valid price per person (sharing).');
        return false;
      }
      setSavingId(docId);
      try {
        await saveAdminFoodCardSlot(docId, {
          id: slot.id,
          title: d.title,
          image: d.image,
          price: priceNum,
          sharingPrice: sharingNum,
          venueLocation: d.venueLocation,
          active: d.active,
          aiDescription: d.aiDescription,
          restaurantName: d.restaurantName,
        });
        if (showToast) showSuccess(`Card ${docId} updated.`);
        return true;
      } catch (e) {
        showError(getUserFriendlyError(e));
        return false;
      } finally {
        setSavingId(null);
      }
    },
    [],
  );

  const pickImage = async (docId: AdminFoodCardSlotId) => {
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) {
      showError('Allow photo library access to upload.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [PickerMediaType.Images],
      allowsEditing: true,
      quality: 0.82,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    try {
      setUploadingId(docId);
      const uri = result.assets[0].uri;
      const blob = await (await fetch(uri)).blob();
      const path = `foodCardSlots/${docId}/${Date.now()}.jpg`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      setField(docId, { image: url });
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setUploadingId(null);
    }
  };

  const onSave = async (slot: AdminFoodCardSlot) => {
    const docId = slot.docId;
    const d = ensureDraft(docId);
    const ok = await persistSlot(slot, d, true);
    if (ok) setEditingSlot(null);
  };

  const onToggleActive = (slot: AdminFoodCardSlot, next: boolean) => {
    const docId = slot.docId;
    const d: FoodSlotDraft = { ...ensureDraft(docId), active: next };
    setDrafts((prev) => ({ ...prev, [docId]: d }));
    void (async () => {
      const ok = await persistSlot(slot, d, false);
      if (!ok) syncDraftFromRemote(slot);
    })();
  };

  const onGenerateAi = (slot: AdminFoodCardSlot) => {
    const docId = slot.docId;
    const d = ensureDraft(docId);
    void (async () => {
      setAiBusyId(docId);
      try {
        const gen = await generateFoodCardAiDescription({
          title: d.title.trim() || slot.title || 'Dish',
          restaurantName:
            d.restaurantName.trim() || slot.restaurantName || 'Restaurant',
        });
        if (gen) setField(docId, { aiDescription: gen });
        else {
          showNotice(
            'OpenAI',
            'Configure EXPO_PUBLIC_OPENAI_API_KEY or type a description manually.',
          );
        }
      } finally {
        setAiBusyId(null);
      }
    })();
  };

  const modalDraft = editingSlot
    ? ensureDraft(editingSlot.docId)
    : emptyDraft();

  const modalSlotId = editingSlot?.docId;

  const listMinHeight = useMemo(() => {
    if (!remote?.length) return ROW_HEIGHT;
    return Math.ceil(remote.length / 2) * ROW_HEIGHT;
  }, [remote?.length]);

  if (!remote) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#16a34a" />
        <Text style={styles.loadingText}>Loading food cards…</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.headTitle}>
        Food cards ({ADMIN_FOOD_CARD_SLOT_COUNT} slots)
      </Text>
      <Text style={styles.headSub}>
        Only active slots appear in the app. Tap a card to edit details.
      </Text>
      <FlatList
        data={remote}
        keyExtractor={(item) => item.docId}
        numColumns={2}
        scrollEnabled={false}
        style={{ minHeight: listMinHeight }}
        columnWrapperStyle={{ gap: COL_GAP, marginBottom: COL_GAP }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: slot }) => {
          const docId = slot.docId;
          const d = ensureDraft(docId);
          const priceNum = Number(d.price);
          const priceLabel =
            Number.isFinite(priceNum) && priceNum > 0
              ? `$${priceNum.toFixed(2)}`
              : slot.price > 0
                ? `$${slot.price.toFixed(2)}`
                : '—';
          const title = (d.title || slot.title || `Card ${docId}`).trim();
          const img = d.image || slot.image;
          return (
            <View style={{ width: cellW }}>
              <FoodCard
                imageUri={img || null}
                title={title}
                priceLabel={priceLabel}
                active={d.active}
                onPress={() => setEditingSlot(slot)}
                onActiveChange={(v) => onToggleActive(slot, v)}
                activeDisabled={savingId === docId}
              />
            </View>
          );
        }}
      />
      <Text style={styles.footerId}>
        Signed in: {auth.currentUser?.uid ?? '—'}
      </Text>

      <FoodSlotEditModal
        visible={!!editingSlot}
        slotLabel={editingSlot ? `Edit card ${editingSlot.docId}` : ''}
        draft={modalDraft}
        onChange={(patch) => {
          if (modalSlotId) setField(modalSlotId, patch);
        }}
        onClose={() => setEditingSlot(null)}
        onSave={() => {
          if (editingSlot) void onSave(editingSlot);
        }}
        onReset={() => {
          if (editingSlot) syncDraftFromRemote(editingSlot);
        }}
        onPickImage={() => {
          if (modalSlotId) void pickImage(modalSlotId);
        }}
        onGenerateAi={() => {
          if (editingSlot) onGenerateAi(editingSlot);
        }}
        saving={modalSlotId ? savingId === modalSlotId : false}
        uploading={modalSlotId ? uploadingId === modalSlotId : false}
        aiBusy={modalSlotId ? aiBusyId === modalSlotId : false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 8 },
  center: { padding: 24, alignItems: 'center' },
  loadingText: { marginTop: 10, color: COLORS.textMuted },
  headTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  headSub: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textMuted,
    marginBottom: 14,
    lineHeight: 18,
  },
  footerId: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textMuted,
    marginTop: 8,
  },
});

export default AdminCardsDashboard;
