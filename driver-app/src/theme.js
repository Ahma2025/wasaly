// نظام تصميم موحّد لتطبيق السائق (ثابت — بدون Context)
export const COLORS = {
  primary: '#FF6B00', brandDeep: '#F53B57',
  text: '#14142B', sub: '#6B7280', gray: '#8A90A0', faint: '#9AA0AE',
  bg: '#F4F5F9', card: '#FFFFFF', line: '#ECEEF3',
  green: '#25C26E', red: '#FF3B30', star: '#FFB800',
  inputBg: '#F6F7FB', sec: '#FFF6F1', tint: '#FFEDE2',
};

export const GRADIENTS = {
  brand:  ['#FF8A00', '#FF5E3A'],
  sunset: ['#FF8A00', '#FF5E3A', '#F53B57'],
  green:  ['#2FD673', '#1BA85B'],
  gold:   ['#FFB800', '#FF7A00'],
};

export const SHADOW = {
  soft:  { elevation: 4,  shadowColor: '#14142B', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  card:  { elevation: 6,  shadowColor: '#14142B', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  float: { elevation: 12, shadowColor: '#FF6B00', shadowOpacity: 0.30, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
};
