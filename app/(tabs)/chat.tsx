import {
  type AssistantOrderSummary,
  detectFoodIntent,
  fetchActiveJoinableOrders,
} from '@/services/chatAssistantOrders';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export type AssistantMessageAction = 'join_order' | 'create_order' | 'none';

export type MessageOrderRef = { id: string; title: string };

export type Message = {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  createdAt?: number;
  action?: AssistantMessageAction;
  orders?: MessageOrderRef[];
};

function toMessageOrders(rows: AssistantOrderSummary[]): MessageOrderRef[] {
  return rows.map((r) => ({
    id: r.id,
    title:
      [r.restaurantName, r.mealType].filter(Boolean).join(' · ') ||
      'Order',
  }));
}

function buildJoinReply(count: number, orders: MessageOrderRef[]): string {
  if (count <= 0) return '';
  if (count === 1) {
    return `I found a nearby order: ${orders[0]?.title ?? 'order'} — tap to open 🍕`;
  }
  return `I found ${count} active orders — tap to browse and join 🍕`;
}

export default function ChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const flatListRef = useRef<FlatList<Message> | null>(null);

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const formatTime = (ts?: number) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const handleJoinOrderAction = (item: Message) => {
    const orders = item.orders;
    if (!orders?.length) {
      router.push({ pathname: '/(tabs)/join' } as never);
      return;
    }
    if (orders.length > 1) {
      router.push({ pathname: '/(tabs)/join' } as never);
      return;
    }
    router.push({
      pathname: '/order/[id]',
      params: { id: orders[0].id },
    } as never);
  };

  const handleCreateOrderAction = () => {
    router.push({ pathname: '/(tabs)/create' } as never);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const outgoingText = input.trim();
    setError('');
    const userMessage: Message = {
      id: `${Date.now()}-u`,
      text: outgoingText,
      sender: 'user',
      createdAt: Date.now(),
      action: 'none',
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    let botMessage: Message;

    if (!detectFoodIntent(outgoingText)) {
      botMessage = {
        id: `${Date.now()}-b`,
        text: 'Say you’re hungry, want pizza, or mention food — I’ll look for active orders you can join.',
        sender: 'bot',
        createdAt: Date.now(),
        action: 'none',
      };
      setMessages((prev) => [...prev, botMessage]);
      return;
    }

    setLoading(true);
    try {
      const fetched = await fetchActiveJoinableOrders(3);
      const orderRefs = toMessageOrders(fetched);

      if (orderRefs.length > 0) {
        botMessage = {
          id: `${Date.now()}-b`,
          text: buildJoinReply(orderRefs.length, orderRefs),
          sender: 'bot',
          createdAt: Date.now(),
          action: 'join_order',
          orders: orderRefs,
        };
      } else {
        botMessage = {
          id: `${Date.now()}-b`,
          text: 'No open orders nearby. Tap below to create one — others can join you 🍕',
          sender: 'bot',
          createdAt: Date.now(),
          action: 'create_order',
        };
      }

      setMessages((prev) => [...prev, botMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-err`,
          text: 'Could not load orders. Check your connection and try again.',
          sender: 'bot',
          createdAt: Date.now(),
          action: 'none',
        },
      ]);
      setError('Failed to fetch orders.');
    } finally {
      setLoading(false);
    }
  };

  const handleMicPress = () => {
    Speech.stop();
    setListening(true);
    setTimeout(() => setListening(false), 1500);
  };

  const renderItem = ({ item }: { item: Message }) => {
    const isUser = item.sender === 'user';
    const joinable =
      !isUser && item.action === 'join_order';
    const creatable =
      !isUser && item.action === 'create_order';

    const body = (
      <>
        {joinable ? (
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => handleJoinOrderAction(item)}
            style={styles.actionTextTap}
          >
            <Text style={styles.text}>{item.text}</Text>
            <Text style={styles.actionHint}>Join order →</Text>
          </TouchableOpacity>
        ) : creatable ? (
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={handleCreateOrderAction}
            style={styles.actionTextTap}
          >
            <Text style={styles.text}>{item.text}</Text>
            <Text style={styles.actionHint}>Create order →</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.text}>{item.text}</Text>
        )}
        {item.createdAt ? (
          <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
        ) : null}
      </>
    );

    return (
      <View
        style={[styles.message, isUser ? styles.user : styles.bot]}
      >
        {body}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          onLayout={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
        />

        {loading ? (
          <View style={styles.typingRow}>
            <ActivityIndicator size="small" color="#9CA3AF" />
            <Text style={styles.typingText}>Loading orders…</Text>
          </View>
        ) : null}
        {listening ? (
          <Text style={styles.listeningText}>Listening...</Text>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.inputContainer}>
          <TouchableOpacity onPress={handleMicPress} style={styles.micButton}>
            <Text style={styles.micText}>🎤</Text>
          </TouchableOpacity>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Type a message..."
            placeholderTextColor="#8A8A8A"
            style={styles.input}
            editable={!loading}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
          />
          <TouchableOpacity
            onPress={sendMessage}
            style={[styles.button, loading && styles.buttonDisabled]}
            disabled={loading}
          >
            <Text style={{ color: '#fff' }}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#111' },
  container: { flex: 1, backgroundColor: '#111' },
  messagesContent: { padding: 12, paddingBottom: 20 },

  message: {
    padding: 12,
    borderRadius: 10,
    marginVertical: 5,
    maxWidth: '80%',
  },

  user: {
    backgroundColor: '#007AFF',
    alignSelf: 'flex-end',
  },

  bot: {
    backgroundColor: '#333',
    alignSelf: 'flex-start',
  },

  text: { color: '#fff' },
  actionTextTap: { alignSelf: 'stretch' },
  actionHint: {
    color: '#6EE7B7',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  time: { color: '#B6B6B6', marginTop: 4, fontSize: 11 },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  typingText: { color: '#B6B6B6', fontSize: 13 },
  listeningText: {
    color: '#93C5FD',
    paddingHorizontal: 14,
    marginBottom: 8,
    fontSize: 13,
  },
  errorText: {
    color: '#FCA5A5',
    paddingHorizontal: 14,
    marginBottom: 8,
    fontSize: 13,
  },

  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderColor: '#222',
  },
  micButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  micText: { fontSize: 16 },

  input: {
    flex: 1,
    backgroundColor: '#222',
    color: '#fff',
    padding: 10,
    borderRadius: 8,
    marginRight: 10,
  },

  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 15,
    justifyContent: 'center',
    borderRadius: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
