import { EMO_AI_PURPLE, EMO_AI_SURFACE } from '@/types/emoAi';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
};

export function EmoAiComposer({ onSend, disabled }: Props) {
  const [text, setText] = useState('');

  const submit = () => {
    const t = text.trim();
    if (!t || disabled) return;
    setText('');
    onSend(t);
  };

  return (
    <View style={styles.row}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Type a message..."
        placeholderTextColor="#7D8493"
        editable={!disabled}
        multiline
        maxLength={800}
        onSubmitEditing={submit}
        blurOnSubmit={false}
      />
      <TouchableOpacity
        style={[styles.send, (!text.trim() || disabled) && styles.sendDisabled]}
        onPress={submit}
        disabled={!text.trim() || disabled}
        activeOpacity={0.9}
        accessibilityLabel="Send message"
      >
        <MaterialIcons name="send" size={20} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: 24,
    backgroundColor: EMO_AI_SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 15,
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: EMO_AI_PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.45,
  },
});
