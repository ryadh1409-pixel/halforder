import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { theme } from '@/constants/theme';
import { formatMillisToronto } from '@/lib/admin/orderHelpers';
import type { AdminUserBankingInfo } from '@/services/adminUserBankingInfo';
import { showError, showSuccess } from '@/utils/toast';
import * as Clipboard from 'expo-clipboard';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type CopyableRow = {
  key: string;
  label: string;
  value: string;
  copyLabel: string;
};

async function copyValue(value: string): Promise<void> {
  try {
    await Clipboard.setStringAsync(value);
    showSuccess('Copied successfully.');
  } catch {
    showError('Could not copy this field.');
  }
}

function preferredMethodLabel(
  method: AdminUserBankingInfo['preferredPayoutMethod'],
): string | null {
  if (method === 'interac') return 'Interac e-Transfer';
  if (method === 'bank') return 'Bank Transfer';
  return null;
}

/**
 * Admin-only payout summary. Card numbers are shown as last 4 digits only;
 * CVV/CVC, tokens and secrets are filtered upstream and never rendered.
 * Read-only — includes Driver Wallet preferred method when present.
 */
export function AdminBankingInfoCard({
  info,
}: {
  info: AdminUserBankingInfo | null;
}) {
  if (!info) {
    return (
      <View style={styles.card}>
        <Text style={styles.emptyText}>No payment method has been added.</Text>
      </View>
    );
  }

  const rows: CopyableRow[] = [];
  const push = (
    key: string,
    label: string,
    value: string | null,
    copyLabel: string,
  ) => {
    if (!value) return;
    rows.push({ key, label, value, copyLabel });
  };

  const methodLabel = preferredMethodLabel(info.preferredPayoutMethod);
  if (methodLabel) {
    rows.push({
      key: 'method',
      label: 'Preferred payout method',
      value: methodLabel,
      copyLabel: 'Copy Method',
    });
  }

  push('interacEmail', 'Interac e-Transfer email', info.interacEmail, 'Copy Email');
  push('legalName', 'Full legal name', info.legalName, 'Copy Name');
  if (
    info.accountHolderName &&
    info.accountHolderName !== info.legalName
  ) {
    push('holder', 'Account holder name', info.accountHolderName, 'Copy Name');
  } else if (!info.legalName) {
    push('holder', 'Account holder name', info.accountHolderName, 'Copy Name');
  }
  push('bank', 'Bank name', info.bankName, 'Copy Bank Name');
  push(
    'institution',
    'Institution number',
    info.institutionNumber,
    'Copy Institution Number',
  );
  push('transit', 'Transit number', info.transitNumber, 'Copy Transit Number');
  push('iban', 'IBAN', info.iban, 'Copy IBAN');
  push('account', 'Bank account number', info.accountNumber, 'Copy Account Number');
  // Avoid duplicating transit when already shown as Canadian transit.
  if (!info.transitNumber) {
    push(
      'routing',
      'Routing / Transit number',
      info.routingNumber,
      'Copy Routing Number',
    );
  }
  push('swift', 'SWIFT / BIC', info.swift, 'Copy SWIFT');

  const cardLine =
    info.cardBrand || info.cardLast4
      ? `${info.cardBrand ?? 'Card'} •••• ${info.cardLast4 ?? '••••'}`
      : null;

  const onlyMethod =
    rows.length === 1 && rows[0]?.key === 'method' && !cardLine;

  return (
    <View style={styles.card}>
      {rows.map((row) => (
        <View key={row.key} style={styles.fieldRow}>
          <View style={styles.fieldText}>
            <Text style={styles.label}>{row.label}</Text>
            <Text style={styles.value} selectable>
              {row.value}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.copyBtn}
            onPress={() => void copyValue(row.value)}
            accessibilityRole="button"
            accessibilityLabel={row.copyLabel}
          >
            <Text style={styles.copyBtnText}>{row.copyLabel}</Text>
          </TouchableOpacity>
        </View>
      ))}

      {onlyMethod ? (
        <Text style={styles.hint}>
          Driver has selected a payout method but has not saved field details yet.
        </Text>
      ) : null}

      {cardLine ? (
        <View style={styles.fieldRow}>
          <View style={styles.fieldText}>
            <Text style={styles.label}>Card on file</Text>
            <Text style={styles.value}>{cardLine}</Text>
            <Text style={styles.hint}>
              Full card number and security code are never stored or shown.
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.footerRow}>
        <View style={styles.footerItem}>
          <Text style={styles.label}>Verification</Text>
          <Text
            style={[
              styles.value,
              info.verified === true ? styles.verified : styles.unverified,
            ]}
          >
            {info.verified === true
              ? 'Verified'
              : info.verified === false
                ? 'Not verified'
                : 'Unknown'}
          </Text>
        </View>
        <View style={styles.footerItem}>
          <Text style={styles.label}>Date added</Text>
          <Text style={styles.value}>
            {info.addedAtMs != null ? formatMillisToronto(info.addedAtMs) : '—'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...adminCardShell, marginBottom: 12, padding: theme.spacing.md },
  emptyText: { fontSize: 14, color: COLORS.textMuted },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flexWrap: 'wrap',
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  fieldText: { flex: 1, minWidth: 160 },
  label: { fontSize: 12, color: COLORS.textMuted, marginBottom: 2 },
  value: { fontSize: 16, color: COLORS.text },
  hint: { fontSize: 11, color: COLORS.textMuted, marginTop: 6, marginBottom: 12 },
  copyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  copyBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  footerRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  footerItem: { flex: 1, minWidth: 140 },
  verified: { color: COLORS.successText, fontWeight: '700' },
  unverified: { color: COLORS.textMuted, fontWeight: '700' },
});
