import { registerRootComponent } from 'expo';
import * as ExpoSplash from 'expo-splash-screen';
import App from './App';

// Hide the native splash immediately so our custom animated splash shows
ExpoSplash.preventAutoHideAsync().catch(() => {});
ExpoSplash.hideAsync().catch(() => {});

registerRootComponent(App);
