import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Props = {
  displayUri: string | null;
  isPicking: boolean;
  isUploading: boolean;
  uploadProgress: number;
  disabled?: boolean;
  onPick: () => void;
};

export function MenuItemImagePicker({
  displayUri,
  isPicking,
  isUploading,
  uploadProgress,
  disabled = false,
  onPick,
}: Props) {
  const busy = isPicking || isUploading;
  const pct = Math.round(Math.min(1, Math.max(0, uploadProgress)) * 100);

  return (
    <View style={styles.wrap}>
      <Pressable
        style={[styles.pickBtn, (disabled || busy) && styles.pickBtnDisabled]}
        onPress={onPick}
        disabled={disabled || busy}
        accessibilityRole="button"
        accessibilityLabel={displayUri ? 'Change menu item photo' : 'Add menu item photo'}
      >
        <Text style={styles.pickBtnText}>
          {displayUri ? 'Change photo' : 'Add photo'}
        </Text>
      </Pressable>

      <View style={styles.previewFrame}>
        {displayUri ? (
          <Image source={{ uri: displayUri }} style={styles.preview} />
        ) : (
          <View style={[styles.preview, styles.previewEmpty]}>
            <Ionicons name="image-outline" size={40} color="#94a3b8" />
            <Text style={styles.previewHint}>No photo yet</Text>
          </View>
        )}

        {(isPicking || isUploading) && (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.overlayText}>
              {isPicking ? 'Opening library…' : `Uploading ${pct}%`}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginBottom: 8 },
  pickBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cbd5e1',
  },
  pickBtnDisabled: { opacity: 0.55 },
  pickBtnText: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  previewFrame: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
  },
  preview: { width: '100%', height: '100%' },
  previewEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  previewHint: { fontSize: 14, color: '#64748b' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
  },
  overlayText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
