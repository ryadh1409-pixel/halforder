import { MoneySavedScreenContent } from '@/components/moneySaved/MoneySavedScreenContent';
import { useMoneySavedDetail } from '@/hooks/useMoneySavedDetail';
import { goBackFromProfileScreen } from '@/lib/profileBack';
import { useAuth } from '@/services/AuthContext';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MoneySavedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  const { user } = useAuth();
  const uid = isRegisteredAuthUser(user) ? user?.uid ?? null : null;
  const data = useMoneySavedDetail(uid);

  const theme = useMemo(
    () =>
      isDark
        ? {
            bg: '#000000',
            card: '#171923',
            cardElevated: '#1C1F2E',
            text: '#FFFFFF',
            textSecondary: '#B7BDC9',
            border: 'rgba(255,255,255,0.08)',
            success: '#22C55E',
            primary: '#A855F7',
            shadow: '#000000',
          }
        : {
            bg: '#F8FAFC',
            card: '#FFFFFF',
            cardElevated: '#FFFFFF',
            text: '#0F172A',
            textSecondary: '#64748B',
            border: 'rgba(15, 23, 42, 0.08)',
            success: '#16A34A',
            primary: '#7C3AED',
            shadow: '#0F172A',
          },
    [isDark],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
        <Pressable
          style={[styles.backBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF' }]}
          onPress={() => goBackFromProfileScreen(router)}
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Money Saved</Text>
        <View style={styles.backBtnSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <MoneySavedScreenContent data={data} theme={theme} isDark={isDark} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnSpacer: {
    width: 40,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  scroll: {
    paddingTop: 8,
  },
});
