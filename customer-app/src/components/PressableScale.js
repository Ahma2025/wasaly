import React, { useRef } from 'react';
import { Pressable, Animated } from 'react-native';
import { SPRING, SPRING_POP, haptic as H } from '../utils/motion';

// زر متحرك فخم — يتصغّر بنعومة (0.96) عند الضغط مع اهتزاز خفيف
export default function PressableScale({ children, onPress, style, scaleTo = 0.96, haptic = true, disabled, ...rest }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => { Animated.spring(scale, { toValue: scaleTo, ...SPRING, stiffness: 320 }).start(); };
  const pressOut = () => { Animated.spring(scale, { toValue: 1, ...SPRING_POP }).start(); };
  const handlePress = (e) => {
    if (haptic) H.light();
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
