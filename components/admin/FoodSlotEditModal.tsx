import { MaterialIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTextInput } from '../AppTextInput';
import {
  PROMOTION_BADGE_COLORS,
  PROMOTION_BADGE_OPTIONS,
  type PromotionBadgeValue,
} from '@/lib/promotionBadge';
import {
  FOOD_SHARE_DOLLAR_PROMO_TARGET_OPTIONS,
  type FoodShareDollarPromoTarget,
} from '@/lib/foodShareDollarPromo';
import {
  adminFoodShareAvailabilityStatus,
  availabilityDateInput,
  availabilityTimeInput,
  parseAvailabilityDateTime,
} from '@/lib/adminFoodShareAvailability';

const BG = '#F2F2F7';
const CARD = '#ffffff';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const PRIMARY = '#A855F7';
const SEPARATOR = 'rgba(60, 60, 67, 0.12)';
const FIELD_BG = '#F6F7F9';

export type FoodSlotDraft = {
  title: string;
  image: string;
  price: string;
  sharingPrice: string;
  deliveryShare: string;
  venueLocation: string;
  active: boolean;
  availableFromDate: string;
  availableFromTime: string;
  availableUntilDate: string;
  availableUntilTime: string;
  aiDescription: string;
  restaurantName: string;
  /** Multi-select campaign badges. Empty means "None". */
  promotionBadges: Exclude<PromotionBadgeValue, 'none'>[];
  /** Additive — defaults to delivery. */
  fulfillmentMode: 'delivery' | 'pickup';
  /** Flat $1 promotion for swipe participants. */
  promotion1DollarEnabled: boolean;
  promotion1DollarTarget: FoodShareDollarPromoTarget;
};

export type FoodSlotEditModalProps = {
  visible: boolean;
  slotLabel: string;
  draft: FoodSlotDraft;
  onChange: (patch: Partial<FoodSlotDraft>) => void;
  onClose: () => void;
  onSave: () => void;
  onReset: () => void;
  onPickImage: () => void;
  onGenerateAi: () => void;
  saving: boolean;
  uploading: boolean;
  aiBusy: boolean;
};

/** Presentation-only status copy for the editor badge. */
type AvailabilityBadge = 'Available' | 'Scheduled' | 'Unavailable';

type AvailabilityField = 'from' | 'until';
type PickerMode = 'date' | 'time';
type PickerTarget = { field: AvailabilityField; mode: PickerMode };

const MS_PER_MINUTE = 60_000;
const DEFAULT_WINDOW_MS = 4 * 60 * MS_PER_MINUTE;
const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const HOUR_LABELS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTE_LABELS = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, '0'),
);
const PERIOD_LABELS = ['AM', 'PM'] as const;

const FULFILLMENT_SEGMENTS = [
  { value: 'delivery' as const, label: 'Delivery', icon: 'local-shipping' as const },
  { value: 'pickup' as const, label: 'Pickup', icon: 'shopping-bag' as const },
] as const;

function safeParseAvailability(date: string, time: string): number | null {
  try {
    return parseAvailabilityDateTime(date, time);
  } catch {
    return null;
  }
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function formatDateChip(ms: number | null): string | null {
  if (ms == null) return null;
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTimeChip(ms: number | null): string | null {
  if (ms == null) return null;
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Splits `🔥 Most Ordered` into a leading glyph and its title. */
function splitBadgeLabel(label: string): { icon: string | null; title: string } {
  const trimmed = label.trim();
  const firstSpace = trimmed.indexOf(' ');
  if (firstSpace <= 0) return { icon: null, title: trimmed };
  const head = trimmed.slice(0, firstSpace);
  if (/[A-Za-z0-9]/.test(head)) return { icon: null, title: trimmed };
  return { icon: head, title: trimmed.slice(firstSpace + 1) };
}

type WheelProps = {
  items: readonly string[];
  index: number;
  onIndexChange: (index: number) => void;
  flex: number;
  label: string;
};

const Wheel = memo(function Wheel({
  items,
  index,
  onIndexChange,
  flex,
  label,
}: WheelProps) {
  const scroller = useRef<ScrollView>(null);
  const settled = useRef(index);
  const initial = useRef(index);

  useEffect(() => {
    if (settled.current === index) return;
    settled.current = index;
    scroller.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: true });
  }, [index]);

  const handleLayout = useCallback(() => {
    scroller.current?.scrollTo({
      y: initial.current * ITEM_HEIGHT,
      animated: false,
    });
  }, []);

  const handleSettle = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const raw = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
      const next = Math.min(Math.max(raw, 0), items.length - 1);
      settled.current = next;
      onIndexChange(next);
    },
    [items.length, onIndexChange],
  );

  const handlePress = useCallback(
    (target: number) => {
      settled.current = target;
      scroller.current?.scrollTo({ y: target * ITEM_HEIGHT, animated: true });
      onIndexChange(target);
    },
    [onIndexChange],
  );

  return (
    <ScrollView
      ref={scroller}
      style={{ flex }}
      accessibilityLabel={label}
      onLayout={handleLayout}
      snapToInterval={ITEM_HEIGHT}
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      onMomentumScrollEnd={handleSettle}
      contentContainerStyle={styles.wheelContent}
      nestedScrollEnabled
    >
      {items.map((item, i) => {
        const selected = i === index;
        return (
          <Pressable
            key={`${label}-${item}`}
            style={styles.wheelItem}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${label} ${item}`}
            onPress={() => handlePress(i)}
          >
            <Text
              style={[styles.wheelText, selected && styles.wheelTextSelected]}
              numberOfLines={1}
            >
              {item}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
});

type SectionProps = {
  title: string;
  badge?: React.ReactNode;
  footnote?: string;
  children: React.ReactNode;
};

const Section = memo(function Section({
  title,
  badge,
  footnote,
  children,
}: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        {badge}
      </View>
      <View style={styles.card}>{children}</View>
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
});

type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  divider?: boolean;
  keyboardType?: 'default' | 'decimal-pad';
  multiline?: boolean;
  align?: 'left' | 'right';
  prefix?: string;
};

const TextField = memo(function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  divider,
  keyboardType = 'default',
  multiline,
  align = 'left',
  prefix,
}: TextFieldProps) {
  const stacked = align === 'left';
  return (
    <View
      style={[
        stacked ? styles.stackedRow : styles.inlineRow,
        divider && styles.divider,
      ]}
    >
      <Text style={stacked ? styles.fieldLabel : styles.rowLabel}>{label}</Text>
      <View style={stacked ? styles.stackedInputWrap : styles.inlineInputWrap}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <AppTextInput
          style={[
            styles.input,
            stacked ? styles.inputStacked : styles.inputInline,
            multiline && styles.inputMulti,
          ]}
          placeholder={placeholder}
          placeholderTextColor={MUTED}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          multiline={multiline}
          textAlign={align}
          accessibilityLabel={label}
        />
      </View>
    </View>
  );
});

type BadgeTileProps = {
  value: PromotionBadgeValue;
  radioLabel: string;
  selected: boolean;
  onToggle: (value: PromotionBadgeValue) => void;
};

const BadgeTile = memo(function BadgeTile({
  value,
  radioLabel,
  selected,
  onToggle,
}: BadgeTileProps) {
  const progress = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const { icon, title } = useMemo(
    () => splitBadgeLabel(radioLabel),
    [radioLabel],
  );
  const accent = value === 'none' ? MUTED : PROMOTION_BADGE_COLORS[value];

  useEffect(() => {
    Animated.timing(progress, {
      toValue: selected ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, selected]);

  const handlePress = useCallback(() => onToggle(value), [onToggle, value]);

  return (
    <Pressable
      accessibilityRole={value === 'none' ? 'button' : 'checkbox'}
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={title}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.tile,
        selected && { borderColor: accent, backgroundColor: `${accent}14` },
        pressed && styles.tilePressed,
      ]}
    >
      <View style={styles.tileHead}>
        <View style={[styles.tileIcon, selected && { borderColor: accent }]}>
          {icon ? (
            <Text style={styles.tileIconGlyph}>{icon}</Text>
          ) : (
            <MaterialIcons name="block" size={16} color={MUTED} />
          )}
        </View>
        <Animated.View
          style={[
            styles.tileCheck,
            {
              backgroundColor: accent,
              opacity: progress,
              transform: [
                {
                  scale: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.6, 1],
                  }),
                },
              ],
            },
          ]}
          pointerEvents="none"
        >
          <MaterialIcons name="check" size={13} color="#ffffff" />
        </Animated.View>
      </View>
      <Text
        style={[styles.tileTitle, selected && styles.tileTitleSelected]}
        numberOfLines={2}
      >
        {title}
      </Text>
    </Pressable>
  );
});

type SegmentedProps = {
  value: FoodSlotDraft['fulfillmentMode'];
  onSelect: (value: FoodSlotDraft['fulfillmentMode']) => void;
};

const FulfillmentSegments = memo(function FulfillmentSegments({
  value,
  onSelect,
}: SegmentedProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const selectedIndex = value === 'pickup' ? 1 : 0;
  const slide = useRef(new Animated.Value(selectedIndex)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: selectedIndex,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [selectedIndex, slide]);

  const segmentWidth =
    trackWidth > 0 ? (trackWidth - 6) / FULFILLMENT_SEGMENTS.length : 0;

  return (
    <View
      style={styles.segmentTrack}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          style={[
            styles.segmentThumb,
            {
              width: segmentWidth,
              transform: [
                {
                  translateX: slide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, segmentWidth],
                  }),
                },
              ],
            },
          ]}
          pointerEvents="none"
        />
      ) : null}
      {FULFILLMENT_SEGMENTS.map((segment) => {
        const selected = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={segment.label}
            onPress={() => onSelect(segment.value)}
            style={styles.segment}
          >
            <MaterialIcons
              name={segment.icon}
              size={17}
              color={selected ? TEXT : MUTED}
            />
            <Text
              style={[
                styles.segmentText,
                selected && styles.segmentTextSelected,
              ]}
              numberOfLines={1}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

type WindowRowProps = {
  label: string;
  hint: string;
  ms: number | null;
  divider?: boolean;
  onOpen: (mode: PickerMode) => void;
};

const WindowRow = memo(function WindowRow({
  label,
  hint,
  ms,
  divider,
  onOpen,
}: WindowRowProps) {
  const dateText = formatDateChip(ms);
  const timeText = formatTimeChip(ms);
  return (
    <View style={[styles.windowRow, divider && styles.divider]}>
      <View style={styles.windowHead}>
        <Text style={styles.rowLabel}>{label}</Text>
        {ms == null ? <Text style={styles.windowHint}>{hint}</Text> : null}
      </View>
      <View style={styles.chipRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} date`}
          accessibilityValue={{ text: dateText ?? hint }}
          onPress={() => onOpen('date')}
          style={({ pressed }) => [
            styles.chip,
            styles.chipDate,
            pressed && styles.chipPressed,
          ]}
        >
          <MaterialIcons name="event" size={15} color={MUTED} />
          <Text
            style={[styles.chipText, !dateText && styles.chipPlaceholder]}
            numberOfLines={1}
          >
            {dateText ?? 'Set date'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} time`}
          accessibilityValue={{ text: timeText ?? hint }}
          onPress={() => onOpen('time')}
          style={({ pressed }) => [
            styles.chip,
            styles.chipTime,
            pressed && styles.chipPressed,
          ]}
        >
          <MaterialIcons name="schedule" size={15} color={MUTED} />
          <Text
            style={[styles.chipText, !timeText && styles.chipPlaceholder]}
            numberOfLines={1}
          >
            {timeText ?? 'Set time'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

export function FoodSlotEditModal({
  visible,
  slotLabel,
  draft,
  onChange,
  onClose,
  onSave,
  onReset,
  onPickImage,
  onGenerateAi,
  saving,
  uploading,
  aiBusy,
}: FoodSlotEditModalProps) {
  const insets = useSafeAreaInsets();
  const [availabilityNow, setAvailabilityNow] = useState(Date.now());
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [pickerMs, setPickerMs] = useState(() => Date.now());

  /** Stable patch dispatcher so memoized rows keep their identity. */
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const patchDraft = useCallback((patch: Partial<FoodSlotDraft>) => {
    onChangeRef.current(patch);
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    setAvailabilityNow(Date.now());
    const timer = setInterval(() => setAvailabilityNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [visible]);

  useEffect(() => {
    if (!visible) setPicker(null);
  }, [visible]);

  const selectedBadges = draft.promotionBadges;
  const selectedBadgesRef = useRef(selectedBadges);
  useEffect(() => {
    selectedBadgesRef.current = selectedBadges;
  }, [selectedBadges]);

  const fromMs = safeParseAvailability(
    draft.availableFromDate,
    draft.availableFromTime,
  );
  const untilMs = safeParseAvailability(
    draft.availableUntilDate,
    draft.availableUntilTime,
  );

  const availabilityBadge = useMemo<AvailabilityBadge>(() => {
    const status = adminFoodShareAvailabilityStatus(
      { active: draft.active, availableFromMs: fromMs, availableUntilMs: untilMs },
      availabilityNow,
    );
    if (status === 'live') return 'Available';
    if (status === 'scheduled') return 'Scheduled';
    return 'Unavailable';
  }, [availabilityNow, draft.active, fromMs, untilMs]);

  const openPicker = useCallback(
    (field: AvailabilityField, mode: PickerMode) => {
      const existing = field === 'from' ? fromMs : untilMs;
      const fallback =
        field === 'from'
          ? Date.now()
          : (fromMs ?? Date.now()) + DEFAULT_WINDOW_MS;
      const base = existing ?? fallback;
      setPickerMs(Math.floor(base / MS_PER_MINUTE) * MS_PER_MINUTE);
      setPicker({ field, mode });
    },
    [fromMs, untilMs],
  );

  const openFrom = useCallback(
    (mode: PickerMode) => openPicker('from', mode),
    [openPicker],
  );
  const openUntil = useCallback(
    (mode: PickerMode) => openPicker('until', mode),
    [openPicker],
  );

  const closePicker = useCallback(() => setPicker(null), []);

  const commitPicker = useCallback(() => {
    if (!picker) return;
    const date = availabilityDateInput(pickerMs);
    const time = availabilityTimeInput(pickerMs);
    patchDraft(
      picker.field === 'from'
        ? { availableFromDate: date, availableFromTime: time }
        : { availableUntilDate: date, availableUntilTime: time },
    );
    setPicker(null);
  }, [patchDraft, picker, pickerMs]);

  const clearPickerField = useCallback(() => {
    if (!picker) return;
    patchDraft(
      picker.field === 'from'
        ? { availableFromDate: '', availableFromTime: '' }
        : { availableUntilDate: '', availableUntilTime: '' },
    );
    setPicker(null);
  }, [patchDraft, picker]);

  const setActive = useCallback(
    (active: boolean) => patchDraft({ active }),
    [patchDraft],
  );
  const setFulfillment = useCallback(
    (fulfillmentMode: FoodSlotDraft['fulfillmentMode']) =>
      patchDraft({ fulfillmentMode }),
    [patchDraft],
  );
  const setPromotion1DollarEnabled = useCallback(
    (promotion1DollarEnabled: boolean) =>
      patchDraft({
        promotion1DollarEnabled,
        promotion1DollarTarget: promotion1DollarEnabled
          ? draft.promotion1DollarTarget || 'both'
          : draft.promotion1DollarTarget,
      }),
    [patchDraft, draft.promotion1DollarTarget],
  );
  const setPromotion1DollarTarget = useCallback(
    (promotion1DollarTarget: FoodShareDollarPromoTarget) =>
      patchDraft({ promotion1DollarTarget }),
    [patchDraft],
  );
  const togglePromotionBadge = useCallback(
    (value: PromotionBadgeValue) => {
      if (value === 'none') {
        patchDraft({ promotionBadges: [] });
        return;
      }
      const current = selectedBadgesRef.current;
      patchDraft({
        promotionBadges: current.includes(value)
          ? current.filter((badge) => badge !== value)
          : [...current, value],
      });
    },
    [patchDraft],
  );
  const setTitle = useCallback(
    (title: string) => patchDraft({ title }),
    [patchDraft],
  );
  const setRestaurantName = useCallback(
    (restaurantName: string) => patchDraft({ restaurantName }),
    [patchDraft],
  );
  const setPrice = useCallback(
    (price: string) => patchDraft({ price }),
    [patchDraft],
  );
  const setSharingPrice = useCallback(
    (sharingPrice: string) => patchDraft({ sharingPrice }),
    [patchDraft],
  );
  const setDeliveryShare = useCallback(
    (deliveryShare: string) => patchDraft({ deliveryShare }),
    [patchDraft],
  );
  const setVenueLocation = useCallback(
    (venueLocation: string) => patchDraft({ venueLocation }),
    [patchDraft],
  );
  const setAiDescription = useCallback(
    (aiDescription: string) => patchDraft({ aiDescription }),
    [patchDraft],
  );

  const pickerDate = new Date(pickerMs);
  const pickerYear = pickerDate.getFullYear();
  const pickerMonth = pickerDate.getMonth();
  const pickerDay = pickerDate.getDate();
  const pickerMinute = pickerDate.getMinutes();

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    const start = Math.min(current - 1, pickerYear);
    const end = Math.max(current + 5, pickerYear);
    const out: string[] = [];
    for (let year = start; year <= end; year += 1) out.push(String(year));
    return out;
  }, [pickerYear]);

  const dayLabels = useMemo(() => {
    const total = daysInMonth(pickerYear, pickerMonth);
    return Array.from({ length: total }, (_, i) => String(i + 1));
  }, [pickerMonth, pickerYear]);

  const setPickerParts = useCallback(
    (parts: {
      year?: number;
      month?: number;
      day?: number;
      hours?: number;
      minutes?: number;
    }) => {
      setPickerMs((prev) => {
        const base = new Date(prev);
        const year = parts.year ?? base.getFullYear();
        const month = parts.month ?? base.getMonth();
        const day = Math.min(
          parts.day ?? base.getDate(),
          daysInMonth(year, month),
        );
        const hours = parts.hours ?? base.getHours();
        const minutes = parts.minutes ?? base.getMinutes();
        return new Date(year, month, day, hours, minutes, 0, 0).getTime();
      });
    },
    [],
  );

  const hours24 = pickerDate.getHours();
  const periodIndex = hours24 >= 12 ? 1 : 0;
  const hourIndex = (hours24 + 11) % 12;

  const onMonthChange = useCallback(
    (index: number) => setPickerParts({ month: index }),
    [setPickerParts],
  );
  const onDayChange = useCallback(
    (index: number) => setPickerParts({ day: index + 1 }),
    [setPickerParts],
  );
  const onYearChange = useCallback(
    (index: number) => setPickerParts({ year: Number(years[index]) }),
    [setPickerParts, years],
  );
  const onHourChange = useCallback(
    (index: number) =>
      setPickerParts({ hours: (index + 1) % 12 + (periodIndex === 1 ? 12 : 0) }),
    [periodIndex, setPickerParts],
  );
  const onMinuteChange = useCallback(
    (index: number) => setPickerParts({ minutes: index }),
    [setPickerParts],
  );
  const onPeriodChange = useCallback(
    (index: number) =>
      setPickerParts({ hours: (hours24 % 12) + (index === 1 ? 12 : 0) }),
    [hours24, setPickerParts],
  );

  const pickerTitle = picker
    ? `${picker.field === 'from' ? 'Available From' : 'Available Until'} · ${
        picker.mode === 'date' ? 'Date' : 'Time'
      }`
    : '';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {slotLabel}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close editor"
            >
              <Text style={styles.close}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetBody}
            showsVerticalScrollIndicator={false}
          >
            <Section
              title="Availability"
              badge={
                <View
                  style={[
                    styles.statusBadge,
                    availabilityBadge === 'Available' && styles.statusAvailable,
                    availabilityBadge === 'Scheduled' && styles.statusScheduled,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      availabilityBadge === 'Available' &&
                        styles.statusTextAvailable,
                      availabilityBadge === 'Scheduled' &&
                        styles.statusTextScheduled,
                    ]}
                  >
                    {availabilityBadge}
                  </Text>
                </View>
              }
              footnote="The card appears in Swipe only while active and inside this window."
            >
              <View style={styles.switchRow}>
                <View style={styles.windowHead}>
                  <Text style={styles.rowLabel}>Active</Text>
                  <Text style={styles.windowHint}>
                    Master switch for this card
                  </Text>
                </View>
                <Switch
                  value={draft.active}
                  onValueChange={setActive}
                  trackColor={{
                    false: 'rgba(148, 163, 184, 0.45)',
                    true: 'rgba(22, 163, 74, 0.45)',
                  }}
                  thumbColor={draft.active ? PRIMARY : '#f1f5f9'}
                  accessibilityLabel="Active"
                />
              </View>
              <WindowRow
                label="Available From"
                hint="Starts immediately"
                ms={fromMs}
                divider
                onOpen={openFrom}
              />
              <WindowRow
                label="Available Until"
                hint="No end time"
                ms={untilMs}
                divider
                onOpen={openUntil}
              />
            </Section>

            <Section
              title="Fulfillment"
              footnote="How members receive this shared order."
            >
              <View style={styles.plainRow}>
                <FulfillmentSegments
                  value={draft.fulfillmentMode}
                  onSelect={setFulfillment}
                />
              </View>
            </Section>

            <Section
              title="Promotion Badge"
              badge={
                selectedBadges.length > 0 ? (
                  <View style={[styles.statusBadge, styles.statusScheduled]}>
                    <Text style={[styles.statusText, styles.statusTextScheduled]}>
                      {`${selectedBadges.length} selected`}
                    </Text>
                  </View>
                ) : undefined
              }
              footnote="Pick any combination. Swipe cards show the first 3 as chips."
            >
              <View style={styles.grid}>
                {PROMOTION_BADGE_OPTIONS.map((opt) => (
                  <BadgeTile
                    key={opt.value}
                    value={opt.value}
                    radioLabel={opt.radioLabel}
                    selected={
                      opt.value === 'none'
                        ? selectedBadges.length === 0
                        : selectedBadges.includes(opt.value)
                    }
                    onToggle={togglePromotionBadge}
                  />
                ))}
              </View>
            </Section>

            <Section
              title="Swipe HalfOrder Card"
              footnote="Flat $1 checkout promotion for matched swipe participants."
            >
              <View style={styles.switchRow}>
                <View style={styles.windowHead}>
                  <Text style={styles.rowLabel}>Promotion - $1</Text>
                  <Text style={styles.windowHint}>
                    Subtract CA$1.00 for selected participants at payment
                  </Text>
                </View>
                <Switch
                  value={draft.promotion1DollarEnabled === true}
                  onValueChange={setPromotion1DollarEnabled}
                  trackColor={{
                    false: 'rgba(148, 163, 184, 0.45)',
                    true: 'rgba(168, 85, 247, 0.45)',
                  }}
                  thumbColor={
                    draft.promotion1DollarEnabled ? PRIMARY : '#f1f5f9'
                  }
                  accessibilityLabel="Promotion $1"
                />
              </View>
              {draft.promotion1DollarEnabled ? (
                <View style={styles.plainRow}>
                  <Text style={[styles.rowLabel, { marginBottom: 10 }]}>
                    Apply to
                  </Text>
                  <View style={styles.fulfillmentRow}>
                    {FOOD_SHARE_DOLLAR_PROMO_TARGET_OPTIONS.map((opt) => {
                      const selected =
                        draft.promotion1DollarTarget === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[
                            styles.fulfillmentChip,
                            selected && styles.fulfillmentChipSelected,
                          ]}
                          onPress={() => setPromotion1DollarTarget(opt.value)}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={opt.label}
                        >
                          <Text
                            style={[
                              styles.fulfillmentChipText,
                              selected && styles.fulfillmentChipTextSelected,
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </Section>

            <Section title="Pricing" footnote="Amounts in CAD.">
              <TextField
                label="Total price"
                value={draft.price}
                onChangeText={setPrice}
                placeholder="0.00"
                keyboardType="decimal-pad"
                align="right"
                prefix="$"
              />
              <TextField
                label="Shared food price"
                value={draft.sharingPrice}
                onChangeText={setSharingPrice}
                placeholder="0.00"
                keyboardType="decimal-pad"
                align="right"
                prefix="$"
                divider
              />
              <TextField
                label="Delivery share"
                value={draft.deliveryShare}
                onChangeText={setDeliveryShare}
                placeholder="0.00"
                keyboardType="decimal-pad"
                align="right"
                prefix="$"
                divider
              />
            </Section>

            <Section title="Photo">
              <View style={styles.plainRow}>
                {draft.image ? (
                  <ExpoImage
                    source={{ uri: draft.image }}
                    style={styles.preview}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.previewPlaceholder}>
                    <MaterialIcons
                      name="photo-camera"
                      size={22}
                      color={MUTED}
                    />
                    <Text style={styles.previewPlaceholderText}>
                      No image selected
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.uploadBtn, uploading && styles.btnDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    draft.image ? 'Change image' : 'Upload image'
                  }
                  onPress={() => {
                    console.log('[IMAGE PICK] upload button pressed', {
                      currentImage: draft.image,
                    });
                    onPickImage();
                  }}
                  disabled={uploading}
                >
                  {uploading ? (
                    <ActivityIndicator color={CARD} />
                  ) : (
                    <Text style={styles.uploadBtnText}>
                      {draft.image ? 'Change image' : 'Upload image'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </Section>

            <Section title="Details">
              <TextField
                label="Title"
                value={draft.title}
                onChangeText={setTitle}
                placeholder="Title"
              />
              <TextField
                label="Restaurant / venue label"
                value={draft.restaurantName}
                onChangeText={setRestaurantName}
                placeholder="Restaurant name"
                divider
              />
              <TextField
                label="Location (optional)"
                value={draft.venueLocation}
                onChangeText={setVenueLocation}
                placeholder="Venue location"
                divider
              />
              <View style={[styles.stackedRow, styles.divider]}>
                <Text style={styles.fieldLabel}>AI description (optional)</Text>
                <AppTextInput
                  style={[styles.input, styles.inputStacked, styles.inputMulti]}
                  placeholder="Description"
                  placeholderTextColor={MUTED}
                  value={draft.aiDescription}
                  onChangeText={setAiDescription}
                  accessibilityLabel="AI description"
                  multiline
                />
                <TouchableOpacity
                  style={[styles.secondaryBtn, aiBusy && styles.btnDisabled]}
                  disabled={aiBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Generate AI description"
                  onPress={onGenerateAi}
                >
                  <MaterialIcons
                    name="auto-awesome"
                    size={16}
                    color="#4f46e5"
                  />
                  <Text style={styles.secondaryBtnText}>
                    {aiBusy ? 'Generating…' : 'Generate AI description'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Section>
          </ScrollView>

          <View
            style={[
              styles.footer,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            <TouchableOpacity
              style={styles.ghostBtn}
              onPress={onReset}
              accessibilityRole="button"
              accessibilityLabel="Reset"
            >
              <Text style={styles.ghostBtnText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.saveBtn,
                (saving || uploading) && styles.btnDisabled,
              ]}
              disabled={saving || uploading}
              accessibilityRole="button"
              accessibilityLabel="Save"
              onPress={() => {
                console.log('[SAVE] pressed');
                console.log('[SAVE] formData', draft);
                onSave();
              }}
            >
              {saving ? (
                <ActivityIndicator color={CARD} />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          {picker ? (
            <View style={styles.pickerOverlay}>
              <Pressable
                style={styles.pickerBackdrop}
                accessibilityRole="button"
                accessibilityLabel="Dismiss picker"
                onPress={closePicker}
              />
              <View
                style={[
                  styles.pickerSheet,
                  { paddingBottom: Math.max(insets.bottom, 14) },
                ]}
              >
                <View style={styles.pickerHeader}>
                  <TouchableOpacity
                    onPress={closePicker}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                  >
                    <Text style={styles.pickerCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.pickerTitle} numberOfLines={1}>
                    {pickerTitle}
                  </Text>
                  <TouchableOpacity
                    onPress={commitPicker}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Done"
                  >
                    <Text style={styles.pickerDone}>Done</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.wheelRow}>
                  <View style={styles.wheelHighlight} pointerEvents="none" />
                  {picker.mode === 'date' ? (
                    <>
                      <Wheel
                        items={MONTH_LABELS}
                        index={pickerMonth}
                        onIndexChange={onMonthChange}
                        flex={1.5}
                        label="Month"
                      />
                      <Wheel
                        items={dayLabels}
                        index={pickerDay - 1}
                        onIndexChange={onDayChange}
                        flex={1}
                        label="Day"
                      />
                      <Wheel
                        items={years}
                        index={Math.max(years.indexOf(String(pickerYear)), 0)}
                        onIndexChange={onYearChange}
                        flex={1.1}
                        label="Year"
                      />
                    </>
                  ) : (
                    <>
                      <Wheel
                        items={HOUR_LABELS}
                        index={hourIndex}
                        onIndexChange={onHourChange}
                        flex={1}
                        label="Hour"
                      />
                      <Wheel
                        items={MINUTE_LABELS}
                        index={pickerMinute}
                        onIndexChange={onMinuteChange}
                        flex={1}
                        label="Minute"
                      />
                      <Wheel
                        items={PERIOD_LABELS}
                        index={periodIndex}
                        onIndexChange={onPeriodChange}
                        flex={1}
                        label="AM or PM"
                      />
                    </>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.pickerClear}
                  onPress={clearPickerField}
                  accessibilityRole="button"
                  accessibilityLabel="Clear this value"
                >
                  <Text style={styles.pickerClearText}>
                    {picker.field === 'from'
                      ? 'Clear · start immediately'
                      : 'Clear · no end time'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheet: {
    flex: 1,
    backgroundColor: BG,
    paddingTop: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SEPARATOR,
  },
  sheetTitle: { flex: 1, color: TEXT, fontSize: 20, fontWeight: '700' },
  close: { color: PRIMARY, fontWeight: '600', fontSize: 16 },
  sheetBody: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 28 },

  section: { marginBottom: 26 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 6,
    marginBottom: 8,
  },
  sectionTitle: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    overflow: 'hidden',
  },
  footnote: {
    marginTop: 7,
    paddingHorizontal: 6,
    color: MUTED,
    fontSize: 12,
    lineHeight: 17,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SEPARATOR,
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(100, 116, 139, 0.12)',
  },
  statusAvailable: { backgroundColor: 'rgba(22, 163, 74, 0.13)' },
  statusScheduled: { backgroundColor: 'rgba(59, 130, 246, 0.13)' },
  statusText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  statusTextAvailable: { color: '#15803d' },
  statusTextScheduled: { color: '#1d4ed8' },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  plainRow: { padding: 16 },
  rowLabel: { color: TEXT, fontSize: 16, fontWeight: '600' },
  windowRow: { paddingHorizontal: 16, paddingVertical: 14 },
  windowHead: { flexShrink: 1, gap: 2 },
  windowHint: { color: MUTED, fontSize: 12 },
  chipRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: FIELD_BG,
    borderWidth: 1,
    borderColor: SEPARATOR,
  },
  chipDate: { flex: 1.5 },
  chipTime: { flex: 1 },
  chipPressed: { backgroundColor: 'rgba(15, 23, 42, 0.06)' },
  chipText: { color: TEXT, fontSize: 15, fontWeight: '600' },
  chipPlaceholder: { color: MUTED, fontWeight: '500' },

  segmentTrack: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(118, 118, 128, 0.12)',
  },
  segmentThumb: {
    position: 'absolute',
    top: 3,
    left: 3,
    bottom: 3,
    borderRadius: 9,
    backgroundColor: CARD,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 8,
  },
  segmentText: { color: MUTED, fontSize: 15, fontWeight: '600' },
  segmentTextSelected: { color: TEXT, fontWeight: '700' },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    padding: 12,
  },
  tile: {
    width: '48.5%',
    minHeight: 84,
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SEPARATOR,
    backgroundColor: FIELD_BG,
  },
  tilePressed: { opacity: 0.75 },
  tileHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tileIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: SEPARATOR,
  },
  tileIconGlyph: { fontSize: 15 },
  tileCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: {
    marginTop: 10,
    color: MUTED,
    fontSize: 14,
    fontWeight: '600',
  },
  tileTitleSelected: { color: TEXT, fontWeight: '700' },

  stackedRow: { paddingHorizontal: 16, paddingVertical: 12 },
  stackedInputWrap: { flexDirection: 'row', alignItems: 'center' },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
    minHeight: 52,
  },
  inlineInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  prefix: { color: MUTED, fontSize: 16, fontWeight: '600' },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: MUTED,
    marginBottom: 7,
  },
  input: {
    color: TEXT,
    fontSize: 16,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
  },
  inputStacked: {
    flex: 1,
    backgroundColor: FIELD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SEPARATOR,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  inputInline: { minWidth: 90, paddingVertical: 10 },
  inputMulti: { minHeight: 92, textAlignVertical: 'top' },

  preview: {
    width: '100%',
    height: 168,
    borderRadius: 14,
    marginBottom: 12,
    backgroundColor: '#E2E5EB',
  },
  previewPlaceholder: {
    width: '100%',
    height: 168,
    borderRadius: 14,
    marginBottom: 12,
    gap: 8,
    backgroundColor: FIELD_BG,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: SEPARATOR,
    borderStyle: 'dashed',
  },
  previewPlaceholderText: {
    color: MUTED,
    fontSize: 13,
    fontWeight: '600',
  },
  uploadBtn: {
    backgroundColor: PRIMARY,
    minHeight: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBtnText: { color: CARD, fontWeight: '700', fontSize: 15 },

  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 12,
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.22)',
  },
  secondaryBtnText: { color: '#4f46e5', fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.55 },

  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: CARD,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SEPARATOR,
  },
  ghostBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: { color: MUTED, fontWeight: '700', fontSize: 16 },
  saveBtn: {
    flex: 1.4,
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: CARD, fontWeight: '700', fontSize: 16 },

  pickerOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.32)',
  },
  pickerSheet: {
    backgroundColor: '#F7F8FA',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 6,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SEPARATOR,
  },
  pickerTitle: {
    flex: 1,
    textAlign: 'center',
    color: TEXT,
    fontSize: 15,
    fontWeight: '700',
  },
  pickerCancel: { color: MUTED, fontSize: 16, fontWeight: '600' },
  pickerDone: { color: PRIMARY, fontSize: 16, fontWeight: '700' },
  wheelRow: {
    flexDirection: 'row',
    height: WHEEL_HEIGHT,
    paddingHorizontal: 12,
  },
  wheelHighlight: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: (WHEEL_HEIGHT - ITEM_HEIGHT) / 2,
    height: ITEM_HEIGHT,
    borderRadius: 10,
    backgroundColor: 'rgba(118, 118, 128, 0.12)',
  },
  wheelContent: {
    paddingVertical: (WHEEL_HEIGHT - ITEM_HEIGHT) / 2,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  wheelText: { color: MUTED, fontSize: 17 },
  wheelTextSelected: { color: TEXT, fontSize: 18, fontWeight: '600' },
  pickerClear: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    marginTop: 6,
    marginHorizontal: 16,
    borderRadius: 13,
    backgroundColor: 'rgba(118, 118, 128, 0.1)',
  },
  pickerClearText: { color: MUTED, fontSize: 14, fontWeight: '600' },
});
