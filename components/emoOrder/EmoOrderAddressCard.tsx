import React, { memo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { EMO_AI_PURPLE, EMO_AI_SURFACE } from '@/types/emoAi';
import { geocodeAddressToCoordinates } from '@/services/places/googlePlacesClient';
import type { EmoOrderAddressDraft } from '@/types/emoOrder';
import { showError } from '@/utils/toast';

type Props = {
  /** Pre-filled address from saved location */
  prefilledAddress: string;
  prefilledLat: number;
  prefilledLng: number;
  onConfirm: (address: EmoOrderAddressDraft) => void;
};

function EmoOrderAddressCardInner({ prefilledAddress, prefilledLat, prefilledLng, onConfirm }: Props) {
  const [editMode, setEditMode] = useState(false);
  const [customAddress, setCustomAddress] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleConfirmSaved() {
    onConfirm({ address: prefilledAddress, lat: prefilledLat, lng: prefilledLng });
  }

  async function handleConfirmCustom() {
    const trimmed = customAddress.trim();
    if (!trimmed) {
      showError('Enter a delivery address.');
      return;
    }
    setBusy(true);
    try {
      const result = await geocodeAddressToCoordinates(trimmed);
      if (!result || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) {
        showError('Address not found. Try a more specific address.');
        return;
      }
      onConfirm({ address: trimmed, lat: result.latitude, lng: result.longitude });
    } catch {
      showError('Could not verify address. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (editMode) {
    return (
      <View style={styles.card}>
        <Text style={styles.label}>Enter delivery address</Text>
        <TextInput
          style={styles.input}
          placeholder="123 Main St, Ottawa, ON"
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={customAddress}
          onChangeText={setCustomAddress}
          autoFocus
        />
        <View style={styles.btnRow}>
          <Pressable style={styles.cancelBtn} onPress={() => setEditMode(false)}>
            <Text style={styles.cancelBtnText}>Back</Text>
          </Pressable>
          <Pressable
            style={[styles.confirmBtn, (!customAddress.trim() || busy) && styles.btnDisabled]}
            disabled={!customAddress.trim() || busy}
            onPress={() => void handleConfirmCustom()}
          >
            {busy ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.confirmBtnText}>Confirm</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.addressRow}>
        <Text style={styles.addressIcon}>📍</Text>
        <Text style={styles.addressText} numberOfLines={2}>
          {prefilledAddress}
        </Text>
      </View>
      <View style={styles.btnRow}>
        <Pressable style={styles.changeBtn} onPress={() => setEditMode(true)}>
          <Text style={styles.changeBtnText}>Use different address</Text>
        </Pressable>
        <Pressable style={styles.confirmBtn} onPress={() => void handleConfirmSaved()}>
          <Text style={styles.confirmBtnText}>Deliver here</Text>
        </Pressable>
      </View>
    </View>
  );
}

export const EmoOrderAddressCard = memo(EmoOrderAddressCardInner);

// ── Address input only (no saved address) ─────────────────────────────────

export function EmoOrderAddressInput({ onConfirm }: { onConfirm: (a: EmoOrderAddressDraft) => void }) {
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    const trimmed = address.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const result = await geocodeAddressToCoordinates(trimmed);
      if (!result || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) {
        showError('Address not found. Try a more specific address.');
        return;
      }
      onConfirm({ address: trimmed, lat: result.latitude, lng: result.longitude });
    } catch {
      showError('Could not verify address. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Your delivery address</Text>
      <TextInput
        style={styles.input}
        placeholder="123 Main St, Ottawa, ON"
        placeholderTextColor="rgba(255,255,255,0.3)"
        value={address}
        onChangeText={setAddress}
        autoFocus
      />
      <Pressable
        style={[styles.confirmBtn, (!address.trim() || busy) && styles.btnDisabled]}
        disabled={!address.trim() || busy}
        onPress={() => void handleConfirm()}
      >
        {busy ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <Text style={styles.confirmBtnText}>Confirm address</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    padding: 14,
    borderRadius: 16,
    backgroundColor: EMO_AI_SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.22)',
    gap: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  addressIcon: { fontSize: 16, marginTop: 1 },
  addressText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#FFFFFF', lineHeight: 20 },
  input: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.25)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  btnRow: { flexDirection: 'row', gap: 8 },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cancelBtnText: { color: 'rgba(255,255,255,0.6)', fontWeight: '700', fontSize: 14 },
  changeBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  changeBtnText: { color: 'rgba(255,255,255,0.6)', fontWeight: '700', fontSize: 14 },
  confirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EMO_AI_PURPLE,
  },
  btnDisabled: { opacity: 0.4 },
  confirmBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
});
