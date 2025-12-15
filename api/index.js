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

    // ১. হোস্ট URL ফরম্যাটিং
    // শেষের স্ল্যাশ (/) ফেলে দিয়ে ক্লিন রাখা হচ্ছে, যাতে আমরা পাথ জোড়া দিতে পারি
    let baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
    
    // পাইথন স্ক্রিপ্ট থেকে নেওয়া সব জনপ্রিয় পোর্টালে পাথ
    const portalPaths = [
        '/portal.php',                    // Standard
        '/server/load.php',               // Generic Stalker
        '/stalker_portal/server/load.php', // Old Stalker
        '/c/portal.php',                  // Xtream Codes / Stalker
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

    try {
        // ২. লুপ চালিয়ে সঠিক পাথ খুঁজে বের করা (Handshake Loop)
        for (const path of portalPaths) {
            try {
                // হ্যান্ডশেক রিকোয়েস্ট
                const targetUrl = `${baseUrl}${path}?type=stb&action=handshake&token=&prehash=false&JsHttpRequest=1-xml`;
                
                // টাইমআউট কম রাখা হয়েছে (২ সেকেন্ড) যাতে দ্রুত চেক হয়
                const resHand = await axios.get(targetUrl, { headers, timeout: 2500 });

                // যদি টোকেন পাওয়া যায়, তার মানে এটাই সঠিক পাথ
                if (resHand.data?.js?.token) {
                    workingPath = path;
                    token = resHand.data.js.token;
                    break; // লুপ ব্রেক করে পরের ধাপে যাবে
                }
            } catch (e) {
                // এই পাথ কাজ না করলে পরেরটা চেক করবে
                continue;
            }
        }

        if (!token) {
            return res.json({ success: false, message: 'MAC Dead or Unknown Portal Type ❌' });
        }

        // ৩. সঠিক পাথ ব্যবহার করে বাকি তথ্য বের করা
        headers['Authorization'] = `Bearer ${token}`;
        
        let profile = {};
        let mainInfo = {};

        // Profile Request
        try {
            const profUrl = `${baseUrl}${workingPath}?type=stb&action=get_profile&JsHttpRequest=1-xml`;
            const profRes = await axios.get(profUrl, { headers, timeout: 4000 });
            profile = profRes.data?.js || {};
        } catch (e) {}

        // Main Info Request (Max Online etc)
        try {
            const mainUrl = `${baseUrl}${workingPath}?type=account_info&action=get_main_info&JsHttpRequest=1-xml`;
            const mainRes = await axios.get(mainUrl, { headers, timeout: 4000 });
            mainInfo = mainRes.data?.js || {};
        } catch (e) {}

        // Categories Fetching
        let live = [], vod = [];
        // লাইভ চ্যানেল ক্যাটাগরি
        try {
            const liveRes = await axios.get(`${baseUrl}${workingPath}?type=itv&action=get_genres&JsHttpRequest=1-xml`, { headers, timeout: 4000 });
            if (liveRes.data?.js) live = liveRes.data.js.map(x => x.title).slice(0, 10);
        } catch (e) {}
        
        // মুভি ক্যাটাগরি
        try {
            const vodRes = await axios.get(`${baseUrl}${workingPath}?type=vod&action=get_categories&JsHttpRequest=1-xml`, { headers, timeout: 4000 });
            if (vodRes.data?.js) vod = vodRes.data.js.map(x => x.title).slice(0, 10);
        } catch (e) {}

        // ৪. ফাইনাল রেসপন্স সাজানো
        return res.json({
            success: true,
            message: 'Active Account ✅',
            connected_path: workingPath, // দেখাবে কোন পাথে কানেক্ট হয়েছে
            data: {
                mac: mac,
                expiry: profile.phone || profile.end_date || 'Unlimited',
                created: profile.created || 'Unknown',
                
                // Advanced Info
                username: profile.fname || profile.login || profile.name || 'Hidden',
                password: profile.password || 'Hidden',
                tariff_id: profile.tariff_plan_id || 'N/A',
                stb_type: profile.stb_type || 'MAG',
                
                // Main Info
                max_online: mainInfo.max_online || '1',
                plan_name: mainInfo.package_name || mainInfo.phone || 'N/A',

                // Lists
                liveCategories: live,
                vodCategories: vod,
                
                // Debugging
                raw_profile: profile,
                
                m3u: `${baseUrl}/get.php?username=${mac}&password=${mac}&type=m3u_plus&output=ts`
            }
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: 'Server Connection Error', error: error.message });
    }
};
