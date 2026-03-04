const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const INSTANCE_ID = process.env.INSTANCE_ID || 'instance163781';
const TOKEN = process.env.USERINTERMIX_TOKEN || 'p28vl0vdx1g74qyd';

let registrations = []; 
let userState = {}; 
let dailyWelcome = {}; // لحفظ الأرقام التي تلقت ترحيباً اليوم

let botConfig = {
    statusNote: "المعهد مفتوح حالياً. لمعلومات عن المعهد أرسل 'معلومات'. للتسجيل أرسل 'تسجيل'.",
    aiKnowledge: "اسم المدير: فادي علي الهندي\nالجمعية الداعمة: قطيع فاميلي فاونديشن\nرقم المدير: 00963959809700\nالدورات: ICDL، برمجة، تصميم، إنجليزي، تاسع، بكالوريا\nالتكلفة: المعهد مجاني بالكامل",
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
    if (!data || data.fromMe || !data.body) return res.send('ok');

    const from = data.from;
    const text = data.body.trim();
    const lowerText = text.toLowerCase();
    const today = new Date().toDateString();

    // 1. إرسال الرسالة الترحيبية مرة واحدة فقط في اليوم
    if (dailyWelcome[from] !== today && !userState[from]) {
        dailyWelcome[from] = today;
        await sendWH(from, `مرحباً بك في معهد الفتح الخيري 🎓\n${botConfig.statusNote}`);
        return res.send('ok');
    }

    // 2. إذا كان الطالب في مرحلة التسجيل
    if (userState[from]) {
        return handleRegistration(from, text);
    }

    // 3. طلب التسجيل
    if (lowerText === "تسجيل") {
        if (registrations.find(r => r.phone === from)) {
            return sendWH(from, "أنت مسجل بالفعل لدينا.");
        }
        userState[from] = { step: 1 };
        return sendWH(from, "نبدأ إجراءات التسجيل. يرجى إرسال *الاسم الثلاثي* حصراً:");
    }

    // 4. طلب معلومات المعهد
    if (lowerText === "معلومات") {
        return sendWH(from, botConfig.aiKnowledge);
    }

    // 5. البحث الذكي في بنك المعلومات (سطر بسطر)
    const infoLines = botConfig.aiKnowledge.split('\n');
    for (let line of infoLines) {
        const keywords = line.split(' ')[0].replace(':', ''); // يأخذ أول كلمة كمفتاح
        if (text.includes(keywords) || (line.toLowerCase().includes(lowerText) && text.length > 3)) {
            return sendWH(from, line);
        }
    }

    res.send('ok');
});

async function handleRegistration(from, text) {
    let state = userState[from];
    try {
        switch(state.step) {
            case 1: // التحقق من الاسم الثلاثي
                const nameParts = text.trim().split(/\s+/);
                if (nameParts.length < 3) {
                    return sendWH(from, "⚠️ عذراً، يجب إرسال الاسم الثلاثي (الاسم، الأب، الكنية). يرجى المحاولة مرة أخرى:");
                }
                state.name = text; state.step = 2;
                await sendWH(from, "جميل. الآن أرسل *سنة التولد* فقط (مثال: 2005):");
                break;

            case 2: // حساب العمر تلقائياً
                const year = parseInt(text);
                if (isNaN(year) || year < 1950 || year > 2024) {
                    return sendWH(from, "⚠️ يرجى إرسال سنة ميلاد صحيحة (أرقام فقط):");
                }
                state.birthYear = year;
                state.age = new Date().getFullYear() - year;
                state.step = 3;
                await sendWH(from, "ما هو عملك الحالي؟");
                break;

            case 3:
                state.job = text; state.step = 4;
                await sendWH(from, "ما هي دراستك الحالية؟");
                break;

            case 4:
                state.study = text;
                state.phone = from.split('@')[0]; // أخذ الرقم تلقائياً
                state.regDate = new Date().toLocaleString('ar-EG');
                
                registrations.push({...state});
                delete userState[from];
                await sendWH(from, `✅ تم تسجيلك بنجاح!\nالاسم: ${state.name}\nالعمر: ${state.age}\nسنتواصل معك عبر رقمك: ${state.phone}`);
                break;
        }
    } catch (e) { delete userState[from]; }
}

async function sendWH(to, body) {
    try {
        await axios.post(`https://api.ultramsg.com/${INSTANCE_ID}/messages/chat`, {
            token: TOKEN, to, body
        });
    } catch (e) { console.log("Error"); }
}

app.listen(process.env.PORT || 3000);
