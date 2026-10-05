// نظام تصميم موحّد لتطبيق السائق — كل الشاشات تستورد ألوانها من هنا فقط
import { Platform } from 'react-native';
export const COLORS = {
  primary: '#FF6B00', brandDeep: '#F53B57',
  text: '#14142B', sub: '#6B7280', gray: '#8A90A0', faint: '#9AA0AE',
  bg: '#F4F5F9', card: '#FFFFFF', line: '#ECEEF3',
  green: '#25C26E', greenSoft: '#E8F8EF', greenDeep: '#137A43',
  red: '#FF3B30', redSoft: '#FFECEB',
  blue: '#2F80ED', blueSoft: '#EAF2FE',
  amber: '#F5A100', amberSoft: '#FFF5DD',
  purple: '#7B61FF', purpleSoft: '#F0EDFF',
  star: '#FFB800',
  inputBg: '#F6F7FB', sec: '#FFF6F1', tint: '#FFEDE2', tintLine: '#FFD9C2',
  skeleton: '#E9EBF1',
  white: '#FFFFFF',
};

export const GRADIENTS = {
  brand:  ['#FF9A2E', '#FF6B00', '#FF4D3D'],
  sunset: ['#FF8A1E', '#FB5A3C', '#F53B57'],
  green:  ['#38E07E', '#2FD673', '#1BA85B'],
  gold:   ['#FFCE4D', '#FFB800', '#FF7A00'],
  dark:   ['#2A2A40', '#14142B'],
  sheen:  ['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)'],
};

export const SHADOW = {
  soft:  { elevation: 3,  shadowColor: '#14142B', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 5 } },
  card:  { elevation: 7,  shadowColor: '#14142B', shadowOpacity: 0.10, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } },
  float: { elevation: 14, shadowColor: '#FF5E3A', shadowOpacity: 0.28, shadowRadius: 26, shadowOffset: { width: 0, height: 14 } },
  glow:  { elevation: 10, shadowColor: '#F53B57', shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  green: { elevation: 8,  shadowColor: '#25C26E', shadowOpacity: 0.40, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
};

// اتجاه الواجهة: التخطيط الأصلي ثابت LTR على كل الأجهزة (MainApplication.kt + App.js)،
// ونكتب اتجاه العربية صراحةً بهذه الأنماط حتى يبدو التطبيق متطابقاً على كل جهاز.
export const RTL = {
  row: { flexDirection: 'row-reverse', alignItems: 'center' },
  text: { textAlign: 'right', writingDirection: 'rtl' },
  start: { alignItems: 'flex-end' },
};

// تفادي الكيبورد: iOS دائماً، وأندرويد 15+ (edge-to-edge مفروض مع targetSdk 36 فيتعطّل adjustResize)
export const KAV_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : (Platform.Version >= 35 ? 'height' : undefined);

// ارتفاع شريط التبويب العائم (تستخدمه الشاشات لحساب المسافة السفلية)
export const TAB_BAR_HEIGHT = 70;
