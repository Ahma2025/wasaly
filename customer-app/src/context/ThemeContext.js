import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// الألوان الثابتة عبر الوضعين
const BRAND = '#FF6B00';
const BRAND_DEEP = '#F53B57';

// تدرّجات فخمة تُستخدم عبر التطبيق (٣ محطات = عمق أنعم)
const GRADIENTS = {
  brand:  ['#FF9A2E', '#FF6B00', '#FF4D3D'], // برتقالي دافئ متدرّج (الهوية)
  sunset: ['#FF8A1E', '#FB5A3C', '#F53B57'], // غروب فاخر بثلاث محطات
  gold:   ['#FFCE4D', '#FFB800', '#FF7A00'], // ذهبي لامع
  dark:   ['#211F3A', '#14142B', '#0B0B18'], // ليلي عميق
  glass:  ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.04)'],
  sheen:  ['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)'], // لمعة زجاجية علوية
};

// ظلال جاهزة (ناعمة/عائمة/متوهّجة) للإحساس ثلاثي الأبعاد الفخم
const SHADOW = {
  soft:  { elevation: 3,  shadowColor: '#1A1A2E', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 5 } },
  card:  { elevation: 7,  shadowColor: '#1A1A2E', shadowOpacity: 0.10, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } },
  float: { elevation: 14, shadowColor: '#FF5E3A', shadowOpacity: 0.28, shadowRadius: 26, shadowOffset: { width: 0, height: 14 } },
  glow:  { elevation: 10, shadowColor: '#F53B57', shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }, // توهّج للعناصر النشطة
};

const RADIUS = { sm: 12, md: 18, lg: 24, xl: 32, pill: 999 };

const LIGHT = {
  mode: 'light', primary: BRAND, brandDeep: BRAND_DEEP, gradients: GRADIENTS, shadow: SHADOW, radius: RADIUS,
  bg: '#F4F5F9', card: '#FFFFFF', elev: '#FFFFFF',
  text: '#14142B', sub: '#6B7280', faint: '#9AA0AE', gray: '#8A90A0',
  border: '#ECEEF3', line: '#F0F1F5',
  sec: '#FFF6F1', tint: '#FFEDE2', inputBg: '#F6F7FB',
  white: '#FFFFFF', danger: '#FF3B30', red: '#FF3B30', green: '#25C26E', star: '#FFB800',
  divider: '#EDEEF3',
};

const DARK = {
  mode: 'dark', primary: BRAND, brandDeep: BRAND_DEEP, gradients: GRADIENTS, shadow: SHADOW, radius: RADIUS,
  bg: '#0B0B12', card: '#16161F', elev: '#1E1E29',
  text: '#F3F4F8', sub: '#A4A8B6', faint: '#7E8494', gray: '#969CAC',
  border: '#282833', line: '#22222C',
  sec: '#221A13', tint: '#2A1D12', inputBg: '#1D1D27',
  white: '#16161F', danger: '#FF5A4E', red: '#FF5A4E', green: '#25C26E', star: '#FFB800',
  divider: '#1C1C26',
};

const ThemeCtx = createContext({ isDark: false, colors: LIGHT, toggle: () => {}, setTheme: () => {}, pref: null });

export function ThemeProvider({ children }) {
  const sys = useColorScheme();
  const [pref, setPref] = useState(null); // null = يتبع النظام | 'light' | 'dark'

  useEffect(() => {
    AsyncStorage.getItem('theme_pref').then(v => { if (v === 'light' || v === 'dark' || v === 'system') setPref(v === 'system' ? null : v); }).catch(() => {});
  }, []);

  const isDark = pref ? pref === 'dark' : sys === 'dark';
  const colors = isDark ? DARK : LIGHT;

  const setTheme = (p) => {
    setPref(p === 'system' ? null : p);
    AsyncStorage.setItem('theme_pref', p || 'system').catch(() => {});
  };
  const toggle = () => setTheme(isDark ? 'light' : 'dark');

  return <ThemeCtx.Provider value={{ isDark, colors, toggle, setTheme, pref }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
