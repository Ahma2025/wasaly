import React, { useEffect, useRef, useState, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, Text, ScrollView, Keyboard, Platform, TouchableOpacity, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import SplashScreen from './src/components/SplashScreen';

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

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator initialRouteName="الرئيسية" screenOptions={({ route }) => ({
      tabBarIcon: ({ focused, color, size }) => {
        const icons = {
          'حسابي':    focused ? 'person'       : 'person-outline',
          'طلباتي':   focused ? 'receipt'      : 'receipt-outline',
          'ماركت':    focused ? 'cart'         : 'cart-outline',
          'سلتي':     focused ? 'bag'          : 'bag-outline',
          'بحث':      focused ? 'search'       : 'search-outline',
          'الرئيسية': focused ? 'home'         : 'home-outline',
        };
        return <Ionicons name={icons[route.name]} size={size} color={color} />;
      },
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.faint,
      headerShown: false,
      tabBarStyle: { paddingBottom: 5, height: 60, backgroundColor: colors.card, borderTopColor: colors.border },
    })}>
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
  if (loading) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color="#FF6B00" /></View>;
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
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
