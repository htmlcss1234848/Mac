const axios = require('axios');

module.exports = async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

    const { host, mac } = req.body;
    if (!host || !mac) return res.status(400).json({ message: 'Missing Data' });

    const cleanHost = host.endsWith('/') ? host : `${host}/`;
    const headers = {
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'Cookie': `mac=${mac}; stb_lang=en; timezone=Europe/Paris;`,
        'Accept': '*/*',
        'Referer': cleanHost,
        'Authorization': 'Bearer 123' 
    };

    let resultData = { 
        mac, 
        expiry: 'Unknown', 
        created: 'Unknown',
        username: 'N/A',
        password: 'N/A',
        tariff_id: 'N/A',
        max_online: '1',
        raw_profile: {} // ডিবাগ করার জন্য
    };

    try {
        // 1. Handshake
        const handRes = await axios.get(`${cleanHost}portal.php?type=stb&action=handshake&token=&prehash=false&JsHttpRequest=1-xml`, { headers, timeout: 5000 });
        const token = handRes.data?.js?.token;

        if (!token) return res.json({ success: false, message: 'MAC Dead or Handshake Failed' });

        // Update headers with token
        headers['Authorization'] = `Bearer ${token}`;

        // 2. Get Profile (আলাদা try-catch যাতে ফেইল না করে)
        try {
            const profRes = await axios.get(`${cleanHost}portal.php?type=stb&action=get_profile&JsHttpRequest=1-xml`, { headers, timeout: 5000 });
            const p = profRes.data?.js;
            if (p) {
                resultData.expiry = p.phone || p.end_date || 'Unlimited';
                resultData.created = p.created || 'Unknown';
                // সম্ভাব্য সব নাম চেক করা হচ্ছে
                resultData.username = p.login || p.fname || p.name || p.username || 'Hidden';
                resultData.password = p.password || p.pass || 'Hidden';
                resultData.tariff_id = p.tariff_plan_id || 'N/A';
                resultData.stb_type = p.stb_type || 'MAG';
                resultData.raw_profile = p; // পুরো ডাটা পাঠিয়ে দিচ্ছি দেখার জন্য
            }
        } catch (e) { console.log("Profile Error", e.message); }

        // 3. Get Main Info (Max Online এর জন্য)
        try {
            const mainRes = await axios.get(`${cleanHost}portal.php?type=account_info&action=get_main_info&JsHttpRequest=1-xml`, { headers, timeout: 4000 });
            const m = mainRes.data?.js;
            if (m) {
                resultData.max_online = m.max_online || resultData.max_online;
                resultData.plan_name = m.phone || m.package_name || 'N/A';
            }
        } catch (e) { console.log("Main Info Error", e.message); }

        // 4. Categories (Genre)
        let live = [], vod = [];
        try {
            const liveRes = await axios.get(`${cleanHost}portal.php?type=itv&action=get_genres&JsHttpRequest=1-xml`, { headers, timeout: 5000 });
            if (liveRes.data?.js) live = liveRes.data.js.map(x => x.title).slice(0,10);
        } catch (e) {}

        try {
            const vodRes = await axios.get(`${cleanHost}portal.php?type=vod&action=get_categories&JsHttpRequest=1-xml`, { headers, timeout: 5000 });
            if (vodRes.data?.js) vod = vodRes.data.js.map(x => x.title).slice(0,10);
        } catch (e) {}

        return res.json({
            success: true,
            data: {
                ...resultData,
                liveCategories: live,
                vodCategories: vod,
                m3u: `${cleanHost}get.php?username=${mac}&password=${mac}&type=m3u_plus&output=ts`
            }
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: 'Critical Error: ' + error.message });
    }
};
