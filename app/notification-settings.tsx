import {
  DEFAULT_FOOD_SHARE_NOTIFICATION_PREFS,
  getFoodShareNotificationPrefs,
  saveFoodShareNotificationPrefs,
  type FoodShareNotificationPrefs,
} from '@/services/foodShareInbox';
import { auth } from '@/services/firebase';
import { showError, showSuccess } from '@/utils/toast';
import { foodShareErrorMessage } from '@/lib/foodShareUx';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function PrefRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.desc}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#334155', true: 'rgba(125,255,184,0.45)' }}
        thumbColor={value ? '#7DFFB8' : '#7D8493'}
      />
    </View>
  );
}

export default function NotificationSettingsScreen() {
  const [prefs, setPrefs] = useState<FoodShareNotificationPrefs>(
    DEFAULT_FOOD_SHARE_NOTIFICATION_PREFS,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        setPrefs(await getFoodShareNotificationPrefs(uid));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const update = async (patch: Partial<FoodShareNotificationPrefs>) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    try {
      await saveFoodShareNotificationPrefs(next);
      showSuccess('Notification preferences saved.');
    } catch (e) {
      setPrefs(prefs);
      showError(foodShareErrorMessage(e, 'Could not save preferences.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#7DFFB8" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Text style={styles.title}>Notification preferences</Text>
      <Text style={styles.sub}>
        Control meal share alerts for matches, chat, and orders.
      </Text>
      <PrefRow
        label="Match notifications"
        description="When someone joins or you get a new match."
        value={prefs.match}
        onChange={(v) => void update({ match: v })}
      />
      <PrefRow
        label="Chat notifications"
        description="New messages from your meal share partner."
        value={prefs.chat}
        onChange={(v) => void update({ chat: v })}
      />
      <PrefRow
        label="Order notifications"
        description="Order placed, driver updates, and delivery."
        value={prefs.order}
        onChange={(v) => void update({ order: v })}
      />
      <PrefRow
        label="Marketing notifications"
        description="Promotions and product updates."
        value={prefs.marketing}
        onChange={(v) => void update({ marketing: v })}
      />
      {saving ? <Text style={styles.saving}>Saving…</Text> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000000', padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFF', fontSize: 24, fontWeight: '900' },
  sub: {
    color: '#B7BDC9',
    marginTop: 6,
    marginBottom: 20,
    fontWeight: '600',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  copy: { flex: 1 },
  label: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  desc: {
    color: '#B7BDC9',
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  saving: {
    marginTop: 16,
    color: '#7D8493',
    fontWeight: '600',
    textAlign: 'center',
  },
});
