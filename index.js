const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const INSTANCE_ID = process.env.INSTANCE_ID || 'instance163781';
const TOKEN = process.env.USERINTERMIX_TOKEN || 'p28vl0vdx1g74qyd';

let registrations = []; 
let userState = {}; 
let botConfig = {
    statusNote: "المعهد مفتوح ونستقبلكم من 8 صباحاً لـ 8 مساءً.",
    sleepResponse: "المدير نائم حالياً، لكن يمكنك البدء بالتسجيل وسأحفظ بياناتك!",
    aiKnowledge: "العلامات تصدر يوم الخميس. دورة البرمجة تبدأ الشهر القادم.",
    isSleepMode: false // مفتاح وضع النوم
};

app.get('/api/system', (req, res) => res.json({ registrations, botConfig }));
app.post('/api/update-config', (req, res) => {
    botConfig = { ...botConfig, ...req.body };
    res.json({ success: true });
});

app.post('/webhook', async (req, res) => {
    const data = req.body.data || req.body;
    if (!data || data.fromMe || !data.body) return res.send('ok');

    const from = data.from;
    const text = data.body.trim().toLowerCase();

    // --- أولاً: منطق "الذكاء" في تحديد النية ---
    
    // 1. إذا كان المستخدم في منتصف عملية التسجيل (لا يوقفه وضع النوم)
    if (userState[from]) {
        return handleRegistration(from, text);
    }

    // 2. إذا طلب المستخدم "تسجيل" (مسموح دائماً إلا لو عطلته يدوياً)
    if (text.includes("تسجيل") || text.includes("سجلني")) {
        userState[from] = { step: 1 };
        return sendWH(from, "مرحباً بك في نظام التسجيل الذكي 🎓\nما هو اسمك الثلاثي؟");
    }

    // 3. إذا كان وضع النوم مفعلاً (يرد بالرسالة الذكية لكن لا يقطع الخدمة)
    if (botConfig.isSleepMode) {
        // إذا سأل عن معلومة موجودة في بنك المعلومات وهو في وضع النوم
        if (text.includes("علامة") || text.includes("موعد") || text.includes("متى")) {
            await sendWH(from, botConfig.aiKnowledge);
            return sendWH(from, "*(تنبيه: المدير نائم حالياً، هذه إجابة تلقائية)*");
        }
        return sendWH(from, botConfig.sleepResponse);
    }

    // 4. الرد الذكي العام (AI Knowledge)
    if (isAskingGeneralQuestion(text)) {
        return sendWH(from, botConfig.aiKnowledge);
    }

    // 5. الرد الافتراضي
    if (!from.includes('@g.us')) {
        sendWH(from, botConfig.statusNote + "\n\nيمكنك كتابة 'تسجيل' للبدء.");
    }
    
    res.send('ok');
});

// دالة لمعرفة هل السؤال عام
function isAskingGeneralQuestion(text) {
    const keywords = ["متى", "اين", "كيف", "علامات", "دوام", "موقع", "دورة"];
    return keywords.some(k => text.includes(k));
}

// دالة معالجة التسجيل المتسلسل
async function handleRegistration(from, text) {
    let state = userState[from];
    switch(state.step) {
        case 1: state.name = text; state.step = 2; await sendWH(from, "تاريخ ميلادك؟"); break;
        case 2: state.dob = text; state.step = 3; await sendWH(from, "مكان السكن؟"); break;
        case 3: state.address = text; state.step = 4; await sendWH(from, "العمل والدراسة؟"); break;
        case 4: state.job = text; state.step = 5; await sendWH(from, "تفضيل الدوام:\n1. قبل 1:00\n2. بعد 1:00"); break;
        case 5: 
            state.timePref = (text === "1") ? "صباحي" : "مسائي";
            state.phone = from;
            state.regDate = new Date().toLocaleString('ar-EG');
            registrations.push(state);
            delete userState[from];
            await sendWH(from, "✅ تم تسجيلك بنجاح رغم أننا خارج أوقات الدوام! سيتم التواصل معك."); 
            break;
    }
}

async function sendWH(to, body) {
    try {
        await axios.post(`https://api.ultramsg.com/${INSTANCE_ID}/messages/chat`, { token: TOKEN, to, body });
    } catch (e) { console.log("API Error"); }
}

app.listen(process.env.PORT || 3000);
