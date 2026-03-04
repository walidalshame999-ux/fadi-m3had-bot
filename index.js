const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const INSTANCE_ID = process.env.INSTANCE_ID || 'instance163781';
const TOKEN = process.env.USERINTERMIX_TOKEN || 'p28vl0vdx1g74qyd';

// تخزين البيانات والإعدادات
let registrations = []; 
let userState = {}; 
let botConfig = {
    statusNote: "المعهد مفتوح حالياً ونستقبل طلباتكم من الساعة 8:00 صباحاً حتى 8:00 مساءً.",
    sleepResponse: "عذراً، المدير نائم الآن والمعهد مغلق. نرجو التواصل في الصباح.",
    aiKnowledge: "العلامات ستصدر يوم الخميس القادم لجميع الطلاب.",
    regToggle: true // تفعيل أو تعطيل التسجيل
};

// واجهة برمجة للوحة التحكم
app.get('/api/system', (req, res) => res.json({ registrations, botConfig }));

app.post('/api/update-config', (req, res) => {
    botConfig = { ...botConfig, ...req.body };
    res.json({ success: true });
});

app.post('/webhook', async (req, res) => {
    const data = req.body.data || req.body;
    if (!data || data.fromMe || !data.body) return res.send('ok');

    const from = data.from;
    const text = data.body.trim();
    const hour = new Date().getUTCHours() + 3; // توقيتك المحلي

    // 1. منطق الرد في وقت المتأخر (النوم) - تلقائياً بين 12 و 7 صباحاً
    if (hour >= 0 && hour < 7) {
        return sendWH(from, botConfig.sleepResponse);
    }

    // 2. فحص الكلمات المفتاحية الذكية (مثل علامات، مواعيد)
    if (text.includes("علامة") || text.includes("موعد") || text.includes("وقت")) {
        return sendWH(from, botConfig.aiKnowledge);
    }

    // 3. نظام التسجيل الاحترافي (سؤال بسؤال)
    if (text === "تسجيل") {
        if (!botConfig.regToggle) return sendWH(from, "عذراً، التسجيل مغلق حالياً بقرار من الإدارة.");
        if (registrations.find(r => r.phone === from)) return sendWH(from, "أنت مسجل بالفعل لدينا.");
        
        userState[from] = { step: 1 };
        return sendWH(from, "مرحباً بك في معهد الفتح 🎓\nيرجى كتابة *الاسم الثلاثي*:");
    }

    // معالجة خطوات التسجيل
    if (userState[from]) {
        let state = userState[from];
        switch(state.step) {
            case 1: state.name = text; state.step = 2; sendWH(from, "تاريخ التولد (اليوم/الشهر/السنة):"); break;
            case 2: state.dob = text; state.step = 3; sendWH(from, "مكان السكن الحالي:"); break;
            case 3: state.address = text; state.step = 4; sendWH(from, "العمل الحالي والتحصيل الدراسي:"); break;
            case 4: state.job = text; state.step = 5; sendWH(from, "تفضيل الدوام:\n1. قبل الساعة 1:00 ظهرأ\n2. بعد الساعة 1:00 ظهراً"); break;
            case 5: 
                state.timePref = (text === "1") ? "صباحي" : "مسائي";
                state.phone = from;
                state.regDate = new Date().toLocaleString('ar-EG');
                registrations.push(state);
                delete userState[from];
                sendWH(from, "✅ تم تسجيل بياناتك بنجاح. سنقوم بالاتصال بك قريباً."); 
                break;
        }
    } else {
        // رد افتراضي إذا لم يفهم البوت (اختياري)
        if (!from.includes('@g.us')) {
            sendWH(from, botConfig.statusNote + "\n\nللتسجيل أرسل كلمة 'تسجيل'.");
        }
    }
    res.send('ok');
});

async function sendWH(to, body) {
    try {
        await axios.post(`https://api.ultramsg.com/${INSTANCE_ID}/messages/chat`, { token: TOKEN, to, body });
    } catch (e) { console.log("Error API"); }
}

app.listen(process.env.PORT || 3000);
