import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/*
  Wasaly Luxe tokens — مطابقة لـ DESIGN.md (موحّدة عبر التطبيقات الأربعة)
  ملاحظة: كل المفاتيح القديمة باقية (primary/sub/gray/tint...) حتى ما تنكسر أي شاشة.
*/

const BRAND = '#FF6B00';
const BRAND_DARK = '#FF7A1A'; // البرتقالي في الوضع الداكن (أوضح على الخلفيات العميقة)
const BRAND_DEEP = '#F53B57';

// تدرّجات الهوية
const GRADIENTS = {
  sunset: ['#FF8A00', '#FF5E3A', '#F53B57'], // التدرّج الرئيسي (135°)
  brand:  ['#FF9A2E', '#FF6B00', '#FF4D3D'],
  gold:   ['#FFD36B', '#FFB020', '#FF7A00'],
  dark:   ['#25233F', '#14142B', '#0B0B18'],
  night:  ['#1E1E2A', '#16161F', '#0B0B12'],
  success:['#3BD17A', '#1DB954', '#0E9F48'],
  info:   ['#5AAEFF', '#2E90FA', '#1570EF'],
  violet: ['#A78BFA', '#7C5CFA', '#5B3FD6'],
  danger: ['#FF8A7A', '#F04438', '#C8281C'],
  glass:  ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.04)'],
  sheen:  ['rgba(255,255,255,0.30)', 'rgba(255,255,255,0)'],
  scrim:  ['rgba(10,10,20,0)', 'rgba(10,10,20,0.72)'],
};

// نظام ظلال واحد (soft / card / float) + glow للعناصر النشطة
const SHADOW = {
  none:  {},
  soft:  { elevation: 2,  shadowColor: '#14142B', shadowOpacity: 0.06, shadowRadius: 8,  shadowOffset: { width: 0, height: 2 } },
  card:  { elevation: 6,  shadowColor: '#14142B', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
  float: { elevation: 12, shadowColor: '#FF6B00', shadowOpacity: 0.28, shadowRadius: 32, shadowOffset: { width: 0, height: 14 } },
  glow:  { elevation: 10, shadowColor: '#F53B57', shadowOpacity: 0.42, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
};

// مقياس الزوايا: 10 / 14 / 18 / 24 / 32 / pill — الشيتات 28
const RADIUS = { xs: 10, sm: 14, md: 18, lg: 24, xl: 32, sheet: 28, pill: 999 };

// شبكة 4 نقاط
const SPACE = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, huge: 40, gutter: 16 };

// سلّم الخطوط (Tajawal) — بدون letterSpacing على العربي أبداً
const TYPE = {
  display: { fontSize: 30, fontWeight: '900' },
  h1:      { fontSize: 24, fontWeight: '800' },
  h2:      { fontSize: 20, fontWeight: '800' },
  h3:      { fontSize: 17, fontWeight: '700' },
  body:    { fontSize: 15, fontWeight: '500' },
  caption: { fontSize: 12.5, fontWeight: '500' },
  micro:   { fontSize: 11, fontWeight: '700' },
  price:   { fontSize: 16, fontWeight: '800' },
};

// مدد الحركة
const MOTION = { micro: 150, standard: 250, emphasis: 400, stagger: 50, spring: { damping: 16, stiffness: 200, mass: 1 } };

const SEMANTIC = { success: '#1DB954', warning: '#FFB020', danger: '#F04438', info: '#2E90FA' };

const COMMON = { gradients: GRADIENTS, shadow: SHADOW, radius: RADIUS, space: SPACE, type: TYPE, motion: MOTION, brandDeep: BRAND_DEEP, ...SEMANTIC };

const LIGHT = {
  ...COMMON,
  mode: 'light', primary: BRAND,
  bg: '#F6F7FB', card: '#FFFFFF', elev: '#FFFFFF', glass: 'rgba(255,255,255,0.82)',
  text: '#14142B', sub: '#4E4B66', faint: '#8A8FA3', gray: '#8A8FA3', muted: '#8A8FA3',
  border: '#ECEEF4', line: '#F1F2F7',
  sec: '#FFF6EF', tint: '#FFF3EA', inputBg: '#F4F5FA',
  white: '#FFFFFF', danger: '#F04438', red: '#F04438', green: '#1DB954', star: '#FFB020',
  divider: '#ECEEF4',
  tintBorder: '#FFDCC2', successBg: '#EAFBF0', successBorder: '#BDEFCF', successText: '#11833D',
  dangerBg: '#FEF0EF', dangerBorder: '#FBD0CC', warnBg: '#FFF8E6', warnBorder: '#FFE6A3', warnFill: '#FFB020',
  infoBg: '#EBF4FF', infoText: '#1570EF',
  overlay: 'rgba(11,11,18,0.48)', skeleton: '#ECEDF2', skeletonHi: '#F7F8FB', onPrimary: '#FFFFFF',
  statusBar: 'light-content',
};

const DARK = {
  ...COMMON,
  mode: 'dark', primary: BRAND_DARK,
  bg: '#0B0B12', card: '#16161F', elev: '#1E1E2A', glass: 'rgba(30,30,42,0.86)',
  text: '#F3F4F8', sub: '#B8B9CC', faint: '#9A9AB0', gray: '#9A9AB0', muted: '#9A9AB0',
  border: '#272734', line: '#20202B',
  sec: '#221A13', tint: '#2A1D12', inputBg: '#1C1C27',
  white: '#16161F', danger: '#FF5A4E', red: '#FF5A4E', green: '#2BD46A', star: '#FFB020',
  divider: '#1E1E29',
  tintBorder: '#3D2817', successBg: '#0F2619', successBorder: '#1C4A2E', successText: '#5BE39A',
  dangerBg: '#2A1416', dangerBorder: '#4A2226', warnBg: '#2A2412', warnBorder: '#4A3E1A', warnFill: '#FFB020',
  infoBg: '#10203A', infoText: '#7DB8FF',
  overlay: 'rgba(0,0,0,0.62)', skeleton: '#22222D', skeletonHi: '#2C2C39', onPrimary: '#FFFFFF',
  statusBar: 'light-content',
  // الظلال على الخلفيات الداكنة: أخف وأعمق
  shadow: {
    ...SHADOW,
    soft: { ...SHADOW.soft, shadowColor: '#000', shadowOpacity: 0.3 },
    card: { ...SHADOW.card, shadowColor: '#000', shadowOpacity: 0.35 },
  },
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

  const value = useMemo(() => ({ isDark, colors, toggle, setTheme, pref }), [isDark, pref]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
export const TOKENS = { GRADIENTS, SHADOW, RADIUS, SPACE, TYPE, MOTION, SEMANTIC, LIGHT, DARK };
