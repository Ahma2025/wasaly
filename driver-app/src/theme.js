// نظام تصميم موحّد لتطبيق السائق — كل الشاشات تستورد ألوانها ومقاساتها من هنا فقط
// (متوافق مع لغة التصميم المشتركة لتطبيقات وصلّي الأربعة: D:\wasaly-study\DESIGN.md)
import { Platform } from 'react-native';

export const COLORS = {
  // الهوية
  primary: '#FF6B00', brandDeep: '#F53B57', brandSoft: '#FFF3EA',
  // الحبر
  text: '#14142B', sub: '#4E4B66', gray: '#8A8FA3', faint: '#A0A3B5',
  // الأسطح
  bg: '#F6F7FB', card: '#FFFFFF', line: '#ECEEF4', elevated: '#FBFBFD',
  // الدلالات
  green: '#1DB954', greenSoft: '#E6F8EC', greenDeep: '#0F7A3A', greenLine: '#BDEFCD',
  red: '#F04438', redSoft: '#FEECEB', redDeep: '#B42318',
  blue: '#2E90FA', blueSoft: '#EAF3FF', blueDeep: '#175CD3',
  amber: '#FFB020', amberSoft: '#FFF6E0', amberDeep: '#9A5B00',
  purple: '#7B61FF', purpleSoft: '#F0EDFF', purpleDeep: '#5B3FD9',
  coral: '#F53B57', coralSoft: '#FEECEF', coralDeep: '#C01D3A',
  teal: '#0E9F9A', tealSoft: '#E3F7F6', tealDeep: '#0B6E6A',
  brandText: '#C24E00',
  star: '#FFB800',
  inputBg: '#F6F7FB', sec: '#FFF3EA', tint: '#FFE9D9', tintLine: '#FFD6BA',
  skeleton: '#ECEEF4', skeletonHi: '#F7F8FB',
  white: '#FFFFFF',
  ink: '#14142B', inkSoft: '#2A2A40',
};

export const GRADIENTS = {
  brand:  ['#FF9A2E', '#FF6B00', '#FF4D3D'],
  sunset: ['#FF8A00', '#FF5E3A', '#F53B57'],
  green:  ['#3BDB7E', '#1DB954', '#139A45'],
  gold:   ['#FFCE4D', '#FFB020', '#FF7A00'],
  dark:   ['#2A2A40', '#14142B'],
  night:  ['#1E1E2A', '#14142B', '#0B0B12'],
  danger: ['#FF6B5E', '#F04438'],
  sheen:  ['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)'],
  glass:  ['rgba(255,255,255,0.26)', 'rgba(255,255,255,0.10)'],
};

export const SHADOW = {
  soft:  { elevation: 2,  shadowColor: '#14142B', shadowOpacity: 0.06, shadowRadius: 8,  shadowOffset: { width: 0, height: 2 } },
  card:  { elevation: 6,  shadowColor: '#14142B', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
  float: { elevation: 12, shadowColor: '#FF6B00', shadowOpacity: 0.28, shadowRadius: 32, shadowOffset: { width: 0, height: 14 } },
  glow:  { elevation: 10, shadowColor: '#F53B57', shadowOpacity: 0.40, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  green: { elevation: 10, shadowColor: '#1DB954', shadowOpacity: 0.38, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  dark:  { elevation: 12, shadowColor: '#0B0B12', shadowOpacity: 0.30, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
};

// سلّم الزوايا (DESIGN.md: 10 / 14 / 18 / 24 / 32 / pill)
export const RADIUS = { xs: 10, sm: 14, md: 18, lg: 24, xl: 32, sheet: 28, pill: 999 };

// شبكة 4 نقاط
export const SPACE = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 40, gutter: 16 };

// سلّم الخطوط — لا letterSpacing على العربية أبداً
export const TYPE = {
  display: { fontSize: 30, fontWeight: '900' },
  h1: { fontSize: 24, fontWeight: '800' },
  h2: { fontSize: 20, fontWeight: '800' },
  h3: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '500' },
  caption: { fontSize: 12.5, fontWeight: '500' },
  micro: { fontSize: 11, fontWeight: '700' },
  money: { fontWeight: '800' },
};

// الحركة
export const MOTION = {
  micro: 150, standard: 250, emphasis: 400,
  spring: { damping: 16, stiffness: 200, mass: 1 },
  stagger: 50, maxStagger: 8,
};

// حدّ أدنى لمساحة اللمس (السائق يستخدم التطبيق أثناء الحركة)
export const HIT = 48;

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
