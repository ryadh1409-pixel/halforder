import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  urls: string[];
  /** Local preview uris (not yet uploaded) */
  localUris?: string[];
  onRemoveLocal?: (index: number) => void;
  uploadProgressByIndex?: Record<number, number>;
  retryIndexes?: number[];
  onRetry?: (index: number) => void;
  compact?: boolean;
  /** Admin: open / share download */
  allowDownload?: boolean;
};

export function SupportImageGallery({
  urls,
  localUris = [],
  onRemoveLocal,
  uploadProgressByIndex,
  retryIndexes,
  onRetry,
  compact,
  allowDownload,
}: Props) {
  const [zoomUri, setZoomUri] = useState<string | null>(null);
  const size = compact ? 64 : 88;

  const items: { uri: string; kind: 'remote' | 'local'; index: number }[] = [
    ...urls.map((uri, index) => ({ uri, kind: 'remote' as const, index })),
    ...localUris.map((uri, index) => ({ uri, kind: 'local' as const, index })),
  ];

  if (items.length === 0) return null;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {items.map((item) => {
          const progress =
            item.kind === 'local'
              ? uploadProgressByIndex?.[item.index]
              : undefined;
          const failed =
            item.kind === 'local' &&
            retryIndexes?.includes(item.index) === true;

          return (
            <View key={`${item.kind}-${item.index}-${item.uri}`} style={styles.thumbWrap}>
              <Pressable onPress={() => setZoomUri(item.uri)}>
                <Image
                  source={{ uri: item.uri }}
                  style={{ width: size, height: size, borderRadius: 12 }}
                  contentFit="cover"
                  recyclingKey={item.uri}
                  cachePolicy="memory-disk"
                  transition={200}
                />
              </Pressable>
              {typeof progress === 'number' && progress < 1 ? (
                <View style={styles.progressOverlay}>
                  <ActivityIndicator color="#FFF" size="small" />
                  <Text style={styles.progressText}>
                    {Math.round(progress * 100)}%
                  </Text>
                </View>
              ) : null}
              {failed ? (
                <Pressable
                  style={styles.retryBtn}
                  onPress={() => onRetry?.(item.index)}
                >
                  <Ionicons name="refresh" size={14} color="#FFF" />
                </Pressable>
              ) : null}
              {item.kind === 'local' && onRemoveLocal ? (
                <Pressable
                  style={styles.removeBtn}
                  onPress={() => onRemoveLocal(item.index)}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={14} color="#FFF" />
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={!!zoomUri} transparent animationType="fade" onRequestClose={() => setZoomUri(null)}>
        <View style={styles.zoomBackdrop}>
          <Pressable style={styles.zoomClose} onPress={() => setZoomUri(null)}>
            <Ionicons name="close" size={26} color="#FFF" />
          </Pressable>
          {zoomUri ? (
            <Image
              source={{ uri: zoomUri }}
              style={styles.zoomImage}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          ) : null}
          {allowDownload && zoomUri ? (
            <Pressable
              style={styles.downloadBtn}
              onPress={() => void Linking.openURL(zoomUri)}
            >
              <Ionicons name="download-outline" size={18} color="#FFF" />
              <Text style={styles.downloadText}>Open / Download</Text>
            </Pressable>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 6 },
  thumbWrap: { position: 'relative' },
  progressOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  progressText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  removeBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtn: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#A855F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomClose: {
    position: 'absolute',
    top: 54,
    right: 20,
    zIndex: 2,
    padding: 8,
  },
  zoomImage: { width: '100%', height: '78%' },
  downloadBtn: {
    position: 'absolute',
    bottom: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(168,85,247,0.9)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
  },
  downloadText: { color: '#FFF', fontWeight: '800' },
});
