import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Modal, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { useThemeColors } from '@/hooks/useThemeColors';
import { radius, spacing } from '@/theme';

const MIN = 1;
const MAX = 60;
const ITEM_H = 48;
const VISIBLE = 5; // odd, so there's a clear center row
const PAD = ITEM_H * ((VISIBLE - 1) / 2);
const VALUES = Array.from({ length: MAX - MIN + 1 }, (_, i) => i + MIN);

/** One wheel number whose size, opacity, and tilt flow with its distance from the centre. */
function WheelItem({
  value,
  index,
  scrollY,
  color,
  onPress,
  accessibilityLabel,
}: {
  value: number;
  index: number;
  scrollY: SharedValue<number>;
  color: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const style = useAnimatedStyle(() => {
    const pos = index - scrollY.value / ITEM_H; // 0 = perfectly centred
    const abs = Math.abs(pos);
    return {
      opacity: interpolate(abs, [0, 1, 2, 3], [1, 0.55, 0.28, 0.12], Extrapolation.CLAMP),
      transform: [
        { perspective: 700 },
        { rotateX: `${interpolate(pos, [-2.6, 0, 2.6], [62, 0, -62], Extrapolation.CLAMP)}deg` },
        { scale: interpolate(abs, [0, 1, 2], [1, 0.82, 0.66], Extrapolation.CLAMP) },
      ],
    };
  });
  return (
    <Pressable
      style={styles.item}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}>
      <Animated.View style={style}>
        <AppText variant="title" color={color} style={styles.itemText}>
          {value}
        </AppText>
      </Animated.View>
    </Pressable>
  );
}

/** An iOS-style scrolling wheel for the session length, in a bottom sheet. */
export function DurationPicker({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: number;
  onChange: (n: number) => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useSharedValue((value - MIN) * ITEM_H);
  const lastIdx = useSharedValue(value - MIN);
  const [current, setCurrent] = useState(value);

  // Snap to the current value whenever the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setCurrent(value);
    lastIdx.value = value - MIN;
    scrollY.value = (value - MIN) * ITEM_H;
    const id = setTimeout(() => scrollRef.current?.scrollTo({ y: (value - MIN) * ITEM_H, animated: false }), 0);
    return () => clearTimeout(id);
  }, [visible, value, scrollY, lastIdx]);

  // A soft "tick" + live value as the centred number changes (like an iOS wheel).
  const onTick = (idx: number) => {
    if (idx >= 0 && idx < VALUES.length) {
      setCurrent(VALUES[idx]);
      Haptics.selectionAsync().catch(() => {});
    }
  };

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      const idx = Math.round(e.contentOffset.y / ITEM_H);
      if (idx !== lastIdx.value) {
        lastIdx.value = idx;
        runOnJS(onTick)(idx);
      }
    },
  });

  const onSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.max(0, Math.min(VALUES.length - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM_H)));
    setCurrent(VALUES[idx]);
    onChange(VALUES[idx]);
  };

  const selectValue = (v: number) => {
    setCurrent(v);
    lastIdx.value = v - MIN;
    scrollRef.current?.scrollTo({ y: (v - MIN) * ITEM_H, animated: true });
    Haptics.selectionAsync().catch(() => {});
  };

  const commitAndClose = () => {
    onChange(current);
    onClose();
  };

  const glass = isLiquidGlassAvailable();
  const sheetContent = (
    <>
      <View style={styles.header}>
        <AppText variant="heading">Session length · {current} min</AppText>
        <Pressable onPress={commitAndClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Done">
          <AppText variant="body" color={colors.accent}>
            Done
          </AppText>
        </Pressable>
      </View>

      <View style={styles.pickerWrap}>
        <View style={[styles.band, { backgroundColor: colors.surfaceMuted }]} pointerEvents="none" />
        <Animated.ScrollView
          ref={scrollRef as never}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_H}
          decelerationRate="fast"
          onScroll={onScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={onSettle}
          onScrollEndDrag={onSettle}
          contentContainerStyle={{ paddingVertical: PAD }}>
          {VALUES.map((v, i) => (
            <WheelItem
              key={v}
              value={v}
              index={i}
              scrollY={scrollY}
              color={colors.text}
              onPress={() => selectValue(v)}
              accessibilityLabel={`${v} minute${v === 1 ? '' : 's'}`}
            />
          ))}
        </Animated.ScrollView>
        <AppText variant="body" muted style={styles.unit}>
          min
        </AppText>
      </View>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={commitAndClose} accessibilityLabel="Close" />
        {glass ? (
          <GlassView glassEffectStyle="regular" style={[styles.sheet, styles.glassSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            {sheetContent}
          </GlassView>
        ) : (
          <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.lg }]}>
            {sheetContent}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  glassSheet: { overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  pickerWrap: { height: ITEM_H * VISIBLE, justifyContent: 'center' },
  band: {
    position: 'absolute',
    top: PAD,
    left: '18%',
    right: '18%',
    height: ITEM_H,
    borderRadius: radius.md,
  },
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 30, fontWeight: '300' },
  unit: { position: 'absolute', alignSelf: 'center', left: '62%', top: PAD + (ITEM_H - 22) / 2 },
});
