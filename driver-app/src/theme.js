// نظام تصميم موحّد لتطبيق السائق (ثابت — بدون Context)
export const COLORS = {
  primary: '#FF6B00', brandDeep: '#F53B57',
  text: '#14142B', sub: '#6B7280', gray: '#8A90A0', faint: '#9AA0AE',
  bg: '#F4F5F9', card: '#FFFFFF', line: '#ECEEF3',
  green: '#25C26E', red: '#FF3B30', star: '#FFB800',
  inputBg: '#F6F7FB', sec: '#FFF6F1', tint: '#FFEDE2',
};

export const GRADIENTS = {
  brand:  ['#FF9A2E', '#FF6B00', '#FF4D3D'],
  sunset: ['#FF8A1E', '#FB5A3C', '#F53B57'],
  green:  ['#38E07E', '#2FD673', '#1BA85B'],
  gold:   ['#FFCE4D', '#FFB800', '#FF7A00'],
  sheen:  ['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)'],
};

export const SHADOW = {
  soft:  { elevation: 3,  shadowColor: '#14142B', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 5 } },
  card:  { elevation: 7,  shadowColor: '#14142B', shadowOpacity: 0.10, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } },
  float: { elevation: 14, shadowColor: '#FF5E3A', shadowOpacity: 0.28, shadowRadius: 26, shadowOffset: { width: 0, height: 14 } },
  glow:  { elevation: 10, shadowColor: '#F53B57', shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
};
