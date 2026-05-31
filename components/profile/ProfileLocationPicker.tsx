import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { AppTextInput } from '@/components/AppTextInput';
import { useProfileLocation } from '@/hooks/useProfileLocation';
import { SAVED_ADDRESS_LABELS, type SavedAddressLabel } from '@/types/userLocation';

type Palette = {
  surface: string;
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  inputBg: string;
  chipBg: string;
  primary: string;
  onPrimary: string;
  danger: string;
  success: string;
};

type Props = {
  userId: string | null;
  palette: Palette;
};

function labelTitle(id: SavedAddressLabel | null): string {
  if (!id) return '';
  return SAVED_ADDRESS_LABELS.find((l) => l.id === id)?.title ?? '';
}

export function ProfileLocationPicker({ userId, palette }: Props) {
  const {
    saved,
    label,
    loading,
    saving,
    searching,
    resolvingGps,
    error,
    addressInput,
    inputVersion,
    suggestions,
    selectedLabel,
    setSelectedLabel,
    onAddressInputChange,
    selectSuggestion,
    applyCurrentDeviceLocation,
    saveManualQuery,
  } = useProfileLocation(userId);

  const styles = useMemo(() => createStyles(palette), [palette]);
  const saveBusy = saving;
  const gpsBusy = resolvingGps;

  if (!userId) {
    return (
      <View style={styles.card}>
        <Text style={styles.hint}>Sign in to save your delivery address.</Text>
      </View>
    );
  }

  const displayAddress = addressInput.trim();
  const showResolvedPreview = displayAddress.length > 0;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Delivery address</Text>
      <Text style={styles.hint}>
        Search with Google Places or use your current location. Saved for checkout and orders.
      </Text>

      <Text style={styles.subLabel}>Address type</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {SAVED_ADDRESS_LABELS.map((item) => {
          const active = selectedLabel === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setSelectedLabel(item.id)}
              disabled={saveBusy || gpsBusy}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <MaterialIcons
                name={item.icon}
                size={16}
                color={active ? palette.onPrimary : palette.textSecondary}
              />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {item.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <AppTextInput
        key={`profile-address-${inputVersion}`}
        style={styles.input}
        value={addressInput}
        onChangeText={onAddressInputChange}
        placeholder="Search street address, city…"
        placeholderTextColor={palette.textTertiary}
        editable
        autoCorrect={false}
      />

      {gpsBusy ? (
        <View style={styles.inlineStatus}>
          <ActivityIndicator size="small" color={palette.primary} />
          <Text style={styles.inlineStatusText}>Getting your location…</Text>
        </View>
      ) : null}

      {showResolvedPreview && !gpsBusy ? (
        <View style={styles.resolvedPreview}>
          <MaterialIcons name="place" size={18} color={palette.success} />
          <Text style={styles.resolvedPreviewText} numberOfLines={3}>
            {displayAddress}
          </Text>
        </View>
      ) : null}

      {searching ? (
        <View style={styles.inlineStatus}>
          <ActivityIndicator size="small" color={palette.primary} />
          <Text style={styles.inlineStatusText}>Searching…</Text>
        </View>
      ) : null}

      {suggestions.length > 0 ? (
        <View style={styles.suggestionsBox}>
          {suggestions.map((row) => (
            <TouchableOpacity
              key={row.placeId}
              style={styles.suggestionRow}
              onPress={() => void selectSuggestion(row.placeId)}
              disabled={saveBusy || gpsBusy}
            >
              <MaterialIcons name="place" size={18} color={palette.primary} />
              <View style={styles.suggestionTextCol}>
                <Text style={styles.suggestionMain} numberOfLines={1}>
                  {row.mainText}
                </Text>
                {row.secondaryText ? (
                  <Text style={styles.suggestionSecondary} numberOfLines={1}>
                    {row.secondaryText}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.secondaryButton, gpsBusy && styles.buttonDisabled]}
          onPress={() => void applyCurrentDeviceLocation()}
          disabled={gpsBusy}
        >
          {gpsBusy ? (
            <ActivityIndicator size="small" color={palette.primary} />
          ) : (
            <>
              <MaterialIcons name="my-location" size={18} color={palette.primary} />
              <Text style={styles.secondaryButtonText}>Use current location</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryButton, saveBusy && styles.buttonDisabled]}
          onPress={() => void saveManualQuery()}
          disabled={saveBusy || gpsBusy || displayAddress.length < 3}
        >
          {saveBusy ? (
            <ActivityIndicator size="small" color={palette.onPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>Save address</Text>
          )}
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {loading ? (
        <View style={styles.savedRow}>
          <ActivityIndicator size="small" color={palette.textSecondary} />
          <Text style={styles.savedMeta}>Loading saved address…</Text>
        </View>
      ) : saved ? (
        <View style={styles.savedRow}>
          <MaterialIcons name="check-circle" size={18} color={palette.success} />
          <View style={styles.savedTextCol}>
            <Text style={styles.savedAddress} numberOfLines={3}>
              {saved.address}
            </Text>
            <Text style={styles.savedMeta}>
              {labelTitle(label) ? `${labelTitle(label)} · ` : ''}
              {saved.latitude.toFixed(5)}, {saved.longitude.toFixed(5)}
            </Text>
          </View>
        </View>
      ) : showResolvedPreview ? (
        <Text style={styles.hint}>Address ready — tap Save address to store on your profile.</Text>
      ) : (
        <Text style={styles.hint}>No delivery address saved yet.</Text>
      )}
    </View>
  );
}

function createStyles(p: Palette) {
  return StyleSheet.create({
    card: {
      backgroundColor: p.surface,
      borderRadius: 14,
      padding: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: p.textSecondary,
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    subLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: p.textSecondary,
      marginTop: 12,
      marginBottom: 8,
    },
    hint: {
      fontSize: 13,
      color: p.textTertiary,
      lineHeight: 18,
      marginBottom: 4,
    },
    chipRow: {
      gap: 8,
      paddingBottom: 4,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: p.chipBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
    },
    chipActive: {
      backgroundColor: p.primary,
      borderColor: p.primary,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '600',
      color: p.textSecondary,
    },
    chipTextActive: {
      color: p.onPrimary,
    },
    input: {
      marginTop: 12,
      backgroundColor: p.inputBg,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: p.text,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
    },
    resolvedPreview: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 10,
      padding: 10,
      borderRadius: 10,
      backgroundColor: p.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
    },
    resolvedPreviewText: {
      flex: 1,
      fontSize: 15,
      color: p.text,
      lineHeight: 20,
    },
    inlineStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
    },
    inlineStatusText: {
      fontSize: 13,
      color: p.textSecondary,
    },
    suggestionsBox: {
      marginTop: 8,
      borderRadius: 10,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      backgroundColor: p.surfaceMuted,
    },
    suggestionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: p.border,
    },
    suggestionTextCol: {
      flex: 1,
    },
    suggestionMain: {
      fontSize: 15,
      color: p.text,
      fontWeight: '500',
    },
    suggestionSecondary: {
      fontSize: 13,
      color: p.textSecondary,
      marginTop: 2,
    },
    actionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 12,
    },
    secondaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      backgroundColor: p.surfaceMuted,
    },
    secondaryButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: p.primary,
    },
    primaryButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: p.primary,
      minWidth: 120,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: p.onPrimary,
    },
    buttonDisabled: {
      opacity: 0.55,
    },
    errorText: {
      marginTop: 10,
      fontSize: 13,
      color: p.danger,
      lineHeight: 18,
    },
    savedRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: p.border,
    },
    savedTextCol: {
      flex: 1,
    },
    savedAddress: {
      fontSize: 15,
      color: p.text,
      lineHeight: 20,
    },
    savedMeta: {
      fontSize: 12,
      color: p.textTertiary,
      marginTop: 4,
    },
  });
}
