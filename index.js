const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// الإعدادات من Render
const INSTANCE_ID = process.env.INSTANCE_ID || 'instance163781';
const TOKEN = process.env.USERINTERMIX_TOKEN || 'p28vl0vdx1g74qyd';

app.post('/webhook', async (req, res) => {
    // هذا السطر مهم جداً للفحص: سيطبع في Render أي بيانات تصل
    console.log("وصلت رسالة جديدة:", JSON.stringify(req.body));

    const data = req.body;
    
    // التحقق من وجود رسالة (دعم مختلف تنسيقات UltraMsg)
    if (data && data.data && !data.data.fromMe) {
        const msg = data.data;
        const text = (msg.body || "").toLowerCase();
        const from = msg.from; // رقم المرسل

        let reply = "";

        if (text.includes("تسجيل")) {
            reply = "أهلاً بك في معهد الفتح! يرجى تزويدنا بالاسم والتخصص.";
        } else if (text.includes("تكنولوجيا")) {
            reply = "قسم التكنولوجيا يرحب بك. لدينا دورات برمجة وصيانة.";
        }

        if (reply) {
            try {
                const response = await axios.post(`https://api.ultramsg.com/${INSTANCE_ID}/messages/chat`, {
                    token: TOKEN,
                    to: from,
                    body: reply
                });
                console.log("تم إرسال الرد بنجاح:", response.data);
            } catch (error) {
                console.error("خطأ في إرسال الرد:", error.message);
            }
        }
    }
    res.send('ok');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
