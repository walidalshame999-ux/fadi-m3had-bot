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
    welcomeMessage: "للمعلومات أرسل كلمة *معلومات*.\nللتسجيل أرسل كلمة *تسجيل*.",
    announcement: "", // خانة الإعلانات الطارئة (مثال: لا يوجد تسجيل اليوم)
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

    // فحص ما إذا كان المستخدم مسجلاً مسبقاً (للذاكرة الدائمة)
    const registeredUser = registrations.find(r => r.phone === from);

    // 1. إذا كان الطالب في منتصف محادثة التسجيل (أولوية قصوى)
    if (userState[from]) {
        return handleRegistration(from, text);
    }

    // 2. طلب التسجيل
    if (lowerText === "تسجيل" || lowerText === "سجلني") {
        if (!botConfig.regToggle) return sendWH(from, "🛑 *عذراً*\nالتسجيل مغلق حالياً بقرار من الإدارة.");
        if (registeredUser) return sendWH(from, `أهلاً بك يا *${registeredUser.name.split(' ')[0]}*! 🌟\nأنت مسجل لدينا بالفعل، ولا يسمح بالتسجيل المزدوج من نفس الرقم.`);
        
        userState[from] = { step: 1 };
        let msg = "📝 *نظام التسجيل | معهد الفتح*\n\nيرجى إرسال *الاسم الثلاثي* حصراً (الاسم، الأب، الكنية):";
        if (botConfig.announcement) msg = `📢 *تنويه:* ${botConfig.announcement}\n\n` + msg;
        return sendWH(from, msg);
    }

    // 3. طلب المعلومات الشاملة
    if (lowerText === "معلومات") {
        let info = botConfig.announcement ? `📢 *إعلان:* ${botConfig.announcement}\n\n` : "";
        info += `🏢 *معلومات المعهد:*\n\n` + botConfig.aiKnowledge;
        return sendWH(from, info);
    }

    // 4. البحث الذكي في بنك المعلومات (يجيب فقط على السؤال)
    const infoLines = botConfig.aiKnowledge.split('\n');
    for (let line of infoLines) {
        const keywords = line.split(':')[0].trim();
        if (text.includes(keywords) || (line.toLowerCase().includes(lowerText) && text.length > 3)) {
            return sendWH(from, `💡 *بخصوص استفسارك:*\n${line}`);
        }
    }

    // 5. الترحيب الذكي (مرة واحدة يومياً، أو عند بدء الحديث)
    let isGreeting = ["سلام", "مرحبا", "هلا", "مرحباً", "السلام عليكم"].some(w => lowerText.includes(w));
    if (dailyWelcome[from] !== today || isGreeting) {
        dailyWelcome[from] = today; 

        if (registeredUser) {
            // ترحيب مخصص للشخص المسجل
            let msg = `أهلاً بك من جديد يا *${registeredUser.name.split(' ')[0]}*! 🌹\nكيف يمكنني مساعدتك اليوم؟\n\n(للاستعلام، أرسل سؤالك أو أرسل كلمة *معلومات*)`;
            if (botConfig.announcement) msg = `📢 *تنويه هام:* ${botConfig.announcement}\n\n` + msg;
            return sendWH(from, msg);
        } else {
            // ترحيب للشخص الجديد
            let msg = `مرحباً بك في *معهد الفتح الخيري* 🎓\n\n`;
            if (botConfig.announcement) msg += `📢 *إعلان الإدارة:* ${botConfig.announcement}\n\n`;
            msg += botConfig.welcomeMessage;
            return sendWH(from, msg);
        }
    }

    res.send('ok');
});

// دالة معالجة التسجيل الذكية
async function handleRegistration(from, text) {
    let state = userState[from];
    try {
        switch(state.step) {
            case 1: // فحص الاسم الثلاثي
                const nameParts = text.trim().split(/\s+/);
                if (nameParts.length < 3) {
                    return sendWH(from, "⚠️ *عذراً:*\nيجب إرسال *الاسم الثلاثي* بشكل كامل لتأكيد التسجيل.\nيرجى إعادة كتابة اسمك الثلاثي:");
                }
                state.name = text; state.step = 2;
                await sendWH(from, "✨ *ممتاز!*\nالآن أرسل *سنة التولد* الخاص بك (مثال: 2008):");
                break;

            case 2: // حساب العمر وفلترة الصغار
                const year = parseInt(text);
                const currentYear = new Date().getFullYear();
                if (isNaN(year) || year < 1950 || year > currentYear) {
                    return sendWH(from, "⚠️ *خطأ:*\nيرجى إرسال *سنة التولد* بشكل صحيح (أرقام فقط):");
                }
                const age = currentYear - year;
                if (age < 11) {
                    await sendWH(from, "🛑 *نعتذر منك:*\nمعهد الفتح مخصص للطلاب الذين تتجاوز أعمارهم *11 عاماً*.\nشكراً لتواصلك معنا، ونتمنى لك التوفيق!");
                    delete userState[from]; // إلغاء التسجيل
                    return;
                }
                state.birthYear = year;
                state.age = age;
                state.step = 3;
                await sendWH(from, "🏢 ما هو *عملك الحالي*؟");
                break;

            case 3:
                state.job = text; state.step = 4;
                await sendWH(from, "📚 ما هي *دراستك الحالية* أو آخر تحصيل علمي؟");
                break;

            case 4:
                state.study = text;
                state.phone = from; // سحب الرقم تلقائياً
                state.regDate = new Date().toLocaleString('ar-EG');
                
                // حفظ البيانات 
                registrations.push({...state});
                delete userState[from]; // إنهاء المحادثة ليصمت البوت
                
                const successMsg = `✅ *تم التسجيل بنجاح!*\n\n` +
                                   `👤 *الاسم:* ${state.name}\n` +
                                   `🎂 *العمر:* ${state.age} سنة\n\n` +
                                   `سعداء بانضمامك لنا يا *${state.name.split(' ')[0]}*! 🌹\nسيتم التواصل معك على هذا الرقم عند الحاجة.`;
                await sendWH(from, successMsg);
                break;
        }
    } catch (e) { 
        console.error(e);
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

app.listen(process.env.PORT || 3000);
