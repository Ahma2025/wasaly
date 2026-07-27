// مهمة تتبّع الموقع في الخلفية — تعمل حتى والتطبيق مسكّر أو السائق بتطبيق آخر
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LOCATION_TASK = 'wasaly-driver-location';
const API = 'https://burger-app-production.up.railway.app/api';

// تُعرّف مرة واحدة عند إقلاع التطبيق (تُستورد من App.js)
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data;
  const loc = locations && locations[locations.length - 1];
  if (!loc) return;
  const { latitude: lat, longitude: lng } = loc.coords;
  try {
    const token = await AsyncStorage.getItem('driver_token');
    if (!token) return;
    // السيرفر نفسه يبعث الموقع للزبون عبر السوكِت إن وُجد طلب فعّال
    await fetch(`${API}/drivers/location`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lat, lng }),
    });
  } catch (e) { /* تجاهل أخطاء الشبكة المؤقتة في الخلفية */ }
});
