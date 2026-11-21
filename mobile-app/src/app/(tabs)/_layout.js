import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { color, font } from '../../ui/theme.js';
import { useApp } from '../../state/AppState';

export default function TabsLayout() {
  const app = useApp();
  const watched = Object.keys(app?.watch || {}).length;
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: color.brand700,
      tabBarInactiveTintColor: color.subtle,
      // Be Vietnam Pro có chân chữ dài (dấu nặng, chữ g/y): cần lineHeight riêng để nhãn không bị cắt.
      tabBarLabelStyle: { fontFamily: font.medium, fontSize: 12, lineHeight: 20 },
      tabBarStyle: { backgroundColor: color.surface, borderTopColor: color.line, ...(Platform.OS === 'web' ? { height: 68, paddingTop: 6, paddingBottom: 8 } : {}) },
      headerTitleStyle: { fontFamily: font.semibold, color: color.ink, fontSize: 17 },
      headerStyle: { backgroundColor: color.surface },
      headerShadowVisible: false,
      sceneStyle: { backgroundColor: color.bg }
    }}>
      <Tabs.Screen name="index" options={{
        title: 'Tìm gói thầu', tabBarLabel: 'Tìm gói',
        tabBarIcon: ({ color: c, size }) => <Ionicons name="search" size={size} color={c} />
      }} />
      <Tabs.Screen name="theo-doi" options={{
        title: 'Gói đang theo dõi', tabBarLabel: 'Theo dõi',
        tabBarBadge: watched ? watched : undefined,
        tabBarBadgeStyle: { backgroundColor: color.brand700, fontFamily: font.semibold, fontSize: 11 },
        tabBarIcon: ({ color: c, size }) => <Ionicons name="star" size={size} color={c} />
      }} />
      <Tabs.Screen name="thong-tin" options={{
        title: 'Thông tin & trợ giúp', tabBarLabel: 'Thông tin',
        tabBarIcon: ({ color: c, size }) => <Ionicons name="information-circle" size={size} color={c} />
      }} />
    </Tabs>
  );
}
