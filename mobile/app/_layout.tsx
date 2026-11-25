import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono';
import {
  PublicSans_400Regular,
  PublicSans_500Medium,
  PublicSans_700Bold,
  PublicSans_800ExtraBold,
} from '@expo-google-fonts/public-sans';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { OfflineProvider } from '@/offline/OfflineProvider';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

export default function RootLayout() {
  // If the fonts fail to load the app still runs, in the system font.
  useFonts({
    PublicSans_400Regular,
    PublicSans_500Medium,
    PublicSans_700Bold,
    PublicSans_800ExtraBold,
    DMMono_400Regular,
    DMMono_500Medium,
  });
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <OfflineProvider>
            <RootStack />
          </OfflineProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootStack() {
  const { colors, resolved } = useTheme();
  const { session } = useAuth();
  const signedIn = session.status === 'signed-in';
  return (
    <>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="job/[id]/index" />
          <Stack.Screen name="job/[id]/complete" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" />
      </Stack>
    </>
  );
}
