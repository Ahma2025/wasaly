import { registerRootComponent } from 'expo';
import * as ExpoSplash from 'expo-splash-screen';
import App from './App';

// يبقى السبلاش الأصلي ظاهراً حتى تُحمَّل الخطوط وتُرسم أول شاشة (يُخفى من App.js)
ExpoSplash.preventAutoHideAsync().catch(() => {});

registerRootComponent(App);
