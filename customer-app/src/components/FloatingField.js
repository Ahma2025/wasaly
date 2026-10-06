import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Animated, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useShake } from './Anim';
import { EASE_OUT, isReducedMotion, haptic } from '../utils/motion';

/*
  حقل إدخال بعنوان عائم (Floating label) — RTL
  - العنوان يطفو للأعلى عند التركيز أو وجود قيمة
  - إطار يتلوّن بالتركيز / الخطأ / الصحة
  - اهتزاز + رسالة خطأ تنزلق عند ظهور خطأ (ويعيد الاهتزاز لو تغيّر nudge والخطأ ما زال موجود)
  - علامة صح خضراء عند valid
  - hint: نص مساعد صغير تحت الحقل (يختفي لما يظهر خطأ)
  - ref: يمرّر focus/blur للـ TextInput (لتسلسل زر "التالي" بالكيبورد)
  - الضغط على أي مكان بالإطار يركّز الحقل (هدف لمس أكبر)
  مكوّن على مستوى الملف (مش داخل render) حتى ما يضيع تركيز الكيبورد.
*/
function FloatingField({ icon, label, value, error, valid, secure, onFocus, onBlur, style, inputStyle, multiline, hint, nudge, trailing, ...rest }, ref) {
  const { colors: C } = useTheme();
  const input = useRef(null);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secure);
  const lift = useRef(new Animated.Value(value ? 1 : 0)).current;
  const focusV = useRef(new Animated.Value(0)).current;
  const errV = useRef(new Animated.Value(error ? 1 : 0)).current;
  const [shakeStyle, shake] = useShake();
  const prevErr = useRef(error);
  const prevNudge = useRef(nudge);

  useImperativeHandle(ref, () => ({
    focus: () => input.current && input.current.focus(),
    blur: () => input.current && input.current.blur(),
    isFocused: () => !!(input.current && input.current.isFocused && input.current.isFocused()),
  }), []);

  const up = focused || (value != null && String(value).length > 0);
  useEffect(() => {
    const d = isReducedMotion() ? 0 : 180;
    Animated.timing(lift, { toValue: up ? 1 : 0, duration: d, easing: EASE_OUT, useNativeDriver: false }).start();
  }, [up]);
  useEffect(() => {
    Animated.timing(focusV, { toValue: focused ? 1 : 0, duration: isReducedMotion() ? 0 : 180, useNativeDriver: false }).start();
  }, [focused]);
  // اهتزاز عند ظهور خطأ جديد، أو عند محاولة جديدة (nudge) والخطأ ما زال موجود — مرة واحدة فقط لكل commit
  useEffect(() => {
    const appeared = !!error && !prevErr.current;
    const nudged = !!error && nudge !== prevNudge.current;
    if (appeared || nudged) shake();
    if (error !== prevErr.current) {
      Animated.timing(errV, { toValue: error ? 1 : 0, duration: isReducedMotion() ? 0 : 200, easing: EASE_OUT, useNativeDriver: true }).start();
    }
    prevErr.current = error;
    prevNudge.current = nudge;
  }, [error, nudge]);

  const borderColor = error ? C.red : focusV.interpolate({ inputRange: [0, 1], outputRange: [C.border, C.primary] });
  const bg = error ? C.dangerBg : focusV.interpolate({ inputRange: [0, 1], outputRange: [C.inputBg, C.card] });
  const labelTop = lift.interpolate({ inputRange: [0, 1], outputRange: [multiline ? 18 : 17, 7] });
  const labelSize = lift.interpolate({ inputRange: [0, 1], outputRange: [15, 11.5] });
  const labelColor = error ? C.red : (focused ? C.primary : C.faint);
  const iconColor = error ? C.red : (focused ? C.primary : C.faint);

  return (
    <Animated.View style={[style, shakeStyle]}>
      <Pressable onPress={() => input.current && input.current.focus()} accessible={false}>
        <Animated.View style={[styles.wrap, multiline && { minHeight: 96, alignItems: 'flex-start' }, { borderColor, backgroundColor: bg }]}>
          {!!icon && <Ionicons name={icon} size={20} color={iconColor} style={[styles.icon, multiline && { marginTop: 18 }]} />}
          <View style={{ flex: 1 }}>
            <Animated.Text pointerEvents="none" numberOfLines={1}
              style={[styles.label, { top: labelTop, fontSize: labelSize, color: labelColor }]}>{label}</Animated.Text>
            <TextInput
              {...rest}
              ref={input}
              value={value}
              multiline={multiline}
              accessibilityLabel={rest.accessibilityLabel || label}
              accessibilityHint={error || rest.accessibilityHint || hint}
              secureTextEntry={secure ? hidden : false}
              placeholder={up ? rest.placeholder : undefined}
              placeholderTextColor={C.faint}
              selectionColor={C.primary}
              cursorColor={C.primary}
              textAlign="right"
              style={[styles.input, { color: C.text }, multiline && { minHeight: 70, textAlignVertical: 'top' }, inputStyle]}
              onFocus={(e) => { setFocused(true); onFocus && onFocus(e); }}
              onBlur={(e) => { setFocused(false); onBlur && onBlur(e); }}
            />
          </View>
          {secure ? (
            <TouchableOpacity onPress={() => { haptic.select(); setHidden(h => !h); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.trail}
              accessibilityRole="button" accessibilityLabel={hidden ? 'إظهار كلمة السر' : 'إخفاء كلمة السر'}>
              <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={focused ? C.primary : C.faint} />
            </TouchableOpacity>
          ) : trailing ? (
            <View style={styles.trail}>{trailing}</View>
          ) : valid && !error ? (
            <View style={styles.trail}><Ionicons name="checkmark-circle" size={20} color={C.green} /></View>
          ) : null}
        </Animated.View>
      </Pressable>
      {!!error ? (
        <Animated.View style={[styles.errRow, { opacity: errV, transform: [{ translateY: errV.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }]}
          accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={14} color={C.red} />
          <Text style={[styles.errText, { color: C.red }]}>{error}</Text>
        </Animated.View>
      ) : !!hint ? (
        <Text style={[styles.hint, { color: C.faint }]}>{hint}</Text>
      ) : null}
    </Animated.View>
  );
}

export default forwardRef(FloatingField);

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row-reverse', alignItems: 'center', borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 12, minHeight: 58 },
  icon: { marginLeft: 8 },
  label: { position: 'absolute', right: 0, left: 0, textAlign: 'right', fontWeight: '500' },
  input: { fontSize: 16, paddingTop: 22, paddingBottom: 8, fontWeight: '500' },
  trail: { marginRight: 8, paddingVertical: 4 },
  errRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 6, marginRight: 6 },
  errText: { fontSize: 12.5, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  hint: { fontSize: 12, fontWeight: '500', textAlign: 'right', marginTop: 5, marginRight: 6 },
});
