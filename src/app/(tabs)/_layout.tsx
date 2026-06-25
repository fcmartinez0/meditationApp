import { Tabs } from 'expo-router';

import { GlassTabBar } from '@/components/GlassTabBar';
import { ConstellationIcon, SlidersIcon, StarIcon } from '@/components/icons';
import { useThemeColors } from '@/hooks/useThemeColors';

export default function TabsLayout() {
  const colors = useThemeColors();

  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        sceneStyle: { backgroundColor: 'transparent' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Relax',
          tabBarIcon: ({ color, size, focused }) => <StarIcon color={color as string} size={size} filled={focused} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ color, size, focused }) => <ConstellationIcon color={color as string} size={size} filled={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size, focused }) => <SlidersIcon color={color as string} size={size} filled={focused} />,
        }}
      />
    </Tabs>
  );
}
