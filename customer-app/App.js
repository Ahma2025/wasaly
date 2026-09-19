import React, { useEffect, useRef, useState, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, Text, TextInput, ScrollView, Keyboard, Platform, TouchableOpacity, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import { useFonts, Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold, Tajawal_900Black } from '@expo-google-fonts/tajawal';
import SplashScreen from './src/components/SplashScreen';
import api from './src/utils/api';
import { writeCache } from './src/utils/cache';

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

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <ScrollView style={{ flex:1, backgroundColor:'#fff', padding:20, paddingTop:60 }}>
          <Text style={{ fontSize:18, fontWeight:'bold', color:'red', marginBottom:10 }}>❌ خطأ في التطبيق</Text>
          <Text style={{ color:'#333', fontSize:13 }}>{this.state.error?.message || String(this.state.error)}</Text>
          <Text style={{ color:'#999', fontSize:11, marginTop:10 }}>{this.state.error?.stack}</Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}
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
import RatingScreen from './src/screens/RatingScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';
import MarketScreen from './src/screens/MarketScreen';
import PaymentWebViewScreen from './src/screens/PaymentWebViewScreen';
import CategoryScreen from './src/screens/CategoryScreen';
import SupportChatScreen from './src/screens/SupportChatScreen';
import GroupOrderScreen from './src/screens/GroupOrderScreen';
import FloatingTabBar from './src/components/FloatingTabBar';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="الرئيسية"
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true, sceneContainerStyle: { paddingBottom: 92 } }}>
      {/* الترتيب من اليسار لليمين: حسابي ← طلباتي ← ماركت ← سلتي ← بحث ← الرئيسية */}
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

  // تجهيز مسبق لبيانات كل الصفحات لحظة الدخول — عشان تفتح فورية بدون تحميل
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
      } catch {}
    })();
  }, [user]);

  if (loading) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color="#FF6B00" /></View>;
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', animationDuration: 260, gestureEnabled: true }}>
      {user ? (
        <>
          <Stack.Screen name="Main" component={MainTabs} options={{ animation: 'fade' }} />
          <Stack.Screen name="Restaurant" component={RestaurantScreen} />
          <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} />
          <Stack.Screen name="OrdersHistory" component={OrdersHistoryScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="AddAddress" component={AddAddressScreen} />
          <Stack.Screen name="Rating" component={RatingScreen} />
          <Stack.Screen name="Favorites" component={FavoritesScreen} />
          <Stack.Screen name="PaymentWebView" component={PaymentWebViewScreen} />
          <Stack.Screen name="Category" component={CategoryScreen} />
          <Stack.Screen name="SupportChat" component={SupportChatScreen} />
          <Stack.Screen name="GroupOrder" component={GroupOrderScreen} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
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
      <View style={{ flex: 1 }} />
      <TouchableOpacity onPress={() => Keyboard.dismiss()} style={styles.doneBtn} hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}>
        <Text style={styles.doneBtnText}>تم</Text>
      </TouchableOpacity>
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

function MainApp() {
  const navigationRef = useRef(null);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.order_id && navigationRef.current) {
        navigationRef.current.navigate('OrderTracking', { orderId: data.order_id });
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <CartProvider>
            <NavigationContainer ref={navigationRef}>
              <AppNavigator />
            </NavigationContainer>
            <KeyboardToolbar />
          </CartProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const [fontsLoaded] = useFonts({
    Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold, Tajawal_900Black,
  });
  if (fontsLoaded) applyGlobalFont();

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
