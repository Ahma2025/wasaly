import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// الألوان الثابتة عبر الوضعين
const BRAND = '#FF6B00';

const LIGHT = {
  mode: 'light', primary: BRAND,
  bg: '#F2F2F7', card: '#FFFFFF', elev: '#FFFFFF',
  text: '#1A1A2E', sub: '#6B7280', faint: '#8E8E93', gray: '#8E8E93',
  border: '#ECECEF', line: '#F0F0F3',
  sec: '#FFF8F4', tint: '#FFF0E8', inputBg: '#FAFAFB',
  white: '#FFFFFF', danger: '#FF3B30', green: '#34C759', star: '#FFB800',
  divider: '#EEEEF2',
};

const DARK = {
  mode: 'dark', primary: BRAND,
  bg: '#0E0E12', card: '#1A1A20', elev: '#22222A',
  text: '#F2F2F5', sub: '#A0A0AB', faint: '#8A8A95', gray: '#9A9AA5',
  border: '#2C2C34', line: '#26262E',
  sec: '#241B12', tint: '#2A1D12', inputBg: '#23232B',
  white: '#1A1A20', danger: '#FF5A4E', green: '#34C759', star: '#FFB800',
  divider: '#1E1E26',
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
