import { navigateForRole } from '@/lib/navigation';
import { useAuth } from '@/services/AuthContext';
import { captureAndSaveCurrentProfileLocation } from '@/services/signupProfileLocation';
import { getUserRole } from '@/services/userService';
import { showError, showSuccess } from '@/utils/toast';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const AUTH = {
  bg: '#000000',
  card: '#171923',
  text: '#FFFFFF',
  textMuted: '#B7BDC9',
  primary: '#A855F7',
  border: 'rgba(255,255,255,0.08)',
} as const;

export default function LocationPermissionScreen() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    const uid = user?.uid;
    const role = uid ? await getUserRole(uid) : 'user';
    navigateForRole(role);
  };

  const onEnable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await captureAndSaveCurrentProfileLocation(user?.uid);
      showSuccess('Location saved.');
      await finish();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not enable location.');
    } finally {
      setBusy(false);
    }
  };

  const onSkip = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await finish();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <MaterialIcons name="location-on" size={64} color={AUTH.primary} />
        </View>

        <Text style={styles.title}>Enable your location</Text>

        <Text style={styles.lead}>
          Find nearby people to split meals with.
        </Text>

        <Text style={styles.description}>We use your location to:</Text>
        <Text style={styles.bullet}>• Show nearby meal sharing opportunities</Text>
        <Text style={styles.bullet}>• Find nearby restaurants</Text>
        <Text style={styles.bullet}>• Match you with people close to you</Text>

        <Text style={styles.privacyNote}>
          Your exact location is never shared with other users.
        </Text>

        <TouchableOpacity
          style={[styles.primaryBtn, busy && styles.btnDisabled]}
          onPress={() => void onEnable()}
          disabled={busy}
          activeOpacity={0.9}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryBtnText}>Enable Location</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => void onSkip()}
          disabled={busy}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryBtnText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: AUTH.bg,
  },
  body: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 48,
    justifyContent: 'center',
  },
  iconWrap: {
    alignSelf: 'center',
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: AUTH.card,
    borderWidth: 1,
    borderColor: AUTH.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: AUTH.text,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  lead: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
    color: AUTH.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  description: {
    fontSize: 16,
    fontWeight: '600',
    color: AUTH.textMuted,
    marginBottom: 12,
  },
  bullet: {
    fontSize: 15,
    lineHeight: 24,
    color: AUTH.text,
    fontWeight: '500',
    marginBottom: 4,
  },
  privacyNote: {
    marginTop: 20,
    marginBottom: 36,
    fontSize: 14,
    lineHeight: 21,
    color: AUTH.textMuted,
    fontWeight: '500',
  },
  primaryBtn: {
    height: 56,
    borderRadius: 14,
    backgroundColor: AUTH.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  secondaryBtn: {
    marginTop: 14,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AUTH.border,
    backgroundColor: AUTH.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: AUTH.textMuted,
    fontSize: 16,
    fontWeight: '700',
  },
});
