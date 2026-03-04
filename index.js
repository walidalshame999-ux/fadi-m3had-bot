const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const INSTANCE_ID = process.env.INSTANCE_ID || 'instance163781';
const TOKEN = process.env.USERINTERMIX_TOKEN || 'p28vl0vdx1g74qyd';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyAWG-wcbGfCjN9M6TVXZ2dthKuZi7ilG5w';

let registrations = []; 
let userState = {}; 
let dailyWelcome = {}; 

// إعدادات البوت والذكاء الاصطناعي
let botConfig = {
    geminiEnabled: true, // الذكاء الاصطناعي التوليدي (جوجل)
    miniAiEnabled: true, // الذكاء الاصطناعي المصغر (الأنماط)
    geminiPrompt: "أنت سكرتير لبق ومحترف جداً تعمل في معهد الفتح الخيري. اسمك 'المساعد الذكي'. أجب على أسئلة الطلاب بحدود المعلومات المتوفرة لديك فقط. كن ودوداً ومختصراً ولا تؤلف معلومات غير موجودة.",
    announcement: "", 
    aiKnowledge: "المدير: فادي علي الهندي\nالجمعية: قطيع فاميلي فاونديشن\nالتواصل: 00963959809700\nالدورات: ICDL، برمجة، تصميم، لغة إنجليزية، تاسع، بكالوريا\nالتكلفة: المعهد مجاني بالكامل",
    aiTraining: "احبك = شكراً لمشاعرك اللطيفة، ولكنني مجرد مساعد آلي مخصص لخدمات معهد الفتح.\nفادي = أعتذر منك، لا يمكنني مشاركة معلومات شخصية عن مدير المعهد. يرجى التواصل معه مباشرة.",
    welcomeMessage: "للتسجيل معنا، أرسل كلمة *تسجيل*.\nللتحدث مع الذكاء الاصطناعي وطرح أي استفسار، أرسل كلمة *سؤال* متبوعة باستفسارك.",
    regToggle: true
};

app.get('/api/system', (req, res) => res.json({ registrations, botConfig }));
app.post('/api/update-config', (req, res) => {
    botConfig = { ...botConfig, ...req.body };
    res.json({ success: true });
});

app.post('/webhook', async (req, res) => {
    // 🔴 الحل السحري لمشكلة التكرار: إرسال (OK) فوراً لـ UltraMsg لكي لا يعيد إرسال الرسالة
    res.status(200).send('ok');

    const data = req.body.data || req.body;
    if (!data || data.fromMe || !data.body) return;

    const from = data.from;
    const text = data.body.trim();
    const lowerText = text.toLowerCase();
    const today = new Date().toDateString();

    const registeredUser = registrations.find(r => r.phone === from);

    // 1. إكمال التسجيل (أولوية قصوى ولا يتدخل فيها الذكاء الاصطناعي)
    if (userState[from]) {
        return handleRegistration(from, text);
    }

    // --- تحليل النوايا ---
    const isRegisterRequest = lowerText === "تسجيل" || lowerText === "سجلني";
    const isAiQuestion = lowerText.startsWith("سؤال") || lowerText.startsWith("ذكاء");
    const isGreeting = ["سلام", "مرحبا", "هلا", "السلام عليكم", "صباح"].some(w => lowerText.includes(w)) && text.length < 20;

    // 2. معالجة التسجيل
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

    // 3. التحدث مع الذكاء الاصطناعي (Gemini أو Mini-AI)
    if (isAiQuestion) {
        let questionText = lowerText.replace("سؤال", "").replace("ذكاء", "").trim();
        let prefix = registeredUser ? `أهلاً بك يا *${registeredUser.name.split(' ')[0]}*، ` : "أهلاً بك، ";
        let intro = `🤖 *المساعد الذكي:*\n`;

        if (questionText === "") {
            return sendWH(from, `${intro}${prefix}أنا هنا للإجابة على استفساراتك. أرسل كلمة *سؤال* متبوعة بما تريد معرفته.`);
        }

        // أ- محاولة الرد عبر Gemini (الذكاء التوليدي)
        if (botConfig.geminiEnabled) {
            try {
                // إرسال التعليمات + بنك المعلومات + التدريب الخاص + سؤال الطالب إلى Gemini
                const prompt = `${botConfig.geminiPrompt}\n\nمعلومات المعهد التي يجب أن تعتمد عليها:\n${botConfig.aiKnowledge}\n\nتعليمات صارمة للرد (إن سئلت عنها):\n${botConfig.aiTraining}\n\nإعلانات طارئة (أخبر الطالب بها إن لزم الأمر):\n${botConfig.announcement}\n\nسؤال الطالب:\n${questionText}`;
                
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
                const response = await axios.post(url, { contents: [{ parts: [{ text: prompt }] }] });
                
                let geminiReply = response.data.candidates[0].content.parts[0].text;
                return sendWH(from, `${intro}${geminiReply}`);
            } catch (error) {
                console.error("Gemini API Error:", error.message);
                // إذا فشل Gemini، ننتقل للذكاء المصغر كخطة بديلة
            }
        }

        // ب- الرد عبر الذكاء المصغر (الأنماط) إذا كان Gemini مغلقاً أو فشل
        if (botConfig.miniAiEnabled) {
            if (botConfig.aiTraining) {
                const trainingLines = botConfig.aiTraining.split('\n');
                for (let line of trainingLines) {
                    if (line.includes('=')) {
                        let [trigger, response] = line.split('=');
                        if (questionText.includes(trigger.trim().toLowerCase())) {
                            return sendWH(from, `${intro}${response.trim()}`);
                        }
                    }
                }
            }
            if (botConfig.aiKnowledge) {
                const infoLines = botConfig.aiKnowledge.split('\n');
                for (let line of infoLines) {
                    const keyword = line.split(':')[0].trim().toLowerCase();
                    if (questionText.includes(keyword) && keyword.length > 2) {
                        return sendWH(from, `${intro}بخصوص استفسارك:\n💡 *${line}*`);
                    }
                }
            }
        }

        // ج- في حال لم يفهم أو كانت جميع الأنظمة مغلقة
        if (!botConfig.geminiEnabled && !botConfig.miniAiEnabled) {
            return sendWH(from, `${intro}عذراً، نظام الذكاء الاصطناعي متوقف حالياً للصيانة.`);
        } else {
            return sendWH(from, `${intro}عذراً، لم أتمكن من العثور على إجابة دقيقة. يرجى توضيح السؤال أو التواصل مع الإدارة.`);
        }
    }

    // 4. الترحيب الافتراضي
    if (isGreeting && dailyWelcome[from] !== today) {
        dailyWelcome[from] = today; 
        let msg = `🎓 *معهد الفتح الخيري*\nأهلاً بك، أنا المساعد الذكي للمعهد.\n\n`;
        if (registeredUser) msg = `🌹 أهلاً بك من جديد يا *${registeredUser.name.split(' ')[0]}*!\n\n`;
        if (botConfig.announcement) msg += `📢 *إعلان هام:* ${botConfig.announcement}\n\n`;
        msg += botConfig.welcomeMessage;
        return sendWH(from, msg);
    }
});

// دالة معالجة التسجيل
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
                    return sendWH(from, "⚠️ *خطأ في الإدخال:*\nيرجى إرسال *سنة التولد* بشكل صحيح (يجب أن تحتوي على أرقام فقط مثل 2005):");
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
                
                if (botConfig.geminiEnabled || botConfig.miniAiEnabled) {
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

app.listen(process.env.PORT || 3000, () => console.log("Gemini AI Server Online"));
