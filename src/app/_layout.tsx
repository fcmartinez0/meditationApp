import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Onboarding } from '@/components/Onboarding';
import { AppDataProvider, useAppData } from '@/store/AppData';

function OnboardingGate() {
  const { ready, settings } = useAppData();
  if (!ready || settings.onboarded) return null;
  return <Onboarding />;
}

export default function RootLayout() {
  const scheme = useColorScheme();

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppDataProvider>
          <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="session"
                options={{
                  presentation: 'fullScreenModal',
                  animation: 'fade',
                  gestureEnabled: false,
                }}
              />
              <Stack.Screen
                name="breathe"
                options={{ presentation: 'fullScreenModal', animation: 'fade' }}
              />
              <Stack.Screen name="legal" options={{ presentation: 'modal' }} />
            </Stack>
            <OnboardingGate />
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          </ThemeProvider>
        </AppDataProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
