import { adminColors as COLORS } from '@/constants/adminTheme';
import {
  subscribeEmoAiConversations,
  type EmoAiConversationDoc,
} from '@/services/emoAi/emoAiConversations';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ─── helpers ────────────────────────────────────────────────────────────────

function formatWhen(ms: number): string {
  if (!ms) return '—';
  try {
    const d = new Date(ms);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/** Deterministic hue from a string, returns an HSL color string. */
function stringToHue(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  return `hsl(${h % 360}, 65%, 40%)`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.slice(0, 2) ?? '??').toUpperCase();
}

// ─── Avatar ─────────────────────────────────────────────────────────────────

function Avatar({
  photoUrl,
  name,
  size = 44,
}: {
  photoUrl: string | null;
  name: string;
  size?: number;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  if (photoUrl && !imgFailed) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: stringToHue(name),
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          color: '#fff',
          fontWeight: '800',
          fontSize: size * 0.38,
          letterSpacing: 0.5,
        }}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

// ─── ConversationCard ────────────────────────────────────────────────────────

function ConversationCard({ conv }: { conv: EmoAiConversationDoc }) {
  const lastUserMsg = [...conv.messages].reverse().find((m) => m.role === 'user');
  const preview = lastUserMsg?.content?.trim().slice(0, 80) ?? conv.title.slice(0, 80);

  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Avatar
          photoUrl={conv.userPhotoUrl}
          name={conv.userName}
          size={44}
        />
        <View style={styles.cardInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {conv.userName}
            </Text>
            {conv.highPriority ? (
              <View style={styles.priorityBadge}>
                <Text style={styles.priorityText}>!</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            {conv.userEmail || 'no email'}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            ID: {conv.userId}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            Conv: {conv.id}
          </Text>
          <Text style={styles.metaDate}>{formatWhen(conv.lastActivityMs)}</Text>
        </View>
      </View>
      <Text style={styles.msgCount}>{conv.messageCount} messages</Text>
      {preview ? (
        <Text style={styles.preview} numberOfLines={2}>
          {preview}
        </Text>
      ) : null}
    </View>
  );
}

// ─── AdminAiConversationsSection ─────────────────────────────────────────────

interface Props {
  onViewAll: () => void;
}

export function AdminAiConversationsSection({ onViewAll }: Props) {
  const [rows, setRows] = useState<EmoAiConversationDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeEmoAiConversations(
      (list) => {
        setRows(list.slice(0, 10));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View>
      {/* Summary row */}
      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>
          {rows.length === 0
            ? 'No conversations yet'
            : `${rows.length}${rows.length === 10 ? '+' : ''} conversation${rows.length !== 1 ? 's' : ''}`}
        </Text>
        <TouchableOpacity onPress={onViewAll} hitSlop={8}>
          <Text style={styles.viewAll}>View all →</Text>
        </TouchableOpacity>
      </View>

      {rows.length === 0 ? (
        <Text style={styles.empty}>No Emo AI conversations yet.</Text>
      ) : (
        rows.map((c) => <ConversationCard key={c.id} conv={c} />)
      )}
    </View>
  );
}

// ─── styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { paddingVertical: 24, alignItems: 'center' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryText: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
  viewAll: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  empty: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', paddingVertical: 16 },
  card: {
    backgroundColor: COLORS.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
  },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  name: { fontSize: 15, fontWeight: '800', color: COLORS.text, flex: 1 },
  priorityBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  priorityText: { color: '#fff', fontWeight: '900', fontSize: 11 },
  meta: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600', marginTop: 1 },
  metaDate: { fontSize: 11, color: COLORS.primary, fontWeight: '700', marginTop: 3 },
  msgCount: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600', marginTop: 8 },
  preview: {
    marginTop: 6,
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
    opacity: 0.75,
  },
});
