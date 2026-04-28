import { StyleSheet } from 'react-native';

export const halfOrderColors = {
  screenBg: '#F3F4F6',
  card: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  savings: '#16A34A',
  savingsSoft: '#DCFCE7',
  border: '#E2E8F0',
  buttonText: '#FFFFFF',
};

export const halfOrderStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: halfOrderColors.screenBg,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 12,
  },
  pageTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: halfOrderColors.textPrimary,
    marginTop: 12,
  },
  pageSubtitle: {
    fontSize: 15,
    color: halfOrderColors.textSecondary,
    marginTop: 6,
    marginBottom: 8,
  },
  card: {
    backgroundColor: halfOrderColors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: halfOrderColors.border,
  },
  ctaButton: {
    marginTop: 12,
    height: 50,
    borderRadius: 14,
    backgroundColor: halfOrderColors.savings,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonText: {
    color: halfOrderColors.buttonText,
    fontWeight: '800',
    fontSize: 16,
  },
  savingsChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: halfOrderColors.savingsSoft,
    marginTop: 8,
  },
  savingsChipText: {
    color: halfOrderColors.savings,
    fontWeight: '700',
    fontSize: 12,
  },
});
