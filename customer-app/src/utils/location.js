import * as Location from 'expo-location';

/*
  موقع الزبون بسرعة: آخر موقع معروف (لو حديث) أو تحديد جديد بمهلة قصيرة.
  ask=true يطلب الإذن؛ وإلا يستخدم الإذن الموجود فقط (بدون نافذة مزعجة).
  يرجّع { loc } أو { denied, canAskAgain } أو { error }
*/
export async function fastLocation({ ask = false, timeoutMs = 2500, maxAgeMs = 10 * 60 * 1000 } = {}) {
  try {
    const perm = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return { denied: true, canAskAgain: perm.canAskAgain };
    const last = await Location.getLastKnownPositionAsync({ maxAge: maxAgeMs }).catch(() => null);
    const loc = last || await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise(res => setTimeout(() => res(null), timeoutMs)),
    ]);
    if (!loc) return { error: true, timeout: true };
    return { loc: { lat: loc.coords.latitude, lng: loc.coords.longitude } };
  } catch { return { error: true }; }
}

// موقع الزبون بدون طلب إذن (فقط لو مسموح مسبقاً) — null لو مش متاح
export async function quietLocation() {
  const r = await fastLocation({ ask: false });
  return r.loc || null;
}
