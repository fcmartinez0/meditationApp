import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Onboarding } from '@/components/Onboarding';
import { GENERATIVE_SUPPORTED, prefetchGenerative } from '@/lib/generative';
import { isGenerative, sectionFor } from '@/lib/types';
import { AppDataProvider, useAppData } from '@/store/AppData';

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
  const scheme = useColorScheme();

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppDataProvider>
          <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack screenOptions={{ headerShown: false, animation: 'fade', animationDuration: 320 }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="session"
                options={{
                  presentation: 'fullScreenModal',
                  // A slow, dreamy fade into the immersive session.
                  animation: 'fade',
                  animationDuration: 520,
                  gestureEnabled: false,
                }}
              />
              <Stack.Screen
                name="breathe"
                options={{ presentation: 'fullScreenModal', animation: 'fade', animationDuration: 450 }}
              />
              <Stack.Screen
                name="browse"
                options={{ presentation: 'modal', animation: 'slide_from_bottom', animationDuration: 380 }}
              />
              <Stack.Screen
                name="legal"
                options={{ presentation: 'modal', animation: 'slide_from_bottom', animationDuration: 380 }}
              />
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
