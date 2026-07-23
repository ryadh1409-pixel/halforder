import { PromotionBadge } from '@/components/PromotionBadge';
import { RP } from '@/constants/restaurantPremiumTheme';
import type { DisplayMenuItem } from '@/utils/menuDisplayEnrich';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppTextInput } from '../AppTextInput';
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
  /** Current cart qty for this menu item (0 if not in cart). */
  initialQty?: number;
  onClose: () => void;
  onAdd: (payload: ItemSheetAddPayload) => void;
};

export function ItemDetailsSheet({
  visible,
  item,
  initialQty = 0,
  onClose,
  onAdd,
}: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(DISMISS_Y);
  const dragStartY = useSharedValue(0);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const editingExisting = initialQty > 0;

  const closeSheet = useCallback(() => {
    translateY.value = withSpring(DISMISS_Y, { damping: 22, stiffness: 220 }, (finished) => {
      'worklet';
      if (finished) runOnJS(onClose)();
    });
  }, [onClose, translateY]);

  useEffect(() => {
    if (visible && item) {
      setQty(initialQty > 0 ? initialQty : 1);
      setNotes('');
      translateY.value = withSpring(0, { damping: 24, stiffness: 260 });
    } else if (!visible) {
      translateY.value = DISMISS_Y;
    }
  }, [visible, item, initialQty, translateY]);

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
                {item.promotionBadge && item.promotionBadge !== 'none' ? (
                  <PromotionBadge
                    value={item.promotionBadge}
                    style={styles.promoBadge}
                  />
                ) : item.offerLabel ? (
                  <View style={styles.bogo}>
                    <Text style={styles.bogoTxt}>{item.offerLabel}</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.itemTitle}>{item.name}</Text>
              <Text style={styles.desc}>{item.description || item.shortIngredients}</Text>
              <Text style={styles.price}>${unitPrice.toFixed(2)}</Text>

              <View style={styles.notesBlock}>
                <Text style={styles.notesLabel}>Special instructions</Text>
                <AppTextInput
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
                    accessibilityLabel="Decrease quantity"
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setQty((q) => Math.max(0, q - 1));
                    }}
                  >
                    <Text style={styles.qtyBtnTxt}>−</Text>
                  </Pressable>
                  <Text style={styles.qtyVal}>{qty}</Text>
                  <Pressable
                    style={styles.qtyBtn}
                    accessibilityLabel="Increase quantity"
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
                  onAdd({
                    qty,
                    notes: notes.trim(),
                    optionsSummary: '',
                  });
                  closeSheet();
                }}
              >
                <Text style={styles.ctaTxt}>
                  {qty <= 0
                    ? 'Remove from cart'
                    : editingExisting
                      ? `Update cart · $${lineTotal.toFixed(2)}`
                      : `Add to cart · $${lineTotal.toFixed(2)}`}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
      </View>
    </Modal>
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
  promoBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 2,
  },
  itemTitle: { fontSize: 26, fontWeight: '900', color: RP.text, letterSpacing: -0.5 },
  desc: { marginTop: 8, fontSize: 15, fontWeight: '600', color: RP.textSecondary, lineHeight: 22 },
  price: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '900',
    color: RP.text,
  },
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
