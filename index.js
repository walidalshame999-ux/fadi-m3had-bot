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
    aiEnabled: true, // مفتاح تشغيل/إيقاف الذكاء الاصطناعي
    announcement: "", 
    aiKnowledge: "المدير: فادي علي الهندي\nالجمعية: قطيع فاميلي فاونديشن\nالتواصل: 00963959809700\nالدورات: ICDL، برمجة، تصميم، لغة إنجليزية، تاسع، بكالوريا\nالتكلفة: المعهد مجاني بالكامل",
    aiTraining: "احبك = عذراً، أنا مساعد آلي مخصص لخدمات المعهد فقط.\nفادي = عذراً، لا يمكنني مشاركة معلومات شخصية عن مدير المعهد. يرجى التواصل معه مباشرة.",
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

    // 2. تحليل الكلمات المدربة (AI Training Patterns)
    if (botConfig.aiEnabled && botConfig.aiTraining) {
        const trainingLines = botConfig.aiTraining.split('\n');
        for (let line of trainingLines) {
            if (line.includes('=')) {
                let [trigger, response] = line.split('=');
                if (lowerText.includes(trigger.trim().toLowerCase())) {
                    return sendWH(from, `🤖 *المساعد الذكي:*\n${response.trim()}`);
                }
            }
        }
    }

    // 3. معالجة طلب التسجيل
    if (lowerText.includes("تسجيل") || lowerText.includes("سجلني")) {
        const ann = botConfig.announcement.toLowerCase();
        if (ann.includes("لا يوجد تسجيل") || ann.includes("مغلق") || !botConfig.regToggle) {
            return sendWH(from, `🤖 *عذراً منك:*\nبناءً على تحديثات الإدارة:\n"${botConfig.announcement || 'التسجيل مغلق حالياً.'}"\nيرجى المحاولة في وقت لاحق.`);
        }

        if (registeredUser) {
            return sendWH(from, `🤖 أهلاً بك أخي الكريم *${registeredUser.name.split(' ')[0]}*.\nبياناتك مسجلة لدينا مسبقاً، لا داعي للتسجيل مرة أخرى.`);
        }
        
        userState[from] = { step: 1 };
        return sendWH(from, "📝 *بدء التسجيل | معهد الفتح*\n\nيرجى التكرم بإرسال *الاسم الثلاثي* حصراً (الاسم، الأب، الكنية):");
    }

    // 4. معالجة طلب المعلومات
    if (lowerText === "معلومات" || lowerText === "تفاصيل") {
        let prefix = "";
        if (botConfig.aiEnabled) {
            prefix = registeredUser ? `أهلاً بك يا *${registeredUser.name.split(' ')[0]}*، أنا المساعد الذكي لمعهد الفتح 🤖.\nيسعدني تقديم هذه المعلومات لك:\n\n` 
                                    : `مرحباً بك، أنا المساعد الذكي لمعهد الفتح 🤖.\nإليك التفاصيل المطلوبة:\n\n`;
        }
        let info = botConfig.announcement ? `📢 *تنويه هام:* ${botConfig.announcement}\n\n` : "";
        info += prefix + botConfig.aiKnowledge;
        return sendWH(from, info);
    }

    // 5. البحث الذكي في بنك المعلومات (إذا سأل سؤالاً محدداً)
    if (botConfig.aiEnabled) {
        const infoLines = botConfig.aiKnowledge.split('\n');
        for (let line of infoLines) {
            const keyword = line.split(':')[0].trim();
            if (lowerText.includes(keyword) && keyword.length > 2) {
                let prefix = registeredUser ? `عزيزي *${registeredUser.name.split(' ')[0]}*، ` : "";
                return sendWH(from, `🤖 ${prefix}للإجابة على استفسارك:\n*${line}*`);
            }
        }
    }

    // 6. الرد على التحية (مرة واحدة يومياً)
    const isGreeting = ["سلام", "مرحبا", "هلا", "مرحباً", "السلام عليكم", "صباح"].some(w => lowerText.includes(w));
    if (isGreeting && dailyWelcome[from] !== today) {
        dailyWelcome[from] = today; 
        
        let msg = "";
        if (botConfig.aiEnabled) {
            msg = registeredUser ? `أهلاً بك مجدداً يا *${registeredUser.name.split(' ')[0]}*! 🌹\nأنا المساعد الذكي لمعهد الفتح، كيف يمكنني خدمتك اليوم؟\n\n(للتفاصيل أرسل *معلومات*)` 
                                 : `مرحباً بك في *معهد الفتح الخيري* 🎓\nأنا المساعد الذكي، مبرمج لخدمتك وتسهيل تسجيلك.\n\n(للمعلومات أرسل *معلومات*، للتسجيل أرسل *تسجيل*)`;
        } else {
            msg = `مرحباً بك في معهد الفتح.\nللمعلومات أرسل *معلومات*.\nللتسجيل أرسل *تسجيل*.`;
        }

        if (botConfig.announcement) msg = `📢 *إعلان الإدارة:* ${botConfig.announcement}\n\n` + msg;
        return sendWH(from, msg);
    }

    // صمت مطبق إذا لم يتعرف على الكلام (بدون إزعاج)
    res.send('ok');
});

async function handleRegistration(from, text) {
    let state = userState[from];
    try {
        switch(state.step) {
            case 1: 
                const nameParts = text.trim().split(/\s+/);
                if (nameParts.length < 3) {
                    return sendWH(from, "⚠️ *عذراً:*\nالرجاء إرسال *الاسم الثلاثي* كاملاً لضمان صحة الشهادات لاحقاً.\nأعد كتابة الاسم:");
                }
                state.name = text; state.step = 2;
                await sendWH(from, "✨ *شكراً لك.*\nالآن، يرجى إرسال *سنة التولد* الخاص بك (أرقام فقط، مثال: 2008):");
                break;

            case 2: 
                const year = parseInt(text);
                const currentYear = new Date().getFullYear();
                if (isNaN(year) || year < 1950 || year > currentYear) {
                    return sendWH(from, "⚠️ *تنبيه:*\nالرجاء إدخال *سنة التولد* بشكل صحيح (أرقام فقط):");
                }
                const age = currentYear - year;
                if (age < 11) {
                    await sendWH(from, "🛑 *نعتذر منك:*\nبحسب قوانين الإدارة، المعهد مخصص لمن تتجاوز أعمارهم *11 عاماً*.\nنتمنى لك التوفيق!");
                    delete userState[from]; 
                    return;
                }
                state.birthYear = year;
                state.age = age;
                state.step = 3;
                await sendWH(from, "🏢 تفضل بإخبارنا، ما هو *عملك الحالي*؟");
                break;

            case 3:
                state.job = text; state.step = 4;
                await sendWH(from, "📚 أخيراً، ما هو آخر *تحصيل علمي* أو دراسة لك؟");
                break;

            case 4:
                state.study = text;
                state.phone = from; 
                state.regDate = new Date().toLocaleString('ar-EG');
                
                registrations.push({...state});
                delete userState[from]; 
                
                let successMsg = `✅ *تم اكتمال التسجيل بنجاح!*\n\n` +
                                 `👤 *الاسم:* ${state.name}\n` +
                                 `🎂 *العمر:* ${state.age} سنة\n\n`;
                if (botConfig.aiEnabled) {
                    successMsg += `🤖 سعدت جداً بخدمتك وتسجيلك يا *${state.name.split(' ')[0]}*! 🌹\nلن أقوم بإزعاجك بأي رسائل تلقائية، وسيقوم المعهد بالتواصل معك عند بدء الدورات.`;
                } else {
                    successMsg += `تم حفظ البيانات وسنتواصل معك قريباً.`;
                }
                await sendWH(from, successMsg);
                break;
        }
    } catch (e) { 
        console.error("Reg Error", e);
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

app.listen(process.env.PORT || 3000, () => console.log("AI Persona Server Running"));
