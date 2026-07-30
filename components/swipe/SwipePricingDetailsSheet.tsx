import { FoodSharePricingCard } from '@/components/foodShare/FoodSharePricingCard';
import { formatShareCurrency } from '@/lib/foodSharePricing';
import type { SwipeFoodCard as SwipeFoodCardType } from '@/types/swipe';
import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  onClose: () => void;
  card: SwipeFoodCardType;
};

/** Read-only breakdown for a Swipe card. Reuses the shared pricing card. */
function SwipePricingDetailsSheetInner({ visible, onClose, card }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          accessibilityRole="button"
          accessibilityLabel="Close pricing details"
          onPress={onClose}
        />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow} numberOfLines={1}>
                {card.restaurantName}
              </Text>
              <Text style={styles.title} numberOfLines={2}>
                {card.title}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={18} color="#E6E8EE" />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
          >
            <View style={styles.receipt}>
              <FoodSharePricingCard
                pricing={card.pricing}
                variant="card"
                showTax={false}
                showSavings
                fulfillmentMode={card.fulfillmentMode}
                style={styles.receiptRows}
              />
              <View style={styles.receiptFooter}>
                <Text style={styles.receiptFooterLabel}>Taxes</Text>
                <Text style={styles.receiptFooterValue}>
                  Calculated at checkout
                </Text>
              </View>
            </View>

            {card.pricing.totalSaving > 0 ? (
              <View style={styles.savingsNote}>
                <Ionicons name="pricetag" size={14} color="#7DFFB8" />
                <Text style={styles.savingsNoteTxt}>
                  You save {formatShareCurrency(card.pricing.totalSaving)} by
                  splitting this order.
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Done"
            style={({ pressed }) => [styles.doneBtn, pressed && styles.pressed]}
          >
            <Text style={styles.doneTxt}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export const SwipePricingDetailsSheet = memo(SwipePricingDetailsSheetInner);

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: '#12141C',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9AA1AF',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  body: { paddingBottom: 8 },
  receipt: {
    borderRadius: 20,
    backgroundColor: 'rgba(23,25,35,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  receiptRows: {
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  receiptFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  receiptFooterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B7BDC9',
  },
  receiptFooterValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A91A0',
  },
  savingsNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.24)',
  },
  savingsNoteTxt: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#7DFFB8',
    lineHeight: 18,
  },
  doneBtn: {
    marginTop: 16,
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.9)',
  },
  pressed: { opacity: 0.85 },
  doneTxt: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
