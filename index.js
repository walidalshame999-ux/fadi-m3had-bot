const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const INSTANCE_ID = process.env.INSTANCE_ID || 'instance163781';
const TOKEN = process.env.USERINTERMIX_TOKEN || 'p28vl0vdx1g74qyd';

let registrations = []; 
let userState = {}; 
let dailyWelcome = {}; 

let botConfig = {
    welcomeMessage: "للمعلومات أرسل كلمة *معلومات*.\nللتسجيل أرسل كلمة *تسجيل*.",
    announcement: "", // لوحة الطوارئ الذكية
    aiKnowledge: "المدير: فادي علي الهندي\nالجمعية: قطيع فاميلي فاونديشن\nالتواصل: 00963959809700\nالدورات: ICDL، برمجة، تصميم، محادثة إنجليزية، تاسع، بكالوريا\nالتكلفة: المعهد مجاني بالكامل",
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

    const registeredUser = registrations.find(r => r.phone === from);

    // 1. أولوية قصوى: إكمال التسجيل إذا كان المستخدم في منتصف العملية
    if (userState[from]) {
        return handleRegistration(from, text);
    }

    // --- منطق الذكاء الاصطناعي في تحليل الرسالة (AI Intent Parsing) ---
    
    const isRegisterRequest = lowerText.includes("تسجيل") || lowerText.includes("سجلني");
    const isInfoRequest = lowerText.includes("معلومات") || lowerText.includes("تفاصيل");
    const isGreeting = ["سلام", "مرحبا", "هلا", "مرحباً", "السلام عليكم", "مساء الخير", "صباح الخير"].some(w => lowerText.includes(w));
    
    // 2. معالجة طلب التسجيل بذكاء
    if (isRegisterRequest) {
        // الذكاء الاصطناعي يقرأ لوحة الطوارئ: هل هناك منع للتسجيل؟
        const ann = botConfig.announcement.toLowerCase();
        if (ann.includes("لا يوجد تسجيل") || ann.includes("مغلق") || ann.includes("توقف") || !botConfig.regToggle) {
            return sendWH(from, `🤖 *مرحباً بك!*\nنعتذر منك، ولكن حسب تعليمات الإدارة:\n"${botConfig.announcement || 'التسجيل مغلق حالياً.'}"\n\nيرجى المحاولة لاحقاً.`);
        }

        if (registeredUser) {
            return sendWH(from, `🤖 أهلاً بك يا *${registeredUser.name.split(' ')[0]}*!\nلقد قمت بالتسجيل مسبقاً، ولا يمكن تسجيل شخصين من نفس الرقم لحماية البيانات.`);
        }
        
        userState[from] = { step: 1 };
        let msg = "📝 *نظام التسجيل الذكي | معهد الفتح*\n\nيرجى إرسال *الاسم الثلاثي* حصراً (الاسم، الأب، الكنية):";
        return sendWH(from, msg);
    }

    // 3. معالجة طلب المعلومات
    if (isInfoRequest) {
        let prefix = registeredUser ? `أهلاً بك يا *${registeredUser.name.split(' ')[0]}*، ` : "";
        let info = botConfig.announcement ? `📢 *إعلان هام:* ${botConfig.announcement}\n\n` : "";
        info += `🏢 ${prefix}إليك *معلومات المعهد:*\n\n` + botConfig.aiKnowledge;
        return sendWH(from, info);
    }

    // 4. الذكاء الاصطناعي يبحث في بنك المعلومات عن إجابة محددة
    const infoLines = botConfig.aiKnowledge.split('\n');
    for (let line of infoLines) {
        const keyword = line.split(':')[0].trim();
        if (lowerText.includes(keyword) && keyword.length > 2) {
            let prefix = registeredUser ? `يا *${registeredUser.name.split(' ')[0]}*، ` : "";
            return sendWH(from, `💡 ${prefix}بخصوص استفسارك:\n${line}`);
        }
    }

    // 5. الرد على التحية (مرة واحدة يومياً لتجنب الإزعاج)
    if (isGreeting && dailyWelcome[from] !== today) {
        dailyWelcome[from] = today; 
        let prefix = registeredUser ? `أهلاً بك من جديد يا *${registeredUser.name.split(' ')[0]}*! 🌹\n` : `مرحباً بك في *معهد الفتح الخيري* 🎓\n`;
        let msg = prefix;
        if (botConfig.announcement) msg += `📢 *إعلان الإدارة:* ${botConfig.announcement}\n\n`;
        msg += botConfig.welcomeMessage;
        return sendWH(from, msg);
    }

    // إذا لم تكن الرسالة أي شيء مما سبق (مثل إرسال "شكرا")، يصمت البوت تماماً.
    res.send('ok');
});

// دالة التسجيل (صارمة وذكية)
async function handleRegistration(from, text) {
    let state = userState[from];
    try {
        switch(state.step) {
            case 1: 
                const nameParts = text.trim().split(/\s+/);
                if (nameParts.length < 3) {
                    return sendWH(from, "⚠️ *عذراً:*\nالنظام لا يقبل إلا *الاسم الثلاثي* لضمان الدقة.\nيرجى إرسال اسمك الثلاثي كاملاً:");
                }
                state.name = text; state.step = 2;
                await sendWH(from, "✨ *ممتاز!*\nالآن أرسل *سنة التولد* الخاص بك (أرقام فقط، مثال: 2008):");
                break;

            case 2: 
                const year = parseInt(text);
                const currentYear = new Date().getFullYear();
                if (isNaN(year) || year < 1950 || year > currentYear) {
                    return sendWH(from, "⚠️ *تنبيه:*\nيرجى إرسال *سنة التولد* بشكل صحيح (أرقام فقط):");
                }
                const age = currentYear - year;
                if (age < 11) {
                    await sendWH(from, "🛑 *نعتذر منك:*\nقوانين المعهد تقتصر على الطلاب الذين تتجاوز أعمارهم *11 عاماً*.\nنتمنى لك التوفيق!");
                    delete userState[from]; 
                    return;
                }
                state.birthYear = year;
                state.age = age;
                state.step = 3;
                await sendWH(from, "🏢 ما هو *عملك الحالي*؟");
                break;

            case 3:
                state.job = text; state.step = 4;
                await sendWH(from, "📚 ما هي *دراستك الحالية* أو آخر تحصيل علمي لك؟");
                break;

            case 4:
                state.study = text;
                state.phone = from; // سحب الرقم لمعالجة التزامن بشكل سليم
                state.regDate = new Date().toLocaleString('ar-EG');
                
                registrations.push({...state});
                delete userState[from]; 
                
                const successMsg = `✅ *تم التسجيل بنجاح!*\n\n` +
                                   `👤 *الاسم:* ${state.name}\n` +
                                   `🎂 *العمر:* ${state.age} سنة\n\n` +
                                   `سعداء بانضمامك يا *${state.name.split(' ')[0]}*! 🌹\nلن نقوم بإزعاجك برسائل تلقائية، سيتم التواصل معك فقط عند الضرورة.`;
                await sendWH(from, successMsg);
                break;
        }
    } catch (e) { 
        console.error("Registration Error", e);
        delete userState[from]; 
    }
}

async function sendWH(to, body) {
    try {
        await axios.post(`https://api.ultramsg.com/${INSTANCE_ID}/messages/chat`, {
            token: TOKEN, to, body
        });
    } catch (e) { console.log("API Error"); }
}

app.listen(process.env.PORT || 3000, () => console.log("AI Server Running"));
