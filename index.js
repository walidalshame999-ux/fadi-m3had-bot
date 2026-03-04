const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const INSTANCE_ID = process.env.INSTANCE_ID || 'instance163781';
const TOKEN = process.env.USERINTERMIX_TOKEN || 'p28vl0vdx1g74qyd';

// دالة لفحص الوقت (توقيت سوريا/مصر GMT+3)
function getStatus() {
    const hour = new Date().getUTCHours() + 3; 
    // إذا كان الوقت بين 12 ليلاً و 8 صباحاً
    if (hour >= 0 && hour < 8) return "sleep";
    // إذا كان الوقت بين 8 صباحاً و 8 مساءً
    if (hour >= 8 && hour < 20) return "work";
    // باقي الأوقات (المساء)
    return "closed";
}

app.post('/webhook', async (req, res) => {
    const messageData = req.body.data || req.body;
    
    if (messageData && messageData.body && !messageData.fromMe) {
        const text = messageData.body.trim().toLowerCase();
        const from = messageData.from; 
        const isGroup = from.includes('@g.us'); // هل الرسالة من مجموعة؟
        let reply = "";

        const status = getStatus();

        // 1. منطق وقت النوم (بالليل)
        if (status === "sleep") {
            reply = "عذراً، مدير المعهد نائم حالياً والمعهد مغلق. يفتح المعهد أبوابه من الساعة 8:00 صباحاً. سنرد عليك فور استيقاظنا!";
        } 
        
        // 2. منطق وقت العمل أو الإغلاق المسائي
        else {
            if (text.includes("تسجيل") || text.includes("سجلني")) {
                reply = "أهلاً بك في معهد الفتح! يرجى إرسال (الاسم الثلاثي - العمر - الدورة المطلوبة) وسنقوم بتثبيت طلبك فوراً.";
            } 
            else if (text.includes("تكنولوجيا") || text.includes("برمجة") || text.includes("كمبيوتر")) {
                reply = "معهدنا متخصص في دورات البرمجة (Python, Web), الجرافيك ديزاين، وصيانة الحاسوب. أي تخصص يهمك أكثر؟";
            }
            else if (text.includes("موقع") || text.includes("مكان")) {
                reply = "مقر معهد الفتح الخيري: [ضع هنا عنوان المعهد بالتفصيل]. نتشرف بزيارتك!";
            }
            else if (!isGroup) {
                // رد عام فقط في "الخاص" إذا لم يفهم الكلمة لكي لا يزعج المجموعات
                reply = "أهلاً بك في معهد الفتح الخيري. للرد الآلي السريع اختر: (تسجيل - تكنولوجيا - مواعيد). أو انتظر رد المدير.";
            }
        }

        // إرسال الرد
        if (reply) {
            try {
                await axios.post(`https://api.ultramsg.com/${INSTANCE_ID}/messages/chat`, {
                    token: TOKEN,
                    to: from,
                    body: reply
                });
            } catch (e) { console.error("Error sending:", e.message); }
        }
    }
    res.send('ok');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
