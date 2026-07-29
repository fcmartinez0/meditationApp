import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Onboarding } from '@/components/Onboarding';
import { useAppColorScheme } from '@/hooks/useThemeColors';
import { GENERATIVE_SUPPORTED, prefetchGenerative } from '@/lib/generative';
import { isGenerative, sectionFor } from '@/lib/types';
import { AppDataProvider, useAppData } from '@/store/AppData';
import { getColors } from '@/theme';

function OnboardingGate() {
  const { ready, settings } = useAppData();
  if (!ready || settings.onboarded) return null;
  return <Onboarding />;
}

/**
 * Kick off the first generative render the moment settings load — well before
 * the user reaches the home screen, let alone taps Begin. The render runs off
 * the JS thread and is a no-op on web, so this never blocks startup; it just
 * means the first session starts instantly instead of waiting on "Composing".
 */
function LaunchPrefetch() {
  const { ready, settings } = useAppData();
  useEffect(() => {
    if (!ready) return;
    if (Platform.OS === 'web' || !GENERATIVE_SUPPORTED) return;
    if (isGenerative(settings.ambient)) {
      void prefetchGenerative(sectionFor(settings.ambient));
    }
    // Only on first ready — home-screen focus keeps it fresh after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  return null;
}

export default function RootLayout() {
  const scheme = useAppColorScheme();

  // The navigator paints its own surfaces (scene background, the strip behind a
  // custom tab bar) from this theme — derive them from the app palette so no
  // stock React-Navigation grey ever shows through the night sky.
  const navTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    const colors = getColors(scheme);
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.background,
        card: colors.background,
        text: colors.text,
        border: colors.border,
      },
    };
  }, [scheme]);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppDataProvider>
          <ThemeProvider value={navTheme}>
            {/* Native iOS animations: card-sheet modals (parent scales back) and a
                smooth slide-up for the immersive screens. */}
            <Stack screenOptions={{ headerShown: false, animation: 'default' }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="session"
                options={{
                  presentation: 'fullScreenModal',
                  animation: 'slide_from_bottom',
                  gestureEnabled: false,
                }}
              />
              <Stack.Screen
                name="breathe"
                options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen name="browse" options={{ presentation: 'modal' }} />
              <Stack.Screen name="legal" options={{ presentation: 'modal' }} />
            </Stack>
            <OnboardingGate />
            <LaunchPrefetch />
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          </ThemeProvider>
        </AppDataProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
