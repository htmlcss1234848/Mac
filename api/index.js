const axios = require('axios');

module.exports = async (req, res) => {
    // CORS Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

    const { host, mac } = req.body;
    if (!host || !mac) return res.status(400).json({ message: 'Missing Data' });

    // ১. কাস্টম এক্সট্রাক্টর (Data Parser)
    const extract = (text, key) => {
        try {
            if (typeof text !== 'string') text = JSON.stringify(text);
            const parts = text.split(`"${key}":"`);
            if (parts.length > 1) {
                return parts[1].split('"')[0].replace(/\\/g, '');
            }
        } catch (e) {}
        return null;
    };

    let baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
    
    // ২. সম্ভাব্য সব পাথ (Paths)
    const portalPaths = [
        '/portal.php',
        '/server/load.php',
        '/stalker_portal/server/load.php',
        '/c/portal.php',
        '/c/server/load.php',
        '/magportal/portal.php'
    ];

    // ৩. বিভিন্ন ডিভাইসের ইউজার এজেন্ট (যাতে ব্লক না খায়)
    const userAgents = [
        'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3', // MAG 250
        'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2721 Mobile Safari/533.3', // MAG 254
        'Mozilla/5.0 (Linux; Android 7.1.2; A95X F1 Build/NHG47L) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.125 Safari/537.36' // Android Box
    ];

    // ৪. ফেক আইপি জেনারেটর (ব্লক এড়ানোর জন্য)
    const randomIP = `${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;

    let workingPath = '';
    let token = '';
    let usedUA = '';
    let lastError = '';

    try {
        // লুপ ১: প্রতিটি পাথ চেক করবে
        pathLoop: for (const path of portalPaths) {
            // লুপ ২: প্রতিটি পাথের জন্য আলাদা আলাদা ডিভাইস (User Agent) দিয়ে ট্রাই করবে
            for (const ua of userAgents) {
                try {
                    const targetUrl = `${baseUrl}${path}?type=stb&action=handshake&token=&prehash=false&JsHttpRequest=1-xml`;
                    
                    const headers = {
                        'User-Agent': ua,
                        'Cookie': `mac=${mac}; stb_lang=en; timezone=Europe/Paris;`,
                        'Accept': '*/*',
                        'Referer': baseUrl + '/',
                        'X-Forwarded-For': randomIP, // Fake IP
                        'Client-IP': randomIP
                    };

                    const resHand = await axios.get(targetUrl, { headers, timeout: 3500 });

                    // টোকেন চেক
                    let tempToken = extract(resHand.data, "token") || resHand.data?.js?.token;

                    if (tempToken) {
                        workingPath = path;
                        token = tempToken;
                        usedUA = ua; // যে ইউজার এজেন্ট দিয়ে কাজ হয়েছে, সেটি সেভ রাখা
                        break pathLoop; // সব লুপ ব্রেক করে বের হয়ে যাবে
                    }
                } catch (e) {
                    lastError = e.message;
                    if(e.response) lastError = `Status: ${e.response.status} (${e.response.statusText})`;
                    continue;
                }
            }
        }

        if (!token) {
            return res.json({ 
                success: false, 
                message: `Handshake Failed ❌`,
                details: `Reason: ${lastError || 'Invalid Response/Blocked'}. Try checking Host URL.`
            });
        }

        // সফল হলে বাকি ডাটা আনা
        const headers = {
            'User-Agent': usedUA,
            'Cookie': `mac=${mac}; stb_lang=en; timezone=Europe/Paris;`,
            'Authorization': `Bearer ${token}`,
            'Referer': baseUrl + '/',
            'X-Forwarded-For': randomIP
        };

        const profUrl = `${baseUrl}${workingPath}?type=stb&action=get_profile&JsHttpRequest=1-xml`;
        const profRes = await axios.get(profUrl, { headers, timeout: 6000 });
        const rawData = JSON.stringify(profRes.data);

        // Data Mapping
        const dataMap = {
            expiry: extract(rawData, "phone") || extract(rawData, "end_date") || 'Unlimited',
            created: extract(rawData, "created") || 'Unknown',
            username: extract(rawData, "login") || extract(rawData, "fname") || extract(rawData, "name") || 'N/A',
            password: extract(rawData, "password") || extract(rawData, "pass") || 'N/A',
            tariff_id: extract(rawData, "tariff_plan_id") || 'N/A',
            max_online: extract(rawData, "max_online") || '1',
            stb_type: extract(rawData, "stb_type") || 'MAG',
            raw_profile: profRes.data?.js || {}
        };

        // M3U Link
        const m3uLink = `${baseUrl}/get.php?username=${mac}&password=${mac}&type=m3u_plus&output=ts`;

        // Categories (Optional)
        let live = [], vod = [];
        try {
            const liveRes = await axios.get(`${baseUrl}${workingPath}?type=itv&action=get_genres&JsHttpRequest=1-xml`, { headers, timeout: 3000 });
            if (liveRes.data?.js) live = liveRes.data.js.map(x => x.title).slice(0, 10);
        } catch (e) {}

        try {
            const vodRes = await axios.get(`${baseUrl}${workingPath}?type=vod&action=get_categories&JsHttpRequest=1-xml`, { headers, timeout: 3000 });
            if (vodRes.data?.js) vod = vodRes.data.js.map(x => x.title).slice(0, 10);
        } catch (e) {}

        return res.json({
            success: true,
            message: 'Active Account ✅',
            connected_path: workingPath,
            data: {
                mac: mac,
                ...dataMap,
                m3u: m3uLink,
                liveCategories: live,
                vodCategories: vod
            }
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};
