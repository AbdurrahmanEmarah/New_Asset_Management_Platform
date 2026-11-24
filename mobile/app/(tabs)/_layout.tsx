import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

function icon(name: IconName) {
  function TabIcon({ color }: { color: ColorValue }) {
    return <MaterialCommunityIcons name={name} size={24} color={color as string} />;
  }
  return TabIcon;
}

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.action,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, minHeight: 60 },
        tabBarLabelStyle: { fontFamily: fonts.sansBold, fontSize: 12 },
        tabBarItemStyle: { minHeight: 56 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Jobs', tabBarIcon: icon('clipboard-text-outline') }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan', tabBarIcon: icon('qrcode-scan') }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: icon('account-circle-outline') }} />
    </Tabs>
  );
}
