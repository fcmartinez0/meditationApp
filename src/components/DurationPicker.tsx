import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
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
  const lastIdx = useRef(value - MIN);
  const [current, setCurrent] = useState(value);

  // Snap to the current value whenever the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setCurrent(value);
    lastIdx.current = value - MIN;
    const id = setTimeout(
      () => scrollRef.current?.scrollTo({ y: (value - MIN) * ITEM_H, animated: false }),
      0,
    );
    return () => clearTimeout(id);
  }, [visible, value]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    if (idx !== lastIdx.current && idx >= 0 && idx < VALUES.length) {
      lastIdx.current = idx;
      setCurrent(VALUES[idx]);
      Haptics.selectionAsync().catch(() => {}); // tick like an iOS wheel
    }
  };

  const onSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.max(0, Math.min(VALUES.length - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM_H)));
    setCurrent(VALUES[idx]);
    onChange(VALUES[idx]);
  };

  // Tap a number to pick it — reliable on web/desktop where drag-scroll is finicky.
  const selectValue = (v: number) => {
    setCurrent(v);
    lastIdx.current = v - MIN;
    scrollRef.current?.scrollTo({ y: (v - MIN) * ITEM_H, animated: true });
    Haptics.selectionAsync().catch(() => {});
  };

  // Always commit whatever's centered when the sheet is dismissed.
  const commitAndClose = () => {
    onChange(current);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={commitAndClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.lg }]}>
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
            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              snapToInterval={ITEM_H}
              decelerationRate="fast"
              onScroll={onScroll}
              scrollEventThrottle={16}
              onMomentumScrollEnd={onSettle}
              onScrollEndDrag={onSettle}
              contentContainerStyle={{ paddingVertical: PAD }}>
              {VALUES.map((v) => (
                <Pressable
                  key={v}
                  style={styles.item}
                  onPress={() => selectValue(v)}
                  accessibilityRole="button"
                  accessibilityLabel={`${v} minute${v === 1 ? '' : 's'}`}
                  accessibilityState={{ selected: v === current }}>
                  <AppText
                    variant="title"
                    color={v === current ? colors.text : colors.textSecondary}
                    style={v === current ? styles.itemActive : styles.itemInactive}>
                    {v}
                  </AppText>
                </Pressable>
              ))}
            </ScrollView>
            <AppText variant="body" muted style={styles.unit}>
              min
            </AppText>
          </View>
        </View>
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
    left: '20%',
    right: '20%',
    height: ITEM_H,
    borderRadius: radius.md,
  },
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  itemActive: { fontSize: 28, opacity: 1 },
  itemInactive: { fontSize: 22, opacity: 0.35 },
  unit: { position: 'absolute', alignSelf: 'center', left: '62%', top: PAD + (ITEM_H - 22) / 2 },
});
