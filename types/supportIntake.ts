/** Guided HalfOrder support intake (Complaint / Customer Support). */

export type SupportIssueCategoryId =
  | 'order_issue'
  | 'payment_issue'
  | 'refund_request'
  | 'delivery_problem'
  | 'driver_issue'
  | 'restaurant_issue'
  | 'report_user'
  | 'technical_problem'
  | 'account_issue'
  | 'promotion_issue'
  | 'other';

export type SupportIntakeStepId =
  | 'category'
  | 'select_order'
  | 'upload_images'
  | 'payment_amount'
  | 'payment_date'
  | 'order_number_optional'
  | 'description'
  | 'review';

export type SupportIssueCategory = {
  id: SupportIssueCategoryId;
  label: string;
  subtitle: string;
  icon: string;
  /** Human label stored on tickets / complaints */
  storeLabel: string;
  steps: SupportIntakeStepId[];
};

export type SupportAttachmentMeta = {
  url: string;
  path: string;
  contentType: string;
  width?: number | null;
  height?: number | null;
};

export type SupportDeviceInfo = {
  platform: string;
  osVersion: string | null;
  modelName: string | null;
  appVersion: string | null;
};

export type SupportTicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export const SUPPORT_ISSUE_CATEGORIES: SupportIssueCategory[] = [
  {
    id: 'order_issue',
    label: 'Order Issue',
    subtitle: 'Missing items, wrong order, status',
    icon: 'receipt-outline',
    storeLabel: 'Order Issue',
    steps: ['select_order', 'upload_images', 'description', 'review'],
  },
  {
    id: 'payment_issue',
    label: 'Payment Issue',
    subtitle: 'Charges, failed payment, cards',
    icon: 'card-outline',
    storeLabel: 'Payment Issue',
    steps: [
      'upload_images',
      'payment_amount',
      'payment_date',
      'order_number_optional',
      'description',
      'review',
    ],
  },
  {
    id: 'refund_request',
    label: 'Refund Request',
    subtitle: 'Request money back for an order',
    icon: 'cash-outline',
    storeLabel: 'Refund Request',
    steps: ['select_order', 'upload_images', 'description', 'review'],
  },
  {
    id: 'delivery_problem',
    label: 'Delivery Problem',
    subtitle: 'Late, incomplete, or wrong address',
    icon: 'bicycle-outline',
    storeLabel: 'Delivery Problem',
    steps: ['select_order', 'upload_images', 'description', 'review'],
  },
  {
    id: 'driver_issue',
    label: 'Driver Issue',
    subtitle: 'Behavior, contact, or delivery experience',
    icon: 'car-outline',
    storeLabel: 'Driver Issue',
    steps: ['select_order', 'upload_images', 'description', 'review'],
  },
  {
    id: 'restaurant_issue',
    label: 'Restaurant Issue',
    subtitle: 'Food quality, prep time, restaurant',
    icon: 'restaurant-outline',
    storeLabel: 'Restaurant Issue',
    steps: ['select_order', 'upload_images', 'description', 'review'],
  },
  {
    id: 'report_user',
    label: 'Report User',
    subtitle: 'Unsafe or inappropriate behavior',
    icon: 'shield-outline',
    storeLabel: 'Report User',
    steps: ['upload_images', 'description', 'review'],
  },
  {
    id: 'technical_problem',
    label: 'Technical Problem',
    subtitle: 'App bugs, crashes, screens that fail',
    icon: 'construct-outline',
    storeLabel: 'Technical Problem',
    steps: ['upload_images', 'description', 'review'],
  },
  {
    id: 'account_issue',
    label: 'Account Issue',
    subtitle: 'Login, profile, or access',
    icon: 'person-outline',
    storeLabel: 'Account Issue',
    steps: ['description', 'review'],
  },
  {
    id: 'promotion_issue',
    label: 'Promotion Issue',
    subtitle: 'Promo codes, credits, referrals',
    icon: 'pricetag-outline',
    storeLabel: 'Promotion Issue',
    steps: ['upload_images', 'description', 'review'],
  },
  {
    id: 'other',
    label: 'Other',
    subtitle: 'Anything else we can help with',
    icon: 'chatbubble-ellipses-outline',
    storeLabel: 'Other',
    steps: ['description', 'review'],
  },
];

export function supportCategoryById(
  id: SupportIssueCategoryId,
): SupportIssueCategory {
  return (
    SUPPORT_ISSUE_CATEGORIES.find((c) => c.id === id) ??
    SUPPORT_ISSUE_CATEGORIES[SUPPORT_ISSUE_CATEGORIES.length - 1]
  );
}
