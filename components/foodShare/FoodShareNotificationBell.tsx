import { useFoodShareUnreadCount } from '@/hooks/useFoodShareInbox';
import { auth } from '@/services/firebase';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function FoodShareNotificationBell(): React.JSX.Element {
  const router = useRouter();
  const uid = auth.currentUser?.uid;
  const unread = useFoodShareUnreadCount(uid);

  return (
    <Pressable
      style={styles.btn}
      onPress={() => router.push('/inbox' as never)}
      hitSlop={8}
    >
      <Ionicons name="notifications-outline" size={22} color="#FFF" />
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeTxt}>{unread > 9 ? '9+' : String(unread)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeTxt: { color: '#FFF', fontSize: 10, fontWeight: '900' },
});
