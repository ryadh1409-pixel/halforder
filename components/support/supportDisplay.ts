/**
 * Presentation-only helpers for Support UI (customer + admin).
 * Does not touch Firestore or business logic.
 */
import type {
  SupportConversation,
  SupportConversationPriority,
  SupportConversationStatus,
} from '@/services/supportConversations';

/** Short customer-facing ticket number, e.g. #871701 */
export function formatTicketNumber(
  referenceNumber: string | null | undefined,
  fallbackId: string,
): string {
  const source = (referenceNumber ?? fallbackId).trim();
  const digits = source.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `#${digits.slice(-6)}`;
  }
  const alnum = source.replace(/[^a-zA-Z0-9]/g, '');
  const short = (alnum.slice(-6) || '000000').toUpperCase();
  return `#${short}`;
}

export function formatSupportCategory(category: string | null | undefined): string {
  const c = (category ?? '').trim();
  if (!c) return 'General';
  return c;
}

export function formatCreatedShort(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatMessageClock(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDaySeparator(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayMs = 86_400_000;
  if (startMsg === startToday) return 'Today';
  if (startMsg === startToday - dayMs) return 'Yesterday';
  return d.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function priorityLabel(p: SupportConversationPriority): string {
  switch (p) {
    case 'urgent':
      return 'Urgent';
    case 'high':
      return 'High';
    case 'low':
      return 'Low';
    default:
      return 'Normal';
  }
}

export function priorityTone(p: SupportConversationPriority): string {
  switch (p) {
    case 'urgent':
      return '#EF4444';
    case 'high':
      return '#F59E0B';
    case 'low':
      return '#94A3B8';
    default:
      return '#A855F7';
  }
}

export type AdminSupportFilter =
  | 'all'
  | 'new'
  | 'waiting'
  | 'replied'
  | 'closed'
  | 'high';

export function conversationMatchesFilter(
  c: SupportConversation,
  filter: AdminSupportFilter,
): boolean {
  const closed = c.status === 'closed' || c.status === 'resolved';
  switch (filter) {
    case 'all':
      return true;
    case 'new':
      return !closed && (c.unreadAdmin > 0 || c.status === 'open');
    case 'waiting':
      return c.status === 'waiting';
    case 'replied':
      return !closed && c.lastSender === 'admin';
    case 'closed':
      return closed;
    case 'high':
      return c.priority === 'high' || c.priority === 'urgent';
    default:
      return true;
  }
}

export function friendlyStatus(status: SupportConversationStatus): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'reviewing':
      return 'In review';
    case 'waiting':
      return 'Waiting on you';
    case 'resolved':
      return 'Resolved';
    case 'closed':
      return 'Closed';
    default:
      return status;
  }
}

/** Customer-facing status — never expose raw internals. */
export function customerStatusLabel(status: SupportConversationStatus): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'reviewing':
      return 'In review';
    case 'waiting':
      return 'Awaiting your reply';
    case 'resolved':
      return 'Resolved';
    case 'closed':
      return 'Closed';
    default:
      return 'Open';
  }
}
