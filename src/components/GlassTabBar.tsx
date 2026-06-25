import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ReactNode } from 'react';

import { AppText } from '@/components/AppText';
import { useThemeColors } from '@/hooks/useThemeColors';
import { withAlpha } from '@/theme/categories';

// Minimal shape of the tab-bar props expo-router/React Navigation passes — typed
// locally so we don't depend on the (non-hoisted) @react-navigation/bottom-tabs.
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<
    string,
    {
      options: {
        title?: string;
        tabBarIcon?: (p: { focused: boolean; color: string; size: number }) => ReactNode;
      };
    }
  >;
  navigation: {
    emit: (e: { type: 'tabPress'; target?: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
}

const BAR_HEIGHT = 60;
const PAD = 6; // gap between the sliding pill and the bar edge
const MARGIN = 20; // floating inset from the screen sides

/**
 * A floating tab bar that uses Apple's Liquid Glass material (iOS 26+) with a
 * selection pill that springs between tabs. Falls back to a solid surface bar on
 * platforms without Liquid Glass. The bar sits in the layout flow (reserves its
 * own height), so screen content is never hidden behind it.
 */
export function GlassTabBar({ state, descriptors, navigation }: TabBarProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const glass = isLiquidGlassAvailable();
  const count = state.routes.length;

  const idx = useSharedValue(state.index);
  const tabW = useSharedValue(0);

  useEffect(() => {
    idx.value = withSpring(state.index, { damping: 18, stiffness: 170, mass: 0.7 });
  }, [state.index, idx]);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: Math.max(0, tabW.value - 2 * PAD),
    transform: [{ translateX: idx.value * tabW.value + PAD }],
  }));

  const pillRadius = BAR_HEIGHT / 2;
  const indRadius = (BAR_HEIGHT - 2 * PAD) / 2;

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom || 12 }]} pointerEvents="box-none">
      <View style={[styles.pill, { height: BAR_HEIGHT, borderRadius: pillRadius }]}>
        {/* Background bar */}
        {glass ? (
          <GlassView
            glassEffectStyle="regular"
            style={[StyleSheet.absoluteFill, { borderRadius: pillRadius }]}
          />
        ) : (
          <View
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: pillRadius, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
            ]}
          />
        )}

        {/* Sliding selection pill */}
        <Animated.View style={[styles.indicator, { top: PAD, height: BAR_HEIGHT - 2 * PAD }, indicatorStyle]}>
          {glass ? (
            <GlassView
              glassEffectStyle="clear"
              isInteractive
              tintColor={withAlpha(colors.accent, 0.5)}
              style={[StyleSheet.absoluteFill, { borderRadius: indRadius }]}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { borderRadius: indRadius, backgroundColor: withAlpha(colors.accent, 0.18) }]} />
          )}
        </Animated.View>

        {/* Tab buttons (on top, capture touches) */}
        <View
          style={styles.row}
          onLayout={(e) => {
            tabW.value = e.nativeEvent.layout.width / count;
          }}>
          {state.routes.map((route, i) => {
            const { options } = descriptors[route.key];
            const focused = state.index === i;
            const color = focused ? colors.accent : colors.textSecondary;
            const label = (options.title ?? route.name) as string;

            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            };

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={label}
                onPress={onPress}
                style={styles.tab}>
                {options.tabBarIcon?.({ focused, color, size: 22 })}
                <AppText variant="caption" color={color} style={styles.label}>
                  {label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: MARGIN,
    paddingTop: 6,
    backgroundColor: 'transparent',
  },
  pill: {
    width: '100%',
    overflow: 'hidden',
  },
  indicator: {
    position: 'absolute',
    left: 0,
  },
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});
