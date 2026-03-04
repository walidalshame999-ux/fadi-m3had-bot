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
    isSleepMode: false,
    regToggle: true
};

app.get('/api/system', (req, res) => res.json({ registrations, botConfig }));
app.post('/api/update-config', (req, res) => {
    botConfig = { ...botConfig, ...req.body };
    res.json({ success: true });
});

app.post('/webhook', async (req, res) => {
    const data = req.body.data || req.body;
    // تجاهل الرسائل الصادرة من البوت أو الفارغة تماماً
    if (!data || data.fromMe || !data.body) return res.send('ok');

    const from = data.from;
    const text = data.body.trim();
    const lowerText = text.toLowerCase();

    // 1. إذا كان الطالب في مرحلة إدخال البيانات (محادثة التسجيل)
    if (userState[from]) {
        return handleRegistration(from, text);
    }

    // 2. إذا طلب الطالب التسجيل لأول مرة
    if (lowerText === "تسجيل" || lowerText === "سجلني") {
        if (!botConfig.regToggle) return sendWH(from, "عذراً، التسجيل مغلق حالياً بقرار من الإدارة.");
        
        // التحقق إذا كان مسجلاً مسبقاً لمنع التكرار
        if (registrations.find(r => r.phone === from)) {
            return sendWH(from, "أنت مسجل بالفعل في نظام المعهد، لا داعي للتسجيل مرة أخرى.");
        }
        
        userState[from] = { step: 1 };
        return sendWH(from, "مرحباً بك في نظام التسجيل 🎓\nيرجى كتابة *الاسم الثلاثي*:");
    }

    // 3. الرد الذكي فقط إذا سأل الطالب (لا يرسل من تلقاء نفسه)
    if (isAskingGeneralQuestion(lowerText)) {
        // إذا كان وضع النوم مفعل
        if (botConfig.isSleepMode) {
            await sendWH(from, botConfig.aiKnowledge);
            return sendWH(from, "*(تنبيه: المدير نائم حالياً، هذه إجابة تلقائية)*");
        }
        return sendWH(from, botConfig.aiKnowledge);
    }

    // 4. إذا أرسل كلمة "مرحبا" أو سلام وهو مسجل، يرسل له حالة المعهد فقط مرة واحدة
    if (lowerText.includes("سلام") || lowerText.includes("مرحبا") || lowerText.includes("هلا")) {
        return sendWH(from, botConfig.statusNote);
    }

    res.send('ok');
});

// دالة تحليل الأسئلة
function isAskingGeneralQuestion(text) {
    const keywords = ["متى", "اين", "كيف", "علامات", "موعد", "موقع", "دورة", "نتيج"];
    return keywords.some(k => text.includes(k));
}

// دالة معالجة التسجيل (سؤال بسؤال)
async function handleRegistration(from, text) {
    let state = userState[from];
    
    try {
        switch(state.step) {
            case 1: 
                state.name = text; state.step = 2; 
                await sendWH(from, "شكراً لك. الآن أرسل *تاريخ ميلادك*:"); 
                break;
            case 2: 
                state.dob = text; state.step = 3; 
                await sendWH(from, "أين تسكن حالياً؟"); 
                break;
            case 3: 
                state.address = text; state.step = 4; 
                await sendWH(from, "ما هو عملك الحالي أو دراستك؟"); 
                break;
            case 4: 
                state.job = text; state.step = 5; 
                await sendWH(from, "تفضيل وقت الدوام:\n1. قبل الساعة 1:00\n2. بعد الساعة 1:00\n*(أرسل 1 أو 2)*"); 
                break;
            case 5: 
                state.timePref = (text === "1") ? "صباحي" : "مسائي";
                state.phone = from;
                state.regDate = new Date().toLocaleString('ar-EG');
                
                // حفظ البيانات وحذف الحالة فوراً لمنع التكرار
                registrations.push({...state}); 
                delete userState[from]; 
                
                await sendWH(from, "✅ تم تسجيل بياناتك بنجاح في معهد الفتح الخيري. لن نقوم بإزعاجك، سيتم التواصل معك عند الضرورة فقط."); 
                break;
        }
    } catch (e) {
        console.error("Error in registration flow:", e);
        delete userState[from]; // حذف الحالة في حال حدوث خطأ لمنع التعليق
    }
}

async function sendWH(to, body) {
    try {
        await axios.post(`https://api.ultramsg.com/${INSTANCE_ID}/messages/chat`, {
            token: TOKEN,
            to: to,
            body: body
        });
    } catch (e) { console.log("خطأ في API الإرسال"); }
}

app.listen(process.env.PORT || 3000);
