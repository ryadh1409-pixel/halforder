import { RP } from '@/constants/restaurantPremiumTheme';
import type { DisplayMenuItem } from '@/utils/menuDisplayEnrich';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SH } = Dimensions.get('window');
const SHEET_H = Math.min(SH * 0.92, 720);
const DISMISS_Y = SHEET_H + 40;

export type ItemSheetAddPayload = {
  qty: number;
  notes: string;
  /** Human-readable customization summary */
  optionsSummary: string;
};

type Props = {
  visible: boolean;
  item: DisplayMenuItem | null;
  onClose: () => void;
  onAdd: (payload: ItemSheetAddPayload) => void;
};

const BREAD = ['Sourdough', 'Multigrain', 'Herb wrap'] as const;
const CHEESE = ['Cheddar', 'Swiss', 'No cheese'] as const;
const VEGGIES = ['Lettuce', 'Tomato', 'Pickles', 'Onion'] as const;
const SAUCES = ['House sauce', 'Spicy mayo', 'Ranch', 'BBQ'] as const;
const SEASON = ['Black pepper', 'Garlic herb', 'Smoked salt'] as const;

export function ItemDetailsSheet({ visible, item, onClose, onAdd }: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(DISMISS_Y);
  const dragStartY = useSharedValue(0);
  const [bread, setBread] = useState<(typeof BREAD)[number]>(BREAD[0]);
  const [cheese, setCheese] = useState<(typeof CHEESE)[number]>(CHEESE[0]);
  const [veggies, setVeggies] = useState<string[]>(['Lettuce', 'Tomato']);
  const [sauces, setSauces] = useState<string[]>(['House sauce']);
  const [season, setSeason] = useState<string[]>(['Black pepper']);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');

  const closeSheet = useCallback(() => {
    translateY.value = withSpring(DISMISS_Y, { damping: 22, stiffness: 220 }, (finished) => {
      'worklet';
      if (finished) runOnJS(onClose)();
    });
  }, [onClose, translateY]);

  useEffect(() => {
    if (visible && item) {
      setQty(1);
      setBread(BREAD[0]);
      setCheese(CHEESE[0]);
      setVeggies(['Lettuce', 'Tomato']);
      setSauces(['House sauce']);
      setSeason(['Black pepper']);
      setNotes('');
      translateY.value = withSpring(0, { damping: 24, stiffness: 260 });
    } else if (!visible) {
      translateY.value = DISMISS_Y;
    }
  }, [visible, item, translateY]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(8)
        .onStart(() => {
          dragStartY.value = translateY.value;
        })
        .onUpdate((e) => {
          translateY.value = Math.max(0, dragStartY.value + e.translationY);
        })
        .onEnd((e) => {
          const drag = translateY.value;
          if (drag > 120 || e.velocityY > 700) {
            translateY.value = withSpring(DISMISS_Y, { damping: 22, stiffness: 220 }, (finished) => {
              'worklet';
              if (finished) runOnJS(onClose)();
            });
          } else {
            translateY.value = withSpring(0, { damping: 22, stiffness: 260 });
          }
        }),
    [onClose, translateY, dragStartY],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, 1 - translateY.value / DISMISS_Y)),
  }));

  const unitPrice = item?.price ?? 0;
  const lineTotal = unitPrice * qty;

  const toggleMulti = (list: string[], setList: (v: string[]) => void, key: string) => {
    void Haptics.selectionAsync();
    if (list.includes(key)) setList(list.filter((x) => x !== key));
    else setList([...list, key]);
  };

  if (!item) return null;

  return (
    <Modal visible={visible && !!item} animationType="none" transparent statusBarTranslucent>
      <View style={styles.modalRoot}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => closeSheet()}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
            )}
          </Pressable>
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { height: SHEET_H, paddingBottom: Math.max(insets.bottom, 12) },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={pan}>
            <View style={styles.dragHandle}>
              <View style={styles.grabber} />
            </View>
          </GestureDetector>

            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              bounces={false}
            >
              <View style={styles.hero}>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={styles.heroImg} contentFit="cover" transition={300} />
                ) : (
                  <View style={[styles.heroImg, styles.heroPh]}>
                    <Text style={styles.heroPhTxt}>Fresh</Text>
                  </View>
                )}
                {item.offerLabel ? (
                  <View style={styles.bogo}>
                    <Text style={styles.bogoTxt}>{item.offerLabel}</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.itemTitle}>{item.name}</Text>
              <Text style={styles.desc}>{item.description || item.shortIngredients}</Text>

              {item.previouslyOrdered ? (
                <View style={styles.prevBanner}>
                  <Text style={styles.prevStrong}>Previously ordered</Text>
                  <Text style={styles.prevSub}>Guests reorder this item often.</Text>
                </View>
              ) : null}

              <Section title="Bread" required>
                {BREAD.map((b) => (
                  <RadioRow key={b} label={b} on={bread === b} onPress={() => setBread(b)} />
                ))}
              </Section>

              <Section title="Cheese" required>
                {CHEESE.map((c) => (
                  <RadioRow key={c} label={c} on={cheese === c} onPress={() => setCheese(c)} />
                ))}
              </Section>

              <Section title="Veggies">
                {VEGGIES.map((v) => (
                  <CheckRow
                    key={v}
                    label={v}
                    on={veggies.includes(v)}
                    onPress={() => toggleMulti(veggies, setVeggies, v)}
                  />
                ))}
              </Section>

              <Section title="Sauces">
                {SAUCES.map((s) => (
                  <CheckRow
                    key={s}
                    label={s}
                    on={sauces.includes(s)}
                    onPress={() => toggleMulti(sauces, setSauces, s)}
                  />
                ))}
              </Section>

              <Section title="Seasonings">
                {SEASON.map((s) => (
                  <CheckRow
                    key={s}
                    label={s}
                    on={season.includes(s)}
                    onPress={() => toggleMulti(season, setSeason, s)}
                  />
                ))}
              </Section>

              <View style={styles.notesBlock}>
                <Text style={styles.notesLabel}>Special instructions</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Add a note (allergies, spice level…)"
                  placeholderTextColor={RP.textMuted}
                  style={styles.notesInput}
                  multiline
                  maxLength={240}
                  textAlignVertical="top"
                  accessibilityLabel="Order notes"
                />
              </View>

              <View style={styles.qtyRow}>
                <Text style={styles.qtyLabel}>Quantity</Text>
                <View style={styles.qtyCtrl}>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setQty((q) => Math.max(1, q - 1));
                    }}
                  >
                    <Text style={styles.qtyBtnTxt}>−</Text>
                  </Pressable>
                  <Text style={styles.qtyVal}>{qty}</Text>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setQty((q) => q + 1);
                    }}
                  >
                    <Text style={styles.qtyBtnTxt}>+</Text>
                  </Pressable>
                </View>
              </View>
              <View style={{ height: 120 }} />
            </ScrollView>

            <View style={[styles.ctaBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
              {Platform.OS === 'ios' ? (
                <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.98)' }]} />
              )}
              <Pressable
                style={styles.ctaBtn}
                onPress={() => {
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  const parts = [
                    `Bread: ${bread}`,
                    `Cheese: ${cheese}`,
                    veggies.length ? `Veggies: ${veggies.join(', ')}` : null,
                    sauces.length ? `Sauces: ${sauces.join(', ')}` : null,
                    season.length ? `Seasonings: ${season.join(', ')}` : null,
                  ].filter(Boolean) as string[];
                  onAdd({
                    qty,
                    notes: notes.trim(),
                    optionsSummary: parts.join(' · '),
                  });
                  closeSheet();
                }}
              >
                <Text style={styles.ctaTxt}>
                  Add {qty} · ${lineTotal.toFixed(2)}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
      </View>
    </Modal>
  );
}

function Section({
  title,
  required,
  children,
}: {
  title: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {required ? (
          <View style={styles.req}>
            <Text style={styles.reqTxt}>Required</Text>
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function RadioRow({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.radioOuter, on && styles.radioOuterOn]}>
        {on ? <View style={styles.radioInner} /> : null}
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
    </Pressable>
  );
}

function CheckRow({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.cb, on && styles.cbOn]}>
        {on ? <Text style={styles.cbMark}>✓</Text> : null}
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: RP.bg,
    borderTopLeftRadius: RP.radiusL,
    borderTopRightRadius: RP.radiusL,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: RP.surface2 },
  dragHandle: { paddingTop: 8, paddingBottom: 12, alignItems: 'center' },
  scrollContent: { paddingHorizontal: 20 },
  hero: { position: 'relative', borderRadius: 20, overflow: 'hidden', marginBottom: 14 },
  heroImg: { width: '100%', height: 200, backgroundColor: RP.surface },
  heroPh: { alignItems: 'center', justifyContent: 'center' },
  heroPhTxt: { fontWeight: '900', color: RP.textMuted },
  bogo: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: RP.offer,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  bogoTxt: { color: '#fff', fontWeight: '900', fontSize: 12 },
  itemTitle: { fontSize: 26, fontWeight: '900', color: RP.text, letterSpacing: -0.5 },
  desc: { marginTop: 8, fontSize: 15, fontWeight: '600', color: RP.textSecondary, lineHeight: 22 },
  prevBanner: {
    marginTop: 16,
    padding: 14,
    borderRadius: RP.radiusM,
    backgroundColor: RP.surface,
    borderWidth: 1,
    borderColor: RP.border,
  },
  prevStrong: { fontSize: 15, fontWeight: '900', color: RP.text },
  prevSub: { marginTop: 4, fontSize: 13, fontWeight: '600', color: RP.textSecondary },
  notesBlock: { marginTop: 20 },
  notesLabel: { fontSize: 15, fontWeight: '900', color: RP.text },
  notesInput: {
    marginTop: 10,
    minHeight: 88,
    borderRadius: RP.radiusM,
    borderWidth: 1,
    borderColor: RP.border,
    backgroundColor: RP.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
    color: RP.text,
  },
  section: { marginTop: 22 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: RP.text },
  req: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(229,57,53,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(229,57,53,0.25)',
  },
  reqTxt: { fontSize: 11, fontWeight: '900', color: RP.offer },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: RP.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterOn: { borderColor: RP.text },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: RP.text },
  cb: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: RP.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cbOn: { backgroundColor: RP.text, borderColor: RP.text },
  cbMark: { color: '#fff', fontSize: 12, fontWeight: '900' },
  rowLabel: { fontSize: 16, fontWeight: '700', color: RP.text },
  qtyRow: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qtyLabel: { fontSize: 16, fontWeight: '900', color: RP.text },
  qtyCtrl: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: RP.surface,
    borderWidth: 1,
    borderColor: RP.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnTxt: { fontSize: 22, fontWeight: '500', color: RP.text },
  qtyVal: { fontSize: 18, fontWeight: '900', color: RP.text, minWidth: 28, textAlign: 'center' },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: RP.border,
    overflow: 'hidden',
  },
  ctaBtn: {
    height: 56,
    borderRadius: 20,
    backgroundColor: RP.blackBtn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTxt: { color: '#fff', fontSize: 17, fontWeight: '900' },
});
