import React, { useRef } from 'react';
import { Pressable, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';

// زر متحرك فخم — يتصغّر بنعومة عند الضغط مع اهتزاز خفيف
export default function PressableScale({ children, onPress, style, scaleTo = 0.96, haptic = true, disabled, ...rest }) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  };
  const handlePress = (e) => {
    if (haptic) { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} }
    onPress && onPress(e);
  };

  return (
    <Pressable onPress={handlePress} onPressIn={pressIn} onPressOut={pressOut} disabled={disabled} {...rest}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
