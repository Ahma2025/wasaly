import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, Text, ScrollView } from 'react-native';
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

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      tabBarIcon: ({ focused, color, size }) => {
        const icons = {
          'الرئيسية': focused ? 'home' : 'home-outline',
          'بحث': focused ? 'search' : 'search-outline',
          'سلتي': focused ? 'cart' : 'cart-outline',
          'طلباتي': focused ? 'receipt' : 'receipt-outline',
          'حسابي': focused ? 'person' : 'person-outline',
        };
        return <Ionicons name={icons[route.name]} size={size} color={color} />;
      },
      tabBarActiveTintColor: '#FF6B00', tabBarInactiveTintColor: '#8E8E93',
      headerShown: false, tabBarStyle: { paddingBottom: 5, height: 60 }
    })}>
      <Tab.Screen name="الرئيسية" component={HomeScreen} />
      <Tab.Screen name="بحث" component={SearchScreen} />
      <Tab.Screen name="سلتي" component={CartScreen} />
      <Tab.Screen name="طلباتي" component={OrdersHistoryScreen} />
      <Tab.Screen name="حسابي" component={ProfileScreen} />
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
          <Stack.Screen name="AddAddress" component={AddAddressScreen} options={{ presentation: 'modal' }} />
          <Stack.Screen name="Rating" component={RatingScreen} options={{ presentation: 'modal' }} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

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
      <AuthProvider>
        <CartProvider>
          <NavigationContainer ref={navigationRef}>
            <AppNavigator />
          </NavigationContainer>
        </CartProvider>
      </AuthProvider>
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
