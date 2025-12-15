const axios = require('axios');

module.exports = async (req, res) => {
    // ১. CORS সেটআপ (যাতে ব্রাউজার থেকে রিকোয়েস্ট ব্লক না হয়)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // ২. প্রি-ফ্লাইট রিকোয়েস্ট হ্যান্ডেলিং
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // ৩. মেথড চেক (শুধুমাত্র POST বা GET এলাউড, যাতে ব্রাউজারে ক্র্যাশ না করে)
    if (req.method === 'GET') {
        return res.status(200).json({ status: "API is Running ✅", message: "Please use POST method with host & mac" });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method Not Allowed' });
    }

    // ৪. মেইন লজিক
    const { host, mac } = req.body;

    if (!host || !mac) {
        return res.status(400).json({ success: false, message: 'Missing Host or MAC Address' });
    }

    try {
        const cleanHost = host.endsWith('/') ? host : `${host}/`;
        
        // Stalker Portal স্পুফিং হেডার
        const headers = {
            'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
            'Cookie': `mac=${mac}; stb_lang=en; timezone=Europe/Paris;`,
            'Accept': '*/*',
            'Referer': cleanHost,
            'X-User-Agent': 'Model: MAG250; Link: Ethernet'
        };

        const targetUrl = `${cleanHost}portal.php?type=stb&action=handshake&token=&prehash=false&JsHttpRequest=1-xml`;

        // রিকোয়েস্ট পাঠানো (টাইমআউট ৫ সেকেন্ড)
        const response = await axios.get(targetUrl, { headers, timeout: 5000 });
        const data = response.data;

        // রেসপন্স চেক
        if (data && data.js && data.js.token) {
            // M3U লিংক জেনারেট
            const m3uLink = `${cleanHost}get.php?username=${mac}&password=${mac}&type=m3u_plus&output=ts`;
            
            return res.json({
                success: true,
                message: 'Active Account ✅',
                data: {
                    mac: mac,
                    token: data.js.token,
                    expiry: 'Check Profile for Details',
                    m3u: m3uLink
                }
            });
        } else {
            return res.json({
                success: false,
                message: 'Inactive / Invalid Response ❌',
                raw_data: data
            });
        }

    } catch (error) {
        console.error(error);
        return res.status(500).json({ 
            success: false, 
            message: 'Server Error / Connection Failed', 
            error: error.message 
        });
    }
};
