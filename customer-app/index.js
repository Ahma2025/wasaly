import { registerRootComponent } from 'expo';
import * as ExpoSplash from 'expo-splash-screen';
import App from './App';

// نُبقي شاشة البداية الأصلية ظاهرة حتى تجهز الخطوط — App.js يخفيها بعدها (بدون وميض أبيض)
ExpoSplash.preventAutoHideAsync().catch(() => {});

registerRootComponent(App);
