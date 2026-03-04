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
    aiEnabled: true,
    announcement: "", 
    aiKnowledge: "المدير: فادي علي الهندي\nالجمعية: قطيع فاميلي فاونديشن\nالتواصل: 00963959809700\nالدورات: ICDL، برمجة، تصميم، لغة إنجليزية، تاسع، بكالوريا\nالتكلفة: المعهد مجاني بالكامل",
    aiTraining: "احبك = شكراً لمشاعرك اللطيفة، ولكنني مجرد مساعد آلي مخصص لخدمات معهد الفتح.\nفادي = أعتذر منك، لا يمكنني مشاركة معلومات شخصية عن مدير المعهد. يرجى التواصل معه مباشرة.",
    welcomeMessage: "للتسجيل معنا، أرسل كلمة *تسجيل*.\nللتحدث معي وطرح أي استفسار، أرسل كلمة *سؤال* متبوعة باستفسارك.",
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

    // 1. أولوية قصوى: إذا كان المستخدم يسجل بياناته (يجب ألا يتدخل الذكاء الاصطناعي هنا)
    if (userState[from]) {
        return handleRegistration(from, text);
    }

    // --- تحليل نوايا المستخدم (Intent Parsing) ---
    const isRegisterRequest = lowerText === "تسجيل" || lowerText === "سجلني";
    const isAiQuestion = lowerText.startsWith("سؤال") || lowerText.startsWith("ذكاء");
    const isGreeting = ["سلام", "مرحبا", "هلا", "السلام عليكم", "صباح"].some(w => lowerText.includes(w)) && text.length < 20;

    // 2. معالجة طلب التسجيل
    if (isRegisterRequest) {
        if (!botConfig.regToggle || botConfig.announcement.includes("لا يوجد تسجيل") || botConfig.announcement.includes("مغلق")) {
            return sendWH(from, `🤖 *مرحباً بك!*\nنعتذر منك، ولكن حسب تعليمات الإدارة:\n"${botConfig.announcement || 'التسجيل مغلق حالياً.'}"\n\nيرجى المحاولة لاحقاً.`);
        }
        if (registeredUser) {
            return sendWH(from, `🤖 أهلاً بك أخي الكريم *${registeredUser.name.split(' ')[0]}*.\nبياناتك مسجلة لدينا مسبقاً، ولا يمكن تسجيل شخصين من نفس الرقم.`);
        }
        
        userState[from] = { step: 1 };
        return sendWH(from, "📝 *نظام التسجيل الذكي | معهد الفتح*\n\nيرجى التكرم بإرسال *الاسم الثلاثي* حصراً (الاسم، الأب، الكنية):");
    }

    // 3. معالجة محادثة الذكاء الاصطناعي (عندما يرسل المستخدم "سؤال ...")
    if (isAiQuestion && botConfig.aiEnabled) {
        let questionText = lowerText.replace("سؤال", "").replace("ذكاء", "").trim();
        let prefix = registeredUser ? `أهلاً بك يا *${registeredUser.name.split(' ')[0]}*، ` : "أهلاً بك، ";
        let intro = `🤖 *المساعد الذكي لمعهد الفتح:*\n${prefix}`;

        if (questionText === "") {
            return sendWH(from, `${intro}أنا هنا للإجابة على استفساراتك. أرسل كلمة *سؤال* متبوعة بما تريد معرفته.`);
        }

        // أ- البحث في التدريب المخصص (AI Training)
        if (botConfig.aiTraining) {
            const trainingLines = botConfig.aiTraining.split('\n');
            for (let line of trainingLines) {
                if (line.includes('=')) {
                    let [trigger, response] = line.split('=');
                    if (questionText.includes(trigger.trim().toLowerCase())) {
                        return sendWH(from, `${intro}\n${response.trim()}`);
                    }
                }
            }
        }

        // ب- البحث في بنك المعلومات (AI Knowledge)
        if (botConfig.aiKnowledge) {
            const infoLines = botConfig.aiKnowledge.split('\n');
            for (let line of infoLines) {
                const keyword = line.split(':')[0].trim().toLowerCase();
                if (questionText.includes(keyword) && keyword.length > 2) {
                    return sendWH(from, `${intro}بخصوص استفسارك:\n💡 *${line}*`);
                }
            }
        }

        // ج- رد الذكاء الاصطناعي في حال عدم الفهم (اللباقة)
        return sendWH(from, `${intro}عذراً، لم أتمكن من العثور على إجابة دقيقة لاستفسارك في قاعدة بياناتي. يرجى توضيح السؤال أو التواصل مع الإدارة.`);
    }

    // 4. الترحيب (مرة واحدة في اليوم فقط لمنع الإزعاج)
    if (isGreeting && dailyWelcome[from] !== today) {
        dailyWelcome[from] = today; 
        let msg = `🎓 *معهد الفتح الخيري*\nأهلاً بك، أنا المساعد الذكي للمعهد.\n\n`;
        if (registeredUser) msg = `🌹 أهلاً بك من جديد يا *${registeredUser.name.split(' ')[0]}*!\n\n`;
        if (botConfig.announcement) msg += `📢 *إعلان هام:* ${botConfig.announcement}\n\n`;
        msg += botConfig.welcomeMessage;
        return sendWH(from, msg);
    }

    // صمت مطبق (لا رسائل مزعجة إذا أرسل كلاماً عادياً)
    res.send('ok');
});

// معالجة خطوات التسجيل بصرامة ودقة
async function handleRegistration(from, text) {
    let state = userState[from];
    try {
        switch(state.step) {
            case 1: 
                const nameParts = text.trim().split(/\s+/);
                if (nameParts.length < 3) {
                    return sendWH(from, "⚠️ *عذراً:*\nالنظام لا يقبل إلا *الاسم الثلاثي* لضمان الدقة.\nيرجى إعادة إرسال اسمك الثلاثي كاملاً:");
                }
                state.name = text; state.step = 2;
                await sendWH(from, "✨ *ممتاز!*\nالآن، يرجى إرسال *سنة التولد* بشكل صحيح (أرقام فقط، مثال: 2008):");
                break;

            case 2: 
                const year = parseInt(text);
                const currentYear = new Date().getFullYear();
                if (isNaN(year) || year < 1950 || year > currentYear) {
                    return sendWH(from, "⚠️ *خطأ في الإدخال:*\nيرجى إرسال *سنة التولد* بشكل صحيح (أرقام فقط):");
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
                
                let successMsg = `✅ *اكتمل التسجيل بنجاح!*\n\n` +
                                 `👤 *الاسم:* ${state.name}\n` +
                                 `🎂 *العمر:* ${state.age} سنة\n` +
                                 `💼 *العمل:* ${state.job}\n` +
                                 `🎓 *الدراسة:* ${state.study}\n\n`;
                
                if (botConfig.aiEnabled) {
                    successMsg += `🤖 سعدت جداً بخدمتك يا *${state.name.split(' ')[0]}*! 🌹\nسأصمت الآن ولن أزعجك بأي رسائل تلقائية، وسيقوم المعهد بالتواصل معك قريباً.`;
                } else {
                    successMsg += `تم حفظ البيانات بنجاح.`;
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

app.listen(process.env.PORT || 3000, () => console.log("AI Server Online"));
