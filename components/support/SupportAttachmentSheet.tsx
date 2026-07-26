import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCamera: () => void;
  onLibrary: () => void;
};

export function SupportAttachmentSheet({
  visible,
  onClose,
  onCamera,
  onLibrary,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>Add photos</Text>
          <Text style={styles.sub}>Camera or photo library · multiple images supported</Text>

          <Pressable
            style={styles.row}
            onPress={() => {
              onClose();
              onCamera();
            }}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="camera-outline" size={22} color="#FFF" />
            </View>
            <Text style={styles.rowText}>Take photo</Text>
          </Pressable>

          <Pressable
            style={styles.row}
            onPress={() => {
              onClose();
              onLibrary();
            }}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="images-outline" size={22} color="#FFF" />
            </View>
            <Text style={styles.rowText}>Photo library</Text>
          </Pressable>

          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#14161F',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 14,
  },
  title: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  sub: { color: '#9CA3AF', fontSize: 13, fontWeight: '600', marginTop: 4, marginBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(168,85,247,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  cancel: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: { color: '#9CA3AF', fontWeight: '700', fontSize: 15 },
});
