import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Dimensions, StyleSheet, StatusBar } from 'react-native';

const { width } = Dimensions.get('window');

export default function SplashScreen({ onFinish }) {
  const barAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in everything
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    // Fill the bar
    Animated.timing(barAnim, {
      toValue: 1,
      duration: 1800,
      delay: 300,
      useNativeDriver: false,
    }).start(() => {
      setTimeout(() => onFinish && onFinish(), 300);
    });
  }, []);

  const barWidth = barAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, width * 0.65],
  });

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#FF6B00" barStyle="light-content" />

      <Animated.View style={[styles.inner, { opacity: fadeAnim }]}>
        {/* Circle decoration top */}
        <View style={styles.circle} />

        {/* App name */}
        <Text style={styles.name}>وصالي</Text>
        <Text style={styles.tag}>طلبك وصلنا 🚀</Text>

        {/* Progress bar */}
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, { width: barWidth }]} />
        </View>

        {/* Bottom label */}
        <Text style={styles.bottom}>WSSELY DELIVERY</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FF6B00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    alignItems: 'center',
    width: '100%',
  },
  circle: {
    position: 'absolute',
    top: -300,
    width: width * 1.4,
    height: width * 1.4,
    borderRadius: width * 0.7,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  name: {
    fontSize: 64,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 3,
    marginBottom: 10,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },
  tag: {
    fontSize: 19,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
    marginBottom: 60,
    letterSpacing: 1,
  },
  barTrack: {
    width: width * 0.65,
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 20,
  },
  barFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
  },
  bottom: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 4,
    marginTop: 10,
    position: 'absolute',
    bottom: -120,
  },
});
