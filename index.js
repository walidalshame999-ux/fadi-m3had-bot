const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const INSTANCE_ID = process.env.INSTANCE_ID || 'instance163781';
const TOKEN = process.env.USERINTERMIX_TOKEN || 'p28vl0vdx1g74qyd';

// قائمة لتخزين المسجلين (ملاحظة: في النسخة المجانية ستمسح القائمة إذا توقف السيرفر، للحل الدائم نحتاج قاعدة بيانات لاحقاً)
let registrations = [];

// دالة فحص الوقت
function getStatus() {
    const hour = new Date().getUTCHours() + 3; 
    if (hour >= 0 && hour < 8) return "sleep";
    return "work";
}

// نقطة الوصول لجلب البيانات للوحة التحكم
app.get('/api/data', (req, res) => {
    res.json({
        registrations: registrations,
        status: getStatus(),
        count: registrations.length
    });
});

app.post('/webhook', async (req, res) => {
    const messageData = req.body.data || req.body;
    
    if (messageData && messageData.body && !messageData.fromMe) {
        const text = messageData.body.trim();
        const from = messageData.from;
        let reply = "";

        // منطق "صيد" بيانات التسجيل: إذا أرسل نصاً يحتوي على شرطة أو تفاصيل بعد طلب البوت
        if (text.includes("-") || (text.length > 10 && !text.includes("تسجيل"))) {
             registrations.push({
                phone: from,
                details: text,
                time: new Date().toLocaleString('ar-EG')
            });
            reply = "تم استلام بياناتك بنجاح في معهد الفتح. سيقوم المدير بمراجعتها قريباً.";
        }
        else if (text.toLowerCase().includes("تسجيل")) {
            reply = "أهلاً بك! يرجى إرسال بياناتك بالتنسيق التالي: (الاسم - العمر - التخصص) لكي نقوم بتسديدها.";
        }
        else if (getStatus() === "sleep") {
            reply = "مدير المعهد نائم حالياً. المعهد يفتح من 8 صباحاً. سجل بياناتك وسنرد عليك فوراً!";
        }

        if (reply) {
            await axios.post(`https://api.ultramsg.com/${INSTANCE_ID}/messages/chat`, {
                token: TOKEN, to: from, body: reply
            }).catch(e => console.log("Error:", e.message));
        }
    }
    res.send('ok');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
