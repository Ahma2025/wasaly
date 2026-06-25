import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
        const icons = { الرئيسية: focused ? 'home' : 'home-outline', بحث: focused ? 'search' : 'search-outline', سلتي: focused ? 'cart' : 'cart-outline', حسابي: focused ? 'person' : 'person-outline' };
        return <Ionicons name={icons[route.name]} size={size} color={color} />;
      },
      tabBarActiveTintColor: '#FF6B00', tabBarInactiveTintColor: '#8E8E93',
      headerShown: false, tabBarStyle: { paddingBottom: 5, height: 60 }
    })}>
      <Tab.Screen name="الرئيسية" component={HomeScreen} />
      <Tab.Screen name="بحث" component={SearchScreen} />
      <Tab.Screen name="سلتي" component={CartScreen} />
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

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <CartProvider>
          <NavigationContainer>
            <AppNavigator />
          </NavigationContainer>
        </CartProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
