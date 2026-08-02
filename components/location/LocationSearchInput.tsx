import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import type { LocationPalette } from '@/components/location/locationPalette';
import { useAccountSavedLocation } from '@/hooks/useAccountSavedLocation';
import { useLocationPickerMount } from '@/hooks/useLocationPickerMount';
import { displaySavedAddressTypeLabel } from '@/lib/location/userLocationLabel';
import { syncProfileLocationToAddressBook } from '@/services/checkoutCustomerPrefs';
import { logRoleGps, type AccountLocationRole } from '@/services/location/accountLocationRole';
import { useLocationSearch } from '@/services/location/useLocationSearch';
import { getUserFriendlyError } from '@/services/errors/userFriendlyErrors';
import type { AccountLocationCollection, SavedLocation } from '@/types/savedLocation';
import {
  CUSTOM_ADDRESS_LABEL_SUGGESTIONS,
  SAVED_ADDRESS_LABELS,
  type PlaceAutocompleteSuggestion,
  type SavedAddressLabel,
} from '@/types/userLocation';
import { showError, showSuccess } from '@/utils/toast';

const SEARCH_PLACEHOLDER = 'Search current address, city, postal code...';

type Props = {
  /** When set, drives collection defaults, logs, and Firestore role metadata. */
  role?: AccountLocationRole;
  accountId: string | null;
  collection: AccountLocationCollection;
  palette: LocationPalette;
  title?: string;
  hint?: string;
  showAddressLabels?: boolean;
  deliveryMode?: boolean;
  signedOutHint?: string;
  saveSuccessMessage?: string;
};

function isValidSavedCoords(location: SavedLocation | null | undefined): boolean {
  return Boolean(
    location &&
      location.address.trim() &&
      Number.isFinite(location.latitude) &&
      Number.isFinite(location.longitude) &&
      !(Math.abs(location.latitude) < 0.001 && Math.abs(location.longitude) < 0.001),
  );
}

function formatAccuracy(meters: number | null): string | null {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (meters < 1) return 'High accuracy (under 1 m)';
  if (meters <= 15) return `GPS accuracy ±${Math.round(meters)} m`;
  return `GPS accuracy ±${Math.round(meters)} m — move outdoors for a better fix`;
}

const POSTAL_RE = /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i;

function suggestionDetailLines(item: PlaceAutocompleteSuggestion): {
  title: string;
  streetLine: string;
  cityPostalLine: string;
} {
  const title = item.mainText.trim();
  const secondary = item.secondaryText.trim();
  const postalMatch = secondary.match(POSTAL_RE) ?? item.formattedAddress.match(POSTAL_RE);
  const postal = postalMatch?.[0]?.toUpperCase() ?? '';
  const parts = secondary
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const streetLine = parts[0] && parts[0] !== title ? parts[0] : secondary || title;
  const cityParts = parts.slice(1);
  const cityPostalLine = [
    cityParts.join(', ').replace(POSTAL_RE, '').trim(),
    postal,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    title,
    streetLine: streetLine !== title ? streetLine : '',
    cityPostalLine,
  };
}

type PlacesAutocompleteFieldProps = {
  palette: LocationPalette;
  styles: ReturnType<typeof createStyles>;
  fieldKey: number;
  value: string;
  onChangeText: (text: string) => void;
  searching: boolean;
  showNoResults: boolean;
  suggestions: PlaceAutocompleteSuggestion[];
  renderSuggestion: ({ item }: { item: PlaceAutocompleteSuggestion }) => React.ReactElement;
};

function PlacesAutocompleteField({
  palette,
  styles,
  fieldKey,
  value,
  onChangeText,
  searching,
  showNoResults,
  suggestions,
  renderSuggestion,
}: PlacesAutocompleteFieldProps) {
  const showDropdown =
    value.trim().length >= 2 && (searching || suggestions.length > 0 || showNoResults);

  return (
    <View style={styles.searchSection}>
      <View style={styles.searchInputRow}>
        <MaterialIcons
          name="search"
          size={20}
          color={palette.textTertiary}
          style={styles.searchIcon}
        />
        <TextInput
          key={`places-search-${fieldKey}`}
          style={styles.searchInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={SEARCH_PLACEHOLDER}
          placeholderTextColor={palette.textTertiary}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="Search address with Google Places"
        />
      </View>

      {searching ? (
        <View style={styles.inlineStatus}>
          <ActivityIndicator size="small" color={palette.primary} />
          <Text style={styles.inlineStatusText}>Searching...</Text>
        </View>
      ) : null}

      {showNoResults && !searching ? (
        <Text style={styles.noResultsText}>No results found</Text>
      ) : null}

      {showDropdown && suggestions.length > 0 ? (
        <FlatList
          data={suggestions}
          keyExtractor={(item) => item.placeId}
          renderItem={renderSuggestion}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          scrollEnabled={suggestions.length > 3}
          style={styles.suggestionsList}
        />
      ) : null}
    </View>
  );
}

export function LocationSearchInput({
  role: roleProp,
  accountId,
  collection,
  palette,
  title = 'Location',
  hint = 'Search with Google Places or use your current location.',
  showAddressLabels = false,
  deliveryMode = false,
  signedOutHint = 'Sign in to save your location.',
  saveSuccessMessage = 'Location saved',
}: Props) {
  const role =
    roleProp ??
    (collection === 'drivers'
      ? 'driver'
      : collection === 'restaurants'
        ? 'restaurant'
        : 'user');
  const {
    saved,
    label,
    customLabel,
    loading: savedLoading,
    saving: persistSaving,
    persist,
    refreshFromServer,
  } = useAccountSavedLocation(collection, accountId, { skipCacheSnapshots: true });

  const {
    searchQuery,
    selectedLocation,
    suggestions,
    searching,
    resolvingGps: gpsBusy,
    gpsImprovingMessage,
    error: searchError,
    showNoResults,
    searchFieldKey,
    gpsState,
    setError: setSearchError,
    onSearchQueryChange,
    selectSuggestion,
    applyCurrentDeviceLocation,
    resolveDraftForSave,
    clearAllLocalState,
    settleAfterSave,
  } = useLocationSearch();

  const [selectedLabel, setSelectedLabel] = useState<SavedAddressLabel>('home');
  const [customLabelText, setCustomLabelText] = useState('');
  const [localSaving, setLocalSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const mountReady = useLocationPickerMount(accountId, collection, clearAllLocalState);

  const roleRef = useRef(role);
  roleRef.current = role;
  const gpsAccuracyRef = useRef(gpsState.accuracyMeters);
  gpsAccuracyRef.current = gpsState.accuracyMeters;
  const selectedLabelRef = useRef(selectedLabel);
  selectedLabelRef.current = selectedLabel;
  const customLabelTextRef = useRef(customLabelText);
  customLabelTextRef.current = customLabelText;
  const showAddressLabelsRef = useRef(showAddressLabels);
  showAddressLabelsRef.current = showAddressLabels;
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const editingLabelRef = useRef(false);

  // Hydrate chips from Firestore when saved profile changes (not while editing chips).
  useEffect(() => {
    if (!showAddressLabels) return;
    if (editingLabelRef.current) return;
    if (label) {
      setSelectedLabel((prev) => (prev === label ? prev : label));
    }
    if (customLabel != null) {
      setCustomLabelText((prev) => (prev === customLabel ? prev : customLabel));
    } else if (label && label !== 'custom') {
      setCustomLabelText((prev) => (prev === '' ? prev : ''));
    }
  }, [label, customLabel, showAddressLabels]);

  const styles = useMemo(() => createStyles(palette), [palette]);
  const busy = persistSaving || localSaving;
  const previewLocation = selectedLocation;
  const accuracyLabel = formatAccuracy(gpsBusy ? null : gpsState.accuracyMeters);
  const hideStaleSavedRow = Boolean(previewLocation) && !justSaved;
  const canSave =
    Boolean(previewLocation) ||
    searchQuery.trim().length >= 3 ||
    isValidSavedCoords(saved);

  const buildPersistOptions = useCallback(() => {
    if (!showAddressLabelsRef.current) {
      return {
        role: roleRef.current,
      };
    }
    const label = selectedLabelRef.current;
    return {
      role: roleRef.current,
      label,
      customLabel: label === 'custom' ? customLabelTextRef.current.trim() : null,
    };
  }, []);

  const afterCustomerSave = useCallback(
    async (location: SavedLocation) => {
      editingLabelRef.current = false;
      setJustSaved(true);
      settleAfterSave();
      if (collection === 'users' && accountId) {
        try {
          await refreshFromServer();
          await syncProfileLocationToAddressBook(accountId);
        } catch {
          /* profile save already succeeded */
        }
      }
      logRoleGps(roleRef.current, 'persist_success', {
        city: location.city,
        gpsAccuracy: location.gpsAccuracy ?? gpsAccuracyRef.current,
        label: selectedLabelRef.current,
      });
      showSuccess(saveSuccessMessage);
    },
    [accountId, collection, refreshFromServer, saveSuccessMessage, settleAfterSave],
  );

  const persistImmediately = useCallback(
    async (location: SavedLocation) => {
      if (!accountId) return;
      if (!isValidSavedCoords(location)) {
        const msg = 'Choose a valid address with coordinates before saving.';
        setSearchError(msg);
        showError(msg);
        return;
      }
      if (
        showAddressLabelsRef.current &&
        selectedLabelRef.current === 'custom' &&
        !customLabelTextRef.current.trim()
      ) {
        const msg = 'Enter a custom label (e.g. Office) before saving.';
        setSearchError(msg);
        showError(msg);
        return;
      }
      setLocalSaving(true);
      setSearchError(null);
      try {
        await persist(location, {
          ...buildPersistOptions(),
          gpsAccuracy: location.gpsAccuracy ?? gpsAccuracyRef.current,
        });
        await afterCustomerSave(location);
      } catch (e) {
        const msg = getUserFriendlyError(e, {
          fallback: 'Could not save your location.',
        });
        setSearchError(msg);
        showError(msg);
      } finally {
        setLocalSaving(false);
      }
    },
    [accountId, afterCustomerSave, buildPersistOptions, persist, setSearchError],
  );

  const handleSelectSuggestion = useCallback(
    async (placeId: string) => {
      const location = await selectSuggestion(placeId);
      if (location) {
        await persistImmediately(location);
      }
    },
    [persistImmediately, selectSuggestion],
  );

  const handleSave = useCallback(async () => {
    if (!accountId) return;
    setLocalSaving(true);
    setSearchError(null);
    try {
      if (
        showAddressLabelsRef.current &&
        selectedLabelRef.current === 'custom' &&
        !customLabelTextRef.current.trim()
      ) {
        throw new Error('Enter a custom label (e.g. Office) before saving.');
      }

      const hasNewDraft =
        isValidSavedCoords(selectedLocation) || searchQuery.trim().length >= 3;
      let location: SavedLocation;
      if (!hasNewDraft && isValidSavedCoords(savedRef.current)) {
        // Re-save existing profile address (e.g. address type / custom label only).
        location = savedRef.current!;
      } else {
        location = await resolveDraftForSave();
      }

      if (!isValidSavedCoords(location)) {
        throw new Error('Choose a valid address with coordinates before saving.');
      }

      await persist(location, {
        ...buildPersistOptions(),
        gpsAccuracy: location.gpsAccuracy ?? gpsAccuracyRef.current,
      });
      logRoleGps(roleRef.current, 'manual_save', {
        city: location.city,
        label: selectedLabelRef.current,
      });
      await afterCustomerSave(location);
    } catch (e) {
      const msg = getUserFriendlyError(e, {
        fallback: 'Could not save your location.',
      });
      setSearchError(msg);
      showError(msg);
    } finally {
      setLocalSaving(false);
    }
  }, [
    accountId,
    afterCustomerSave,
    buildPersistOptions,
    persist,
    resolveDraftForSave,
    selectedLocation,
    searchQuery,
    setSearchError,
  ]);

  const handleUseCurrentLocation = useCallback(async () => {
    const location = await applyCurrentDeviceLocation();
    if (location) {
      await persistImmediately(location);
    }
  }, [applyCurrentDeviceLocation, persistImmediately]);

  const selectAddressType = useCallback((id: SavedAddressLabel) => {
    editingLabelRef.current = true;
    setJustSaved(false);
    setSelectedLabel(id);
    if (id !== 'custom') {
      setCustomLabelText('');
    }
  }, []);

  const renderSuggestion = useCallback(
    ({ item }: { item: PlaceAutocompleteSuggestion }) => {
      const lines = suggestionDetailLines(item);
      return (
        <TouchableOpacity
          style={styles.suggestionRow}
          onPress={() => void handleSelectSuggestion(item.placeId)}
          disabled={busy || gpsBusy}
        >
          <MaterialIcons name="place" size={18} color={palette.primary} />
          <View style={styles.suggestionTextCol}>
            <Text style={styles.suggestionMain} numberOfLines={1}>
              {lines.title}
            </Text>
            {lines.streetLine ? (
              <Text style={styles.suggestionStreet} numberOfLines={1}>
                {lines.streetLine}
              </Text>
            ) : null}
            {lines.cityPostalLine ? (
              <Text style={styles.suggestionSecondary} numberOfLines={2}>
                {lines.cityPostalLine}
              </Text>
            ) : item.formattedAddress !== lines.title ? (
              <Text style={styles.suggestionSecondary} numberOfLines={2}>
                {item.formattedAddress}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    },
    [busy, gpsBusy, handleSelectSuggestion, palette.primary, styles],
  );

  if (!accountId) {
    return (
      <View style={styles.card}>
        <Text style={styles.hint}>{signedOutHint}</Text>
      </View>
    );
  }

  if (!mountReady) {
    return (
      <View style={styles.card}>
        <Text style={styles.label}>{title}</Text>
        <ActivityIndicator color={palette.primary} style={{ marginTop: 12 }} />
        <Text style={styles.hint}>Preparing location search…</Text>
      </View>
    );
  }

  const addressTypeChips = showAddressLabels ? (
    <>
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
              onPress={() => selectAddressType(item.id)}
              disabled={busy}
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

      {selectedLabel === 'custom' ? (
        <View style={styles.customLabelBlock}>
          <Text style={styles.customLabelHint}>Custom label</Text>
          <TextInput
            style={styles.customLabelInput}
            value={customLabelText}
            onChangeText={(text) => {
              editingLabelRef.current = true;
              setJustSaved(false);
              setCustomLabelText(text);
            }}
            placeholder="e.g. Office, Parents, Friend…"
            placeholderTextColor={palette.textTertiary}
            autoCorrect={false}
            autoCapitalize="words"
            maxLength={40}
            editable={!busy}
            accessibilityLabel="Custom address label"
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {CUSTOM_ADDRESS_LABEL_SUGGESTIONS.map((suggestion) => {
              const active =
                customLabelText.trim().toLowerCase() === suggestion.toLowerCase();
              return (
                <TouchableOpacity
                  key={suggestion}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => {
                    editingLabelRef.current = true;
                    setJustSaved(false);
                    setCustomLabelText(suggestion);
                  }}
                  disabled={busy}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {suggestion}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </>
  ) : null;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>

      {addressTypeChips}

      <PlacesAutocompleteField
        palette={palette}
        styles={styles}
        fieldKey={searchFieldKey}
        value={searchQuery}
        onChangeText={onSearchQueryChange}
        searching={searching}
        showNoResults={showNoResults}
        suggestions={suggestions}
        renderSuggestion={renderSuggestion}
      />

      {gpsBusy ? (
        <View style={styles.inlineStatus}>
          <ActivityIndicator size="small" color={palette.primary} />
          <Text style={styles.inlineStatusText}>
            {gpsImprovingMessage ?? 'Locating…'}
          </Text>
        </View>
      ) : null}

      {busy ? (
        <View style={styles.inlineStatus}>
          <ActivityIndicator size="small" color={palette.primary} />
          <Text style={styles.inlineStatusText}>Saving…</Text>
        </View>
      ) : null}

      {deliveryMode && accuracyLabel && !gpsBusy ? (
        <View style={styles.accuracyRow}>
          <MaterialIcons name="gps-fixed" size={16} color={palette.primary} />
          <Text style={styles.accuracyText}>{accuracyLabel}</Text>
        </View>
      ) : null}

      {previewLocation && !gpsBusy ? (
        <View style={styles.resolvedPreview}>
          <MaterialIcons name="place" size={18} color={palette.success} />
          <View style={styles.previewCol}>
            <Text style={styles.previewLabel}>Active location</Text>
            <Text style={styles.resolvedPreviewText} numberOfLines={4}>
              {previewLocation.address}
            </Text>
            <Text style={styles.previewCoords}>
              {previewLocation.latitude.toFixed(5)}, {previewLocation.longitude.toFixed(5)}
              {previewLocation.city ? ` · ${previewLocation.city}` : ''}
              {previewLocation.postalCode ? ` · ${previewLocation.postalCode}` : ''}
              {previewLocation.province ? `, ${previewLocation.province}` : ''}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.secondaryButton, (gpsBusy || busy) && styles.buttonDisabled]}
          onPress={() => void handleUseCurrentLocation()}
          disabled={gpsBusy || busy}
        >
          {gpsBusy ? (
            <ActivityIndicator size="small" color={palette.primary} />
          ) : (
            <>
              <MaterialIcons name="my-location" size={18} color={palette.primary} />
              <Text style={styles.secondaryButtonText}>Use my current location</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryButton, (busy || gpsBusy) && styles.buttonDisabled]}
          onPress={() => void handleSave()}
          disabled={busy || gpsBusy || !canSave}
        >
          {busy && !gpsBusy ? (
            <ActivityIndicator size="small" color={palette.onPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>Save location</Text>
          )}
        </TouchableOpacity>
      </View>

      {searchError ? <Text style={styles.errorText}>{searchError}</Text> : null}

      {savedLoading ? (
        <View style={styles.savedRow}>
          <ActivityIndicator size="small" color={palette.textSecondary} />
          <Text style={styles.savedMeta}>Loading saved location…</Text>
        </View>
      ) : saved && !hideStaleSavedRow ? (
        <View style={styles.savedRow}>
          <MaterialIcons name="check-circle" size={18} color={palette.success} />
          <View style={styles.savedTextCol}>
            <Text style={styles.savedLabel}>SAVED ON YOUR PROFILE</Text>
            <Text style={styles.savedAddress} numberOfLines={3}>
              {saved.address}
            </Text>
            <Text style={styles.savedMeta}>
              {showAddressLabels
                ? `${displaySavedAddressTypeLabel(
                    label ?? selectedLabel,
                    customLabel ?? customLabelText,
                  )} · `
                : ''}
              {saved.latitude.toFixed(5)}, {saved.longitude.toFixed(5)}
            </Text>
          </View>
        </View>
      ) : !previewLocation && !saved ? (
        <Text style={styles.hint}>No location saved yet.</Text>
      ) : null}
    </View>
  );
}

function createStyles(p: LocationPalette) {
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
    searchSection: {
      marginTop: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.inputBg,
      padding: 12,
      gap: 8,
    },
    searchInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      paddingHorizontal: 12,
      backgroundColor: p.surface,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
    },
    searchIcon: { marginRight: 8 },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: p.text,
      paddingVertical: 12,
      minHeight: 48,
    },
    chipRow: { gap: 8, paddingBottom: 4 },
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
    chipActive: { backgroundColor: p.primary, borderColor: p.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: p.textSecondary },
    chipTextActive: { color: p.onPrimary },
    customLabelBlock: { marginTop: 10, gap: 8 },
    customLabelHint: {
      fontSize: 12,
      fontWeight: '600',
      color: p.textTertiary,
    },
    customLabelInput: {
      minHeight: 44,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      backgroundColor: p.inputBg,
      color: p.text,
      fontSize: 15,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    accuracyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    accuracyText: { fontSize: 12, color: p.textSecondary, flex: 1 },
    resolvedPreview: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 10,
      padding: 12,
      borderRadius: 10,
      backgroundColor: p.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
    },
    previewCol: { flex: 1 },
    previewLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: p.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    resolvedPreviewText: { fontSize: 15, color: p.text, lineHeight: 20, fontWeight: '500' },
    previewCoords: { fontSize: 12, color: p.textSecondary, marginTop: 6 },
    inlineStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    inlineStatusText: { fontSize: 13, color: p.textSecondary },
    noResultsText: { fontSize: 13, color: p.textTertiary, paddingVertical: 4 },
    suggestionsList: { maxHeight: 220 },
    suggestionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: p.border,
      minHeight: 48,
    },
    suggestionTextCol: { flex: 1 },
    suggestionMain: { fontSize: 15, color: p.text, fontWeight: '600' },
    suggestionStreet: { fontSize: 14, color: p.text, marginTop: 2 },
    suggestionSecondary: { fontSize: 13, color: p.textSecondary, marginTop: 2 },
    actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
    secondaryButton: {
      flex: 1,
      minWidth: 160,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      backgroundColor: p.surfaceMuted,
      minHeight: 48,
    },
    secondaryButtonText: { fontSize: 14, fontWeight: '600', color: p.primary },
    primaryButton: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: p.primary,
      minWidth: 130,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: { fontSize: 14, fontWeight: '700', color: p.onPrimary },
    buttonDisabled: { opacity: 0.55 },
    errorText: { marginTop: 10, fontSize: 13, color: p.danger, lineHeight: 18 },
    savedRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: p.border,
    },
    savedTextCol: { flex: 1 },
    savedLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: p.success,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 4,
    },
    savedAddress: { fontSize: 15, color: p.text, lineHeight: 20 },
    savedMeta: { fontSize: 12, color: p.textTertiary, marginTop: 4 },
  });
}
