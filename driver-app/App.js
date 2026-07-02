import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { View, ActivityIndicator } from 'react-native';
import SplashScreen from './src/components/SplashScreen';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import EarningsScreen from './src/screens/EarningsScreen';
import OrdersHistoryScreen from './src/screens/OrdersHistoryScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import DeliveryScreen from './src/screens/DeliveryScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      tabBarIcon: ({ focused, color, size }) => {
        const icons = { الرئيسية: focused ? 'home' : 'home-outline', الأرباح: focused ? 'wallet' : 'wallet-outline', الطلبات: focused ? 'list' : 'list-outline', حسابي: focused ? 'person' : 'person-outline' };
        return <Ionicons name={icons[route.name]} size={size} color={color} />;
      },
      tabBarActiveTintColor: '#FF6B00', tabBarInactiveTintColor: '#8E8E93',
      headerShown: false, tabBarStyle: { paddingBottom: 5, height: 60 }
    })}>
      <Tab.Screen name="الرئيسية" component={HomeScreen} />
      <Tab.Screen name="الأرباح" component={EarningsScreen} />
      <Tab.Screen name="الطلبات" component={OrdersHistoryScreen} />
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
          <Stack.Screen name="Delivery" component={DeliveryScreen} options={{ presentation: 'fullScreenModal' }} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);

  if (!splashDone) {
    return <SplashScreen onFinish={() => setSplashDone(true)} />;
  }

  return (
    <AuthProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
