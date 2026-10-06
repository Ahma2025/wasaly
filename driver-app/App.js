import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, StatusBar, I18nManager } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ExpoSplash from 'expo-splash-screen';
import { useFonts, Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold, Tajawal_900Black } from '@expo-google-fonts/tajawal';
import './src/tasks/locationTask'; // يُعرّف مهمة تتبّع الموقع في الخلفية (يجب أن يكون في نطاق الوحدة)
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LocationProvider } from './src/context/LocationContext';
import { DriverProvider } from './src/context/DriverContext';
import { navRef, markNavReady } from './src/navigation/navRef';
import SplashScreen from './src/components/SplashScreen';
import FloatingTabBar from './src/components/FloatingTabBar';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS } from './src/theme';
import { LoadingDots } from './src/components/Anim';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import EarningsScreen from './src/screens/EarningsScreen';
import OrdersHistoryScreen from './src/screens/OrdersHistoryScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import DeliveryScreen from './src/screens/DeliveryScreen';
import ReviewsScreen from './src/screens/ReviewsScreen';
import SupportChatScreen from './src/screens/SupportChatScreen';

// اتجاه ثابت: لا نسمح بقلب التخطيط حسب لغة الجهاز — الأنماط تكتب RTL صراحةً (انظر theme.RTL)
try { I18nManager.allowRTL(false); I18nManager.forceRTL(false); } catch {}

const WEIGHT_MAP = {
  '400': 'Tajawal_400Regular', 'normal': 'Tajawal_400Regular',
  '500': 'Tajawal_500Medium', '600': 'Tajawal_500Medium',
  '700': 'Tajawal_700Bold', 'bold': 'Tajawal_700Bold',
  '800': 'Tajawal_800ExtraBold', '900': 'Tajawal_900Black',
};
let _fontPatched = false;
function applyGlobalFont() {
  if (_fontPatched) return;
  _fontPatched = true;
  const patch = (Comp) => {
    const orig = Comp.render;
    if (typeof orig !== 'function') return;
    Comp.render = function (...args) {
      const el = orig.apply(this, args);
      if (!el || !el.props) return el;
      const flat = StyleSheet.flatten(el.props.style) || {};
      const w = flat.fontWeight ? String(flat.fontWeight) : '400';
      const fam = flat.fontFamily || WEIGHT_MAP[w] || 'Tajawal_400Regular';
      return React.cloneElement(el, { style: [{ fontFamily: fam }, el.props.style, { fontWeight: undefined }] });
    };
  };
  try { patch(Text); patch(TextInput); } catch {}
}

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: COLORS.bg, primary: COLORS.primary } };

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }}>
      <Tab.Screen name="الرئيسية" component={HomeScreen} />
      <Tab.Screen name="الأرباح" component={EarningsScreen} />
      <Tab.Screen name="الطلبات" component={OrdersHistoryScreen} />
      <Tab.Screen name="حسابي" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { user, loading } = useAuth();
  if (loading) {
    // امتداد بصري للسبلاش (نفس التدرّج) أثناء قراءة الجلسة — بلا spinner
    return (
      <View style={styles.loading}>
        <LinearGradient colors={GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LoadingDots color="#FFF" size={9} />
      </View>
    );
  }
  if (!user) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }
  return (
    <LocationProvider>
      <DriverProvider>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_left', animationDuration: 260, gestureEnabled: true, contentStyle: { backgroundColor: COLORS.bg } }}>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="Delivery" component={DeliveryScreen} options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="Reviews" component={ReviewsScreen} />
          <Stack.Screen name="SupportChat" component={SupportChatScreen} />
        </Stack.Navigator>
      </DriverProvider>
    </LocationProvider>
  );
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const [fontsLoaded, fontError] = useFonts({ Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold, Tajawal_900Black });
  const fontsReady = fontsLoaded || !!fontError;
  if (fontsLoaded) applyGlobalFont();

  // إخفاء السبلاش الأصلي بعد رسم أول شاشة JS (بعد الخطوط) — بلا وميض أبيض
  const hideNative = useCallback(() => { requestAnimationFrame(() => { ExpoSplash.hideAsync().catch(() => {}); }); }, []);
  // احتياط: لا نترك السبلاش الأصلي عالقاً إن تأخرت الخطوط
  useEffect(() => { const t = setTimeout(hideNative, 6000); return () => clearTimeout(t); }, [hideNative]);

  if (!fontsReady) return null; // السبلاش الأصلي ما زال ظاهراً

  // D-33: التطبيق (الجلسة، السوكِت، عروض الطلبات) يقلع فوراً تحت شاشة البداية — السبلاش طبقة فوقه فقط
  // فلا يتأخر عرض طلب فُتح التطبيق من إشعاره ١.٥-٢.٥ ثانية
  return (
    <SafeAreaProvider>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <AuthProvider>
        <NavigationContainer ref={navRef} theme={navTheme} onReady={markNavReady}>
          <AppNavigator />
        </NavigationContainer>
      </AuthProvider>
      {!splashDone && (
        <View style={styles.splashOverlay}>
          <SplashScreen onReady={hideNative} onFinish={() => setSplashDone(true)} />
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primary },
  splashOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 100, elevation: 100 },
});
