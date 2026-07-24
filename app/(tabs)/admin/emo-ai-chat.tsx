import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminColors as COLORS } from '@/constants/adminTheme';
import {
  filterEmoAiConversations,
  subscribeEmoAiConversations,
  type EmoAiConversationDoc,
  type EmoConversationFilter,
} from '@/services/emoAi/emoAiConversations';
import {
  buildEmoConversationAnalytics,
  buildEmoConversationInsights,
} from '@/services/emoAi/emoAiConversationInsights';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const FILTERS: { key: EmoConversationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'unread', label: 'Unread' },
  { key: 'flagged', label: 'Flagged' },
];

function formatWhen(ms: number): string {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '—';
  }
}

export default function AdminEmoAiChatScreen() {
  const [rows, setRows] = useState<EmoAiConversationDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<EmoConversationFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeEmoAiConversations(
      (list) => {
        setRows(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  const filtered = useMemo(
    () => filterEmoAiConversations(rows, { search, filter }),
    [rows, search, filter],
  );

  const analytics = useMemo(() => buildEmoConversationAnalytics(rows), [rows]);
  const insights = useMemo(() => buildEmoConversationInsights(rows), [rows]);
  const highPriority = useMemo(
    () => rows.filter((r) => r.highPriority || r.flagged).slice(0, 20),
    [rows],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AdminHeader
        title="Emo Chat"
        subtitle="All Emo AI conversations"
        fallbackRoute={adminRoutes.home}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search user, email, uid, keyword, restaurant, food…"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.chip, filter === f.key && styles.chipOn]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.chipText, filter === f.key && styles.chipTextOn]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.section}>Conversation Analytics</Text>
        <View style={styles.card}>
          <Text style={styles.stat}>Total conversations: {analytics.totalConversations}</Text>
          <Text style={styles.stat}>Active users: {analytics.activeUsers}</Text>
          <Text style={styles.stat}>
            Avg messages / conversation: {analytics.averageMessagesPerConversation}
          </Text>
          <Text style={styles.stat}>
            Avg conversation length: {analytics.averageConversationLength} chars
          </Text>
          <Text style={styles.stat}>
            Avg response time:{' '}
            {analytics.averageResponseTimeMs != null
              ? `${Math.round(analytics.averageResponseTimeMs / 100) / 10}s`
              : 'n/a'}
          </Text>
          <Text style={styles.stat}>Daily: {analytics.dailyConversationCount}</Text>
          <Text style={styles.stat}>Weekly: {analytics.weeklyConversationCount}</Text>
          <Text style={styles.stat}>Monthly: {analytics.monthlyConversationCount}</Text>
        </View>

        <Text style={styles.section}>AI Insights</Text>
        <View style={styles.card}>
          <Text style={styles.insightTitle}>Most requested restaurants</Text>
          <Text style={styles.insightBody}>
            {insights.mostRequestedRestaurants.map((x) => `${x.name} (${x.count})`).join(', ') ||
              '—'}
          </Text>
          <Text style={styles.insightTitle}>Most requested meals</Text>
          <Text style={styles.insightBody}>
            {insights.mostRequestedMeals.map((x) => `${x.name} (${x.count})`).join(', ') || '—'}
          </Text>
          <Text style={styles.insightTitle}>Trending keywords</Text>
          <Text style={styles.insightBody}>
            {insights.trendingKeywords.map((x) => x.name).join(', ') || '—'}
          </Text>
          <Text style={styles.insightTitle}>Payment / delivery / bugs</Text>
          <Text style={styles.insightBody}>
            {[
              ...insights.mostCommonPaymentIssues,
              ...insights.mostCommonDeliveryIssues,
              ...insights.mostCommonBugs,
            ]
              .map((x) => `${x.name} (${x.count})`)
              .join(', ') || '—'}
          </Text>
        </View>

        <Text style={styles.section}>High Priority</Text>
        {highPriority.length === 0 ? (
          <Text style={styles.empty}>No high-priority conversations.</Text>
        ) : (
          highPriority.map((c) => (
            <View key={`hp-${c.id}`} style={[styles.card, styles.priority]}>
              <Text style={styles.name}>{c.userName}</Text>
              <Text style={styles.meta}>{c.title}</Text>
              <Text style={styles.meta}>{formatWhen(c.lastActivityMs)}</Text>
            </View>
          ))
        )}

        <Text style={styles.section}>
          User Conversations ({filtered.length})
        </Text>
        {loading ? (
          <ActivityIndicator color={COLORS.primary} />
        ) : filtered.length === 0 ? (
          <Text style={styles.empty}>No conversations match.</Text>
        ) : (
          filtered.map((c) => {
            const open = expandedId === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                style={styles.card}
                activeOpacity={0.88}
                onPress={() => setExpandedId(open ? null : c.id)}
              >
                <Text style={styles.name}>{c.userName}</Text>
                <Text style={styles.meta}>
                  {c.userEmail || 'no email'} · {c.userId}
                </Text>
                <Text style={styles.meta}>{formatWhen(c.lastActivityMs)}</Text>
                <Text style={styles.title}>{c.title}</Text>
                <Text style={styles.meta}>
                  {c.messageCount} messages
                  {c.highPriority ? ' · HIGH PRIORITY' : ''}
                </Text>
                {open ? (
                  <View style={styles.thread}>
                    {c.messages.map((m) => (
                      <Text key={m.id} style={styles.msg}>
                        <Text style={styles.msgRole}>
                          {m.role === 'user' ? 'User' : 'Emo'}:{' '}
                        </Text>
                        {m.content}
                      </Text>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.tap}>Tap to view full conversation</Text>
                )}
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  search: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 10,
  },
  filters: { marginBottom: 14 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 8,
    backgroundColor: COLORS.card,
  },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: COLORS.onPrimary },
  section: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
  },
  priority: { borderColor: '#F59E0B' },
  name: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  title: { marginTop: 6, fontSize: 14, fontWeight: '700', color: COLORS.text },
  meta: { marginTop: 2, fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  tap: { marginTop: 8, fontSize: 12, color: COLORS.primary, fontWeight: '700' },
  thread: { marginTop: 12, gap: 8 },
  msg: { color: COLORS.text, fontSize: 13, lineHeight: 18 },
  msgRole: { fontWeight: '800' },
  empty: { color: COLORS.textMuted, marginBottom: 12 },
  stat: { color: COLORS.text, fontWeight: '600', marginBottom: 4 },
  insightTitle: {
    marginTop: 6,
    fontWeight: '800',
    color: COLORS.text,
    fontSize: 13,
  },
  insightBody: { color: COLORS.textMuted, marginTop: 2, marginBottom: 4, fontSize: 13 },
});
