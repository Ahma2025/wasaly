import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, Text, TextInput, Keyboard, Platform, TouchableOpacity, StyleSheet, StatusBar, I18nManager } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import * as ExpoSplash from 'expo-splash-screen';
import { useFonts, Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold, Tajawal_900Black } from '@expo-google-fonts/tajawal';
import SplashScreen from './src/components/SplashScreen';
import ErrorBoundary from './src/components/ErrorBoundary';
import api from './src/utils/api';
import { writeCache } from './src/utils/cache';
import { notificationData } from './src/utils/pushNotifications';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CartProvider } from './src/context/CartContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import SearchScreen from './src/screens/SearchScreen';
import CartScreen from './src/screens/CartScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import RestaurantScreen from './src/screens/RestaurantScreen';
import OrderTrackingScreen from './src/screens/OrderTrackingScreen';
import OrdersHistoryScreen from './src/screens/OrdersHistoryScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import AddAddressScreen from './src/screens/AddAddressScreen';
import AddressesScreen from './src/screens/AddressesScreen';
import RatingScreen from './src/screens/RatingScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';
import MarketScreen from './src/screens/MarketScreen';
import PaymentWebViewScreen from './src/screens/PaymentWebViewScreen';
import CategoryScreen from './src/screens/CategoryScreen';
import SupportChatScreen from './src/screens/SupportChatScreen';
import GroupOrderScreen from './src/screens/GroupOrderScreen';
import PersonalDeliveryScreen from './src/screens/PersonalDeliveryScreen';
import FloatingTabBar from './src/components/FloatingTabBar';

// الواجهة مبنية بترتيب RTL صريح (row-reverse / textAlign:right) — نثبّت اتجاه النظام LTR
// حتى ما ينقلب التصميم مرتين على أجهزة لغتها عربية
try { I18nManager.allowRTL(false); I18nManager.forceRTL(false); } catch {}

// إبقاء شاشة البداية الأصلية حتى تجهز الخطوط (بدون وميض فاضي)
ExpoSplash.preventAutoHideAsync().catch(() => {});

// خريطة الأوزان → عائلة Tajawal المناسبة (عشان الخط يبان صح مع كل fontWeight)
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

function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="الرئيسية"
      backBehavior="initialRoute" // زر الرجوع من أي تبويب يرجع للرئيسية (والخروج فقط من الرئيسية)
      tabBar={(props) => <FloatingTabBar {...props} />}
      sceneContainerStyle={{ paddingBottom: 0 }}
      screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }}>
      {/* الترتيب من اليسار لليمين حتى تظهر "الرئيسية" على اليمين (RTL) */}
      <Tab.Screen name="حسابي"    component={ProfileScreen} />
      <Tab.Screen name="طلباتي"   component={OrdersHistoryScreen} />
      <Tab.Screen name="ماركت"    component={MarketScreen} />
      <Tab.Screen name="سلتي"     component={CartScreen} />
      <Tab.Screen name="بحث"      component={SearchScreen} />
      <Tab.Screen name="الرئيسية" component={HomeScreen} />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { user, loading } = useAuth();
  const { colors: C } = useTheme();

  // تجهيز مسبق لبيانات الصفحات لحظة الدخول — عشان تفتح فورية بدون تحميل
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [r, c, b] = await Promise.allSettled([
          api.get('/restaurants?limit=60'), api.get('/categories'), api.get('/banners'),
        ]);
        const rests = r.status === 'fulfilled' ? (r.value?.data || []) : [];
        const cats = c.status === 'fulfilled' ? (c.value?.data || []) : [];
        const bans = b.status === 'fulfilled' ? (b.value?.data || []) : [];
        let recent = [];
        try {
          const my = await api.get('/orders/my'); const orders = my?.data || [];
          writeCache('orders_my', orders);
          const seen = new Set();
          for (const o of orders) { if (o.restaurant_id && !seen.has(o.restaurant_id)) { seen.add(o.restaurant_id); const rr = rests.find(x => x.id === o.restaurant_id); if (rr) recent.push(rr); } if (recent.length >= 8) break; }
        } catch {}
        if (rests.length || cats.length || bans.length) writeCache('home', { restaurants: rests, categories: cats, banners: bans, recentRests: recent });
        api.get('/restaurants?limit=60&store_type=market').then(m => writeCache('market', m.data || [])).catch(() => {});
        api.get('/users/profile').then(p => writeCache('profile', p.data)).catch(() => {});
        api.get('/users/favorites').then(f => writeCache('favorites', f.data || [])).catch(() => {});
        api.get('/users/addresses').then(a => writeCache('addresses', a.data || [])).catch(() => {});
      } catch {}
    })();
  }, [!!user]);

  if (loading) return (
    <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#FFF" />
    </LinearGradient>
  );
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: Platform.OS === 'android' ? 'slide_from_left' : 'slide_from_right', animationDuration: 260, gestureEnabled: true, contentStyle: { backgroundColor: C.bg } }}>
      {user ? (
        <>
          <Stack.Screen name="Main" component={MainTabs} options={{ animation: 'fade' }} />
          <Stack.Screen name="Restaurant" component={RestaurantScreen} />
          <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="Addresses" component={AddressesScreen} />
          <Stack.Screen name="AddAddress" component={AddAddressScreen} />
          <Stack.Screen name="Rating" component={RatingScreen} />
          <Stack.Screen name="Favorites" component={FavoritesScreen} />
          <Stack.Screen name="PaymentWebView" component={PaymentWebViewScreen} options={{ gestureEnabled: false }} />
          <Stack.Screen name="Category" component={CategoryScreen} />
          <Stack.Screen name="SupportChat" component={SupportChatScreen} />
          <Stack.Screen name="GroupOrder" component={GroupOrderScreen} />
          <Stack.Screen name="PersonalDelivery" component={PersonalDeliveryScreen} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

// توجيه الإشعارات: نقرة أثناء التشغيل + فتح التطبيق من إشعار (cold start) بعد جاهزية الملاحة
function NotificationRouter({ navigationRef, navReady }) {
  const { user } = useAuth();
  const handled = useRef(new Set());
  const pending = useRef(null);

  const route = (response) => {
    const id = response?.notification?.request?.identifier;
    if (id && handled.current.has(id)) return;
    if (id) handled.current.add(id);
    const data = notificationData(response);
    if (data?.type === 'cart_reminder') { pending.current = { name: 'Main', params: { screen: 'سلتي' } }; }
    else if (data?.order_id) { pending.current = { name: 'OrderTracking', params: { orderId: data.order_id } }; }
    flush();
  };
  const flush = () => {
    if (!pending.current || !navReady || !user || !navigationRef.current) return;
    const { name, params } = pending.current;
    pending.current = null;
    try { navigationRef.current.navigate(name, params); } catch {}
  };

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(route);
    return () => sub.remove();
  }, [navReady, !!user]);

  useEffect(() => {
    if (!navReady || !user) return;
    Notifications.getLastNotificationResponseAsync().then(r => { if (r) route(r); }).catch(() => {});
    // انتظار بسيط حتى يتركّب الـ Stack الخاص بالمستخدم
    const t = setTimeout(flush, 300);
    return () => clearTimeout(t);
  }, [navReady, !!user]);

  return null;
}

function KeyboardToolbar() {
  const [kbHeight, setKbHeight] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEv, e => { setKbHeight(e.endCoordinates.height); setVisible(true); });
    const hide = Keyboard.addListener(hideEv, () => setVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  if (!visible || Platform.OS !== 'ios') return null;

  return (
    <View style={[styles.kbToolbar, { bottom: kbHeight }]}>
      <TouchableOpacity onPress={() => Keyboard.dismiss()} style={styles.doneBtn} hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}>
        <Text style={styles.doneBtnText}>تم</Text>
      </TouchableOpacity>
      <View style={{ flex: 1 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  kbToolbar: {
    position: 'absolute', left: 0, right: 0, height: 44,
    backgroundColor: '#D1D5DB',
    borderTopWidth: 0.5, borderTopColor: '#A0A0A8',
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8,
    zIndex: 9999,
  },
  doneBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  doneBtnText: { color: '#007AFF', fontSize: 17, fontWeight: '600' },
});

function ThemedNavigation() {
  const { colors: C, isDark } = useTheme();
  const navigationRef = useRef(null);
  const [navReady, setNavReady] = useState(false);
  const navTheme = React.useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, background: C.bg, card: C.card, text: C.text, border: C.border, primary: C.primary } };
  }, [isDark, C]);

  return (
    <>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <NavigationContainer ref={navigationRef} theme={navTheme} onReady={() => setNavReady(true)}>
        <AppNavigator />
      </NavigationContainer>
      <NotificationRouter navigationRef={navigationRef} navReady={navReady} />
      <KeyboardToolbar />
    </>
  );
}

function MainApp() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <CartProvider>
              <ThemedNavigation />
            </CartProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const [fontTimeout, setFontTimeout] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold, Tajawal_900Black,
  });
  const fontsReady = fontsLoaded || !!fontError || fontTimeout;

  // حماية: لو الخطوط علقت لأي سبب ما نخلي المستخدم على شاشة البداية للأبد
  useEffect(() => { const t = setTimeout(() => setFontTimeout(true), 5000); return () => clearTimeout(t); }, []);

  useEffect(() => {
    if (!fontsReady) return;
    if (fontsLoaded) applyGlobalFont();
    ExpoSplash.hideAsync().catch(() => {});
  }, [fontsReady, fontsLoaded]);

  if (!fontsReady) return null; // الشاشة الأصلية ما زالت ظاهرة

  if (!splashDone) {
    return (
      <ErrorBoundary>
        <SplashScreen onFinish={() => setSplashDone(true)} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
