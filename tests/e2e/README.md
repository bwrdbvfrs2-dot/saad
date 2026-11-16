# فحص قبل النشر

يفتح البرنامج على نسخة تجريبية من Firebase (محاكي محلي، **مو بيانات المحل الحقيقية**) ويتأكد:
- فاتورة جديدة تنحفظ والدفعة توصل الصندوق.
- فحص التكامل مطابق (الصناديق والموردين والمخزون).
- التقرير اليومي يطلع.
- كل الشاشات تفتح بدون أخطاء لكل الأدوار (مدير، محاسب، كاشير، خياط).

يشتغل تلقائياً على GitHub مع كل طلب دمج (`.github/workflows/checks.yml`).

تشغيله محلياً:
```
cd tests/e2e && npm install && npx playwright install chromium
cp ../../firestore.rules . && npx firebase-tools@13 emulators:start --only auth,firestore --project msar-ac08c &
npm run setup && npm run smoke
```
