import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
// Chỉ nạp 4 độ đậm đang dùng (nạp cả họ phông là thêm ~2 MB vào app).
import { BeVietnamPro_400Regular } from '@expo-google-fonts/be-vietnam-pro/400Regular';
import { BeVietnamPro_500Medium } from '@expo-google-fonts/be-vietnam-pro/500Medium';
import { BeVietnamPro_600SemiBold } from '@expo-google-fonts/be-vietnam-pro/600SemiBold';
import { BeVietnamPro_700Bold } from '@expo-google-fonts/be-vietnam-pro/700Bold';
import { EgpProvider } from '../egp/EgpProvider';
import { AppStateProvider } from '../state/AppState';
import { configureNotifications, onReminderOpened, reminderThatOpenedApp } from '../notify';
import { color, font } from '../ui/theme.js';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ BeVietnamPro_400Regular, BeVietnamPro_500Medium, BeVietnamPro_600SemiBold, BeVietnamPro_700Bold });
  const router = useRouter();

  const ready = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    if (!ready) return undefined;
    configureNotifications();
    const open = (key) => router.push({ pathname: '/goi/[key]', params: { key } });
    // App đang tắt hẳn mà anh bấm lời nhắc: mở đúng gói sau khi khung điều hướng đã dựng.
    let alive = true;
    reminderThatOpenedApp().then((key) => { if (alive && key) setTimeout(() => open(key), 300); });
    // App đang mở/chạy nền mà anh bấm lời nhắc.
    const off = onReminderOpened(open);
    return () => { alive = false; off(); };
  }, [ready, router]);

  // Phông chưa tải xong thì chờ (chỉ vài phần mười giây); lỗi phông thì dùng phông máy, không chặn app.
  if (!ready) return <View style={{ flex: 1, backgroundColor: color.bg }} />;

  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <EgpProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{
            headerTitleStyle: { fontFamily: font.semibold, color: color.ink },
            headerTintColor: color.brand700,
            headerStyle: { backgroundColor: color.surface },
            contentStyle: { backgroundColor: color.bg }
          }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="goi/[key]" options={{ title: 'Chi tiết gói thầu', headerBackTitle: 'Quay lại' }} />
          </Stack>
        </EgpProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
