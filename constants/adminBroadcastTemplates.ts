export type AdminBroadcastTemplate = {
  label: string;
  title: string;
  message: string;
};

export const ADMIN_BROADCAST_TEMPLATES: readonly AdminBroadcastTemplate[] = [
  {
    label: '🔥 New food available',
    title: 'Fresh picks on HalfOrder',
    message:
      'New food just dropped — open the app and find someone to share with.',
  },
  {
    label: '🍕 Someone is waiting near you',
    title: 'Someone is waiting near you',
    message:
      'A HalfOrder match is live nearby — join before the slot fills up.',
  },
  {
    label: '💸 Invite friends and earn',
    title: 'Invite a friend',
    message:
      'Share an order with a friend on HalfOrder and both earn bonus credits.',
  },
] as const;
