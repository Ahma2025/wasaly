# وصلّي - Wasaly 🚀

منصة توصيل طعام متكاملة تنافس طلبات - مبنية بـ Node.js + React Native + React.js

## التطبيقات الأربعة

| التطبيق | المسار | المنفذ |
|---------|--------|--------|
| تطبيق الزبون | `customer-app/` | Expo |
| بوابة المطعم | `restaurant-portal/` | 3002 |
| تطبيق المندوب | `driver-app/` | Expo |
| لوحة الإدارة | `admin-dashboard/` | 3001 |
| الباك اند | `backend/` | 5000 |

## التشغيل السريع بـ Docker

```bash
cp backend/.env.example backend/.env
# عدّل قيم .env
docker-compose up -d
```

## التشغيل اليدوي

### الباك اند
```bash
cd backend
npm install
createdb wasaly
psql wasaly < config/schema.sql
cp .env.example .env
npm run dev
```

### لوحة الإدارة
```bash
cd admin-dashboard
npm install
npm run dev     # http://localhost:3001
```

### بوابة المطعم
```bash
cd restaurant-portal
npm install
npm run dev     # http://localhost:3002
```

### تطبيق الزبون / المندوب
```bash
cd customer-app   # أو driver-app
npm install
npx expo start
```

## المميزات الرئيسية

- ✅ تتبع الطلبات في الوقت الفعلي (Socket.io)
- ✅ نظام نقاط الولاء (Bronze/Silver/Gold/Platinum)
- ✅ كوبونات خصم متعددة الأنواع
- ✅ دفع بـ Stripe + محفظة إلكترونية
- ✅ إشعارات Push بـ Firebase FCM
- ✅ OTP بـ Twilio
- ✅ خرائط تفاعلية مع تتبع السائق
- ✅ لوحة تحكم بإحصائيات متقدمة
- ✅ واجهة عربية كاملة RTL
