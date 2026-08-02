import { Ionicons } from '@expo/vector-icons';
import React, { memo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type OrderFeedbackPayload = {
  orderRating: number;
  restaurantRating: number;
  driverRating: number | null;
  comment: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: OrderFeedbackPayload) => Promise<void>;
  /** When true, hide the driver rating (pickup orders) */
  isPickup?: boolean;
  restaurantName?: string;
};

function StarRow({
  label,
  value,
  onChange,
  icon,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  icon: string;
}) {
  return (
    <View style={styles.starSection}>
      <View style={styles.starLabelRow}>
        <Text style={styles.starIcon}>{icon}</Text>
        <Text style={styles.starLabel}>{label}</Text>
      </View>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${n} star`}
          >
            <Ionicons
              name={n <= value ? 'star' : 'star-outline'}
              size={32}
              color={n <= value ? '#FBBF24' : 'rgba(255,255,255,0.2)'}
            />
          </Pressable>
        ))}
      </View>
      <Text style={styles.starHint}>
        {value === 0
          ? 'Tap to rate'
          : value === 1
          ? 'Poor'
          : value === 2
          ? 'Fair'
          : value === 3
          ? 'Good'
          : value === 4
          ? 'Great'
          : 'Excellent!'}
      </Text>
    </View>
  );
}

function OrderFeedbackModalInner({
  visible,
  onClose,
  onSubmit,
  isPickup = false,
  restaurantName,
}: Props) {
  const insets = useSafeAreaInsets();
  const [orderRating, setOrderRating] = useState(0);
  const [restaurantRating, setRestaurantRating] = useState(0);
  const [driverRating, setDriverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const canSubmit = orderRating > 0 && restaurantRating > 0 && (isPickup || driverRating > 0);

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        orderRating,
        restaurantRating,
        driverRating: isPickup ? null : driverRating,
        comment: comment.trim(),
      });
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setOrderRating(0);
    setRestaurantRating(0);
    setDriverRating(0);
    setComment('');
    setDone(false);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.overlay}>
          <Pressable
            style={styles.backdrop}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
          <View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 20) },
            ]}
          >
            <View style={styles.grabber} />

            {done ? (
              <View style={styles.doneContainer}>
                <Text style={styles.doneEmoji}>🎉</Text>
                <Text style={styles.doneTitle}>Thank you!</Text>
                <Text style={styles.doneBody}>
                  Your feedback helps us improve the HalfOrder experience.
                </Text>
                <Pressable
                  style={styles.submitBtn}
                  onPress={handleClose}
                  accessibilityRole="button"
                >
                  <Text style={styles.submitTxt}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.header}>
                  <Text style={styles.title}>Rate your experience</Text>
                  {restaurantName ? (
                    <Text style={styles.subtitle}>{restaurantName}</Text>
                  ) : null}
                </View>

                <StarRow
                  icon="🍽️"
                  label="Your Order"
                  value={orderRating}
                  onChange={setOrderRating}
                />
                <View style={styles.divider} />

                <StarRow
                  icon="🏪"
                  label="Restaurant"
                  value={restaurantRating}
                  onChange={setRestaurantRating}
                />

                {!isPickup ? (
                  <>
                    <View style={styles.divider} />
                    <StarRow
                      icon="🚗"
                      label="Driver & Delivery"
                      value={driverRating}
                      onChange={setDriverRating}
                    />
                  </>
                ) : null}

                <View style={styles.divider} />

                <View style={styles.commentSection}>
                  <Text style={styles.commentLabel}>Leave a comment (optional)</Text>
                  <TextInput
                    style={styles.commentInput}
                    placeholder="How was your experience?"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    multiline
                    numberOfLines={3}
                    maxLength={400}
                    value={comment}
                    onChangeText={setComment}
                    returnKeyType="done"
                  />
                  <Text style={styles.charCount}>{comment.length}/400</Text>
                </View>

                <Pressable
                  style={[
                    styles.submitBtn,
                    !canSubmit && styles.submitBtnDisabled,
                  ]}
                  onPress={handleSubmit}
                  disabled={!canSubmit || submitting}
                  accessibilityRole="button"
                  accessibilityLabel="Submit feedback"
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.submitTxt}>Submit Feedback</Text>
                  )}
                </Pressable>

                {!canSubmit ? (
                  <Text style={styles.hintTxt}>
                    Please rate {!orderRating ? 'your order' : !restaurantRating ? 'the restaurant' : 'the driver'} to continue.
                  </Text>
                ) : null}
              </ScrollView>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const OrderFeedbackModal = memo(OrderFeedbackModalInner);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
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
    marginBottom: 18,
  },
  header: { marginBottom: 20 },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B7BDC9',
    marginTop: 4,
  },
  starSection: {
    paddingVertical: 16,
  },
  starLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  starIcon: { fontSize: 18 },
  starLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stars: {
    flexDirection: 'row',
    gap: 8,
  },
  starHint: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#FBBF24',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  commentSection: {
    paddingVertical: 16,
  },
  commentLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B7BDC9',
    marginBottom: 10,
  },
  commentInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    color: '#FFFFFF',
    minHeight: 88,
    textAlignVertical: 'top',
  },
  charCount: {
    marginTop: 6,
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'right',
  },
  submitBtn: {
    marginTop: 16,
    marginBottom: 8,
    minHeight: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C3AED',
  },
  submitBtnDisabled: {
    backgroundColor: 'rgba(124,58,237,0.35)',
  },
  submitTxt: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  hintTxt: {
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 12,
  },
  doneContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  doneEmoji: { fontSize: 52 },
  doneTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  doneBody: {
    fontSize: 15,
    color: '#B7BDC9',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
});
