const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public')); // لتشغيل صفحة الويب

// إعدادات UltraMsg الخاصة بك
const INSTANCE_ID = 'instance163781';
const TOKEN = 'p28vl0vdx1g74qyd';

// إعدادات افتراضية يمكن تغييرها من لوحة التحكم (سأعلمك كيف لاحقاً)
let botSettings = {
    workStart: 8,
    workEnd: 20,
    sleepMessage: "مدير معهد الفتح نائم حالياً أو المعهد مغلق. ساعات العمل من 8 صباحاً حتى 8 مساءً. سنرد عليك فور تواجدنا.",
    isManualSleep: false
};

// مصفوفة لتخزين بيانات الطلاب مؤقتاً (يفضل ربطها بـ Database لاحقاً)
let registrations = [];

// دالة فحص الوقت
function isWorkTime() {
    if (botSettings.isManualSleep) return false;
    const hour = new Date().getHours() + 3; // تعديل التوقيت ليكون GMT+3
    return hour >= botSettings.workStart && hour < botSettings.workEnd;
}

// استقبال الرسائل من UltraMsg
app.post('/webhook', async (req, res) => {
    const data = req.body;
    
    if (data.event_type === 'message_create' && !data.data.fromMe) {
        const msg = data.data;
        const text = msg.body.toLowerCase();
        const from = msg.from; 
        let reply = "";

        // 1. حالة النوم/الإغلاق
        if (!isWorkTime()) {
            reply = botSettings.sleepMessage;
        } 
        // 2. طلبات التسجيل
        else if (text.includes("تسجيل") || text.includes("سجلني")) {
            reply = "أهلاً بك في معهد الفتح! يرجى كتابة (الاسم الثلاثي - التخصص) في رسالة واحدة وسنقوم بتسديد بياناتك قريباً.";
        }
        // 3. أسئلة التكنولوجيا
        else if (text.includes("تكنولوجيا") || text.includes("برمجة") || text.includes("كمبيوتر")) {
            reply = "نحن في معهد الفتح ندرّس: البرمجة، التصميم الجرافيكي، وصيانة الحاسوب. هل تود معرفة تفاصيل دورة معينة؟";
        }
        // 4. حفظ بيانات المسجلين (بسيط جداً)
        else if (text.split('-').length >= 2) {
            registrations.push({ phone: from, details: text, date: new Date() });
            reply = "تم استلام بياناتك بنجاح يا فادي (أو عزيزي الطالب). سيقوم المدير بمراجعتها قريباً.";
        }

        // إرسال الرد
        if (reply) {
            await axios.post(`https://api.ultramsg.com/${INSTANCE_ID}/messages/chat`, {
                token: TOKEN,
                to: from,
                body: reply
            });
        }
    }
    res.send('ok');
});

// API للوحة التحكم لجلب وتحديث الإعدادات والمسجلين
app.get('/api/settings', (req, res) => res.json({ botSettings, registrations }));
app.post('/api/settings', (req, res) => {
    botSettings = { ...botSettings, ...req.body };
    res.json({ status: 'success' });
});

app.listen(process.env.PORT || 3000, () => console.log('Server started!'));