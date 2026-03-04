const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const INSTANCE_ID = process.env.INSTANCE_ID || 'instance163781';
const TOKEN = process.env.USERINTERMIX_TOKEN || 'p28vl0vdx1g74qyd';

// تخزين البيانات (يفضل ربط MongoDB لاحقاً للبيانات الدائمة)
let registrations = []; 
let userState = {}; // لتتبع في أي سؤال وصل الطالب
let botConfig = {
    workStart: 8,
    workEnd: 20,
    isManualSleep: false,
    aiCommand: "المعهد مغلق حالياً، نرجو المراسلة لاحقاً.",
    customNote: "العلامات يوم الخميس"
};

app.get('/api/admin', (req, res) => res.json({ registrations, botConfig }));

app.post('/api/config', (req, res) => {
    botConfig = { ...botConfig, ...req.body };
    res.json({ status: 'success' });
});

app.post('/webhook', async (req, res) => {
    const data = req.body.data || req.body;
    if (!data || data.fromMe || !data.body) return res.send('ok');

    const from = data.from;
    const text = data.body.trim();
    const hour = new Date().getUTCHours() + 3;

    // 1. فحص وضع الإغلاق أو النوم
    if (botConfig.isManualSleep || hour < botConfig.workStart || hour >= botConfig.workEnd) {
        return sendWH(from, botConfig.aiCommand);
    }

    // 2. منطق الأسئلة الذكية (العلامات مثلاً)
    if (text.includes("علامة") || text.includes("نتيجتي")) {
        return sendWH(from, botConfig.customNote);
    }

    // 3. نظام التسجيل المتسلسل
    if (text.toLowerCase() === "تسجيل") {
        if (registrations.find(r => r.phone === from)) {
            return sendWH(from, "عذراً، هذا الرقم مسجل مسبقاً في المنظومة باسم: " + registrations.find(r => r.phone === from).name);
        }
        userState[from] = { step: 1 };
        return sendWH(from, "أهلاً بك في معهد الفتح. لنبدأ التسجيل، ما هو اسمك الثلاثي؟");
    }

    if (userState[from]) {
        let state = userState[from];
        switch(state.step) {
            case 1: 
                state.name = text; state.step = 2;
                sendWH(from, `أهلاً ${text}، ما هو تاريخ تولدك؟`); break;
            case 2:
                state.dob = text; state.step = 3;
                sendWH(from, "أين تسكن حالياً؟"); break;
            case 3:
                state.address = text; state.step = 4;
                sendWH(from, "ما هو عملك الحالي ودراستك؟"); break;
            case 4:
                state.job = text; state.step = 5;
                sendWH(from, "تفضيل وقت الدوام: (1) قبل الساعة 1:00 أو (2) بعد الساعة 1:00؟"); break;
            case 5:
                state.timePref = (text === "1") ? "قبل الواحدة" : "بعد الواحدة";
                state.phone = from;
                state.regDate = new Date().toLocaleString('ar-EG');
                registrations.push(state);
                delete userState[from];
                sendWH(from, "تم تسجيلك بنجاح! سيتم التواصل معك قريباً."); break;
        }
    }
    res.send('ok');
});

async function sendWH(to, body) {
    try {
        await axios.post(`https://api.ultramsg.com/${INSTANCE_ID}/messages/chat`, { token: TOKEN, to, body });
    } catch (e) { console.log("Error sending"); }
}

app.listen(process.env.PORT || 3000);
