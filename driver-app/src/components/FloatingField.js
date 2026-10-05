// حقل إدخال بعنوان عائم (Floating label) — نفس لغة تطبيق الزبون
// - ارتفاع 56، العنوان يطفو عند التركيز أو وجود قيمة
// - إطار يتلوّن بالتركيز / الخطأ، اهتزاز خفيف عند ظهور خطأ جديد
// - إظهار/إخفاء كلمة السر، علامة صح عند valid
// مكوّن على مستوى الملف (ليس داخل render) حتى لا يضيع تركيز الكيبورد.
import React, { useEffect, useRef, useState, forwardRef } from 'react';
import { View, Text, TextInput, StyleSheet, Animated, Pressable, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../theme';
import { haptic, isReducedMotion } from './Anim';

const EASE_OUT = Easing.bezier(0.2, 0.8, 0.2, 1);

const FloatingField = forwardRef(function FloatingField(
  { icon, label, value, error, valid, secure, onFocus, onBlur, style, editable = true, hint, ...rest }, ref,
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secure);
  const up = focused || (value != null && String(value).length > 0);
  const lift = useRef(new Animated.Value(up ? 1 : 0)).current;
  const focusV = useRef(new Animated.Value(0)).current;
  const errV = useRef(new Animated.Value(error ? 1 : 0)).current;
  const shakeX = useRef(new Animated.Value(0)).current;
  const prevErr = useRef(error);

  useEffect(() => {
    Animated.timing(lift, { toValue: up ? 1 : 0, duration: isReducedMotion() ? 0 : 180, easing: EASE_OUT, useNativeDriver: false }).start();
  }, [up, lift]);
  useEffect(() => {
    Animated.timing(focusV, { toValue: focused ? 1 : 0, duration: isReducedMotion() ? 0 : 180, useNativeDriver: false }).start();
  }, [focused, focusV]);
  useEffect(() => {
    if (error && !prevErr.current && !isReducedMotion()) {
      Animated.sequence([8, -8, 6, -6, 0].map(v => Animated.timing(shakeX, { toValue: v, duration: 50, useNativeDriver: true }))).start();
    }
    prevErr.current = error;
    Animated.timing(errV, { toValue: error ? 1 : 0, duration: isReducedMotion() ? 0 : 200, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [error, errV, shakeX]);

  const borderColor = error ? COLORS.red : focusV.interpolate({ inputRange: [0, 1], outputRange: [COLORS.line, COLORS.primary] });
  const backgroundColor = error ? COLORS.redSoft : focusV.interpolate({ inputRange: [0, 1], outputRange: [COLORS.inputBg, COLORS.card] });
  const labelTop = lift.interpolate({ inputRange: [0, 1], outputRange: [17, 7] });
  const labelSize = lift.interpolate({ inputRange: [0, 1], outputRange: [15, 11.5] });
  const tint = error ? COLORS.red : (focused ? COLORS.primary : COLORS.gray);

  return (
    <Animated.View style={[style, { transform: [{ translateX: shakeX }] }]}>
      <Animated.View style={[styles.wrap, focused && !error && styles.focusGlow, { borderColor, backgroundColor }, !editable && { opacity: 0.7 }]}>
        {!!icon && <Ionicons name={icon} size={20} color={tint} style={styles.icon} />}
        <View style={{ flex: 1, alignSelf: 'stretch', justifyContent: 'center' }}>
          <Animated.Text pointerEvents="none" numberOfLines={1}
            style={[styles.label, { top: labelTop, fontSize: labelSize, color: error ? COLORS.red : (focused ? COLORS.primary : COLORS.gray) }]}>
            {label}
          </Animated.Text>
          <TextInput
            ref={ref}
            {...rest}
            value={value}
            editable={editable}
            accessibilityLabel={rest.accessibilityLabel || label}
            accessibilityHint={error || hint}
            secureTextEntry={secure ? hidden : false}
            placeholder={up ? rest.placeholder : undefined}
            placeholderTextColor={COLORS.faint}
            textAlign="right"
            selectionColor={COLORS.primary}
            style={styles.input}
            onFocus={(e) => { setFocused(true); onFocus && onFocus(e); }}
            onBlur={(e) => { setFocused(false); onBlur && onBlur(e); }}
          />
        </View>
        {secure ? (
          <Pressable onPress={() => { haptic.select(); setHidden(h => !h); }} hitSlop={12} style={styles.trail}
            accessibilityRole="button" accessibilityLabel={hidden ? 'إظهار كلمة المرور' : 'إخفاء كلمة المرور'}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={21} color={focused ? COLORS.primary : COLORS.gray} />
          </Pressable>
        ) : valid && !error ? (
          <View style={styles.trail}><Ionicons name="checkmark-circle" size={21} color={COLORS.green} /></View>
        ) : null}
      </Animated.View>
      {!!error && (
        <Animated.View accessibilityLiveRegion="polite"
          style={[styles.errRow, { opacity: errV, transform: [{ translateY: errV.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }]}>
          <Ionicons name="alert-circle" size={14} color={COLORS.red} />
          <Text style={styles.errText}>{error}</Text>
        </Animated.View>
      )}
    </Animated.View>
  );
});

export default FloatingField;

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row-reverse', alignItems: 'center', borderWidth: 1.5, borderRadius: RADIUS.sm + 2, paddingHorizontal: 14, height: 56 },
  focusGlow: { shadowColor: COLORS.primary, shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  icon: { marginLeft: 10 },
  label: { position: 'absolute', right: 0, left: 0, textAlign: 'right', writingDirection: 'rtl', fontWeight: '500' },
  input: { fontSize: 16, paddingTop: 20, paddingBottom: 4, paddingHorizontal: 0, fontWeight: '600', color: COLORS.text, height: 52 },
  trail: { width: 40, height: 40, marginRight: 4, alignItems: 'center', justifyContent: 'center' },
  errRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 6, marginRight: 6 },
  errText: { color: COLORS.red, fontSize: 12.5, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl', flexShrink: 1 },
});
