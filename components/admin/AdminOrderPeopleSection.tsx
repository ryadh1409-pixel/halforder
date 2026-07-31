import {
  extractOrderPeopleIds,
  fetchAdminOrderPeople,
  type AdminOrderPersonInfo,
} from '@/services/adminOrderPeople';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type Props = {
  order: Record<string, unknown>;
};

type PersonCardConfig = {
  title: string;
  nameLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  person: AdminOrderPersonInfo;
};

function displayOrDash(value: string | null | undefined, fallback = '—'): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

function PersonCard({ title, nameLabel, icon, person }: PersonCardConfig) {
  const phone = displayOrDash(person.phone);
  const email = displayOrDash(person.email);
  const phoneLink =
    typeof person.phone === 'string' && person.phone.trim()
      ? `tel:${person.phone.trim()}`
      : null;
  const emailLink =
    typeof person.email === 'string' && person.email.trim()
      ? `mailto:${person.email.trim()}`
      : null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={18} color={COLORS.primary} />
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>

      <Text style={styles.k}>{nameLabel}</Text>
      <Text style={styles.v}>{displayOrDash(person.name)}</Text>

      <Text style={styles.k}>Phone Number</Text>
      {phoneLink ? (
        <TouchableOpacity
          onPress={() => void Linking.openURL(phoneLink)}
          accessibilityRole="link"
          accessibilityLabel={`Call ${phone}`}
        >
          <Text style={[styles.v, styles.link]}>{phone}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.v}>{phone}</Text>
      )}

      <Text style={styles.k}>Email Address</Text>
      {emailLink ? (
        <TouchableOpacity
          onPress={() => void Linking.openURL(emailLink)}
          accessibilityRole="link"
          accessibilityLabel={`Email ${email}`}
        >
          <Text style={[styles.v, styles.link]}>{email}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.v}>{email}</Text>
      )}
    </View>
  );
}

/**
 * Admin-only section for Order Details — Customer, Restaurant, and Driver contacts.
 */
export function AdminOrderPeopleSection({ order }: Props) {
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<AdminOrderPersonInfo | null>(null);
  const [restaurant, setRestaurant] = useState<AdminOrderPersonInfo | null>(null);
  const [driver, setDriver] = useState<AdminOrderPersonInfo | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;

  const peopleKey = useMemo(() => {
    const ids = extractOrderPeopleIds(order);
    return [ids.customerId, ids.restaurantId, ids.driverId].join('|');
  }, [order]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const people = await fetchAdminOrderPeople(orderRef.current);
        if (cancelled) return;
        setCustomer(people.customer);
        setRestaurant(people.restaurant);
        setDriver(people.driver);
      } catch {
        if (cancelled) return;
        setCustomer({
          id: null,
          assigned: false,
          name: '—',
          phone: null,
          email: null,
        });
        setRestaurant({
          id: null,
          assigned: false,
          name: '—',
          phone: null,
          email: null,
        });
        setDriver({
          id: null,
          assigned: false,
          name: 'Not Assigned',
          phone: null,
          email: null,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [peopleKey]);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>People in this Order</Text>
      {loading || !customer || !restaurant || !driver ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading contacts…</Text>
        </View>
      ) : (
        <>
          <PersonCard
            title="Customer"
            nameLabel="Full Name"
            icon="person-outline"
            person={customer}
          />
          <PersonCard
            title="Restaurant"
            nameLabel="Restaurant Name"
            icon="storefront-outline"
            person={restaurant}
          />
          <PersonCard
            title="Driver"
            nameLabel="Full Name"
            icon="car-outline"
            person={driver}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 8 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 10,
  },
  loadingRow: {
    ...adminCardShell,
    marginBottom: 16,
    padding: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: { color: COLORS.textMuted, fontSize: 14 },
  card: {
    ...adminCardShell,
    marginBottom: 12,
    padding: theme.spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  k: { fontSize: 12, color: COLORS.textMuted, marginBottom: 2 },
  v: {
    fontSize: 15,
    color: COLORS.text,
    marginBottom: 8,
    flexShrink: 1,
  },
  link: {
    textDecorationLine: 'underline',
    color: COLORS.primary,
  },
});
