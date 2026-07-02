import { registerRootComponent } from 'expo';
import * as ExpoSplash from 'expo-splash-screen';
import App from './App';

ExpoSplash.preventAutoHideAsync().catch(() => {});
ExpoSplash.hideAsync().catch(() => {});

registerRootComponent(App);
