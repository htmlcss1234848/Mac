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

    // ১. URL ফিক্স করা (অটোমেটিক /c/ যোগ করা হবে যদি না থাকে)
    let baseUrl = host;
    if (!baseUrl.endsWith('/')) baseUrl += '/';
    if (!baseUrl.includes('/c/')) baseUrl += 'c/'; // হোস্ট যদি http://url.com হয়, অটো http://url.com/c/ হয়ে যাবে

    // ২. সিম্পল হেডার (কোনো জটিলতা নেই)
    const headers = {
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG250 stbapp ver: 2 rev: 250 Safari/533.3',
        'Cookie': `mac=${mac}; stb_lang=en; timezone=Europe/Paris;`,
        'Accept': '*/*',
        'Referer': baseUrl,
        'Authorization': 'Bearer 123'
    };

    // ৩. ডাটা বের করার ফাংশন
    const extract = (text, key) => {
        try {
            if (typeof text !== 'string') text = JSON.stringify(text);
            const parts = text.split(`"${key}":"`);
            if (parts.length > 1) return parts[1].split('"')[0].replace(/\\/g, '');
        } catch (e) {}
        return null;
    };

    try {
        // ধাপ ১: Handshake
        // আমরা সরাসরি portal.php চেক করব যা /c/ ফোল্ডারে থাকে
        const handUrl = `${baseUrl}portal.php?type=stb&action=handshake&token=&prehash=false&JsHttpRequest=1-xml`;
        
        const handRes = await axios.get(handUrl, { headers, timeout: 5000 });
        const rawHand = JSON.stringify(handRes.data);
        
        // টোকেন খোঁজা
        let token = extract(rawHand, "token") || handRes.data?.js?.token;

        if (!token) {
            return res.json({ success: false, message: 'MAC Dead / Handshake Failed ❌' });
        }

        // ধাপ ২: Profile Info
        headers['Authorization'] = `Bearer ${token}`;
        const profUrl = `${baseUrl}portal.php?type=stb&action=get_profile&JsHttpRequest=1-xml`;
        
        const profRes = await axios.get(profUrl, { headers, timeout: 5000 });
        const rawProf = JSON.stringify(profRes.data);
        const p = profRes.data?.js || {};

        // ধাপ ৩: রেসপন্স সাজানো
        return res.json({
            success: true,
            message: 'Active Account ✅',
            data: {
                mac: mac,
                expiry: p.phone || p.end_date || 'Unlimited',
                created: p.created || 'Unknown',
                username: p.login || p.fname || p.name || 'N/A',
                password: p.password || 'N/A',
                stb_type: p.stb_type || 'MAG250',
                m3u: `${baseUrl}get.php?username=${mac}&password=${mac}&type=m3u_plus&output=ts`
            }
        });

    } catch (error) {
        // এরর লগ (যাতে বুঝতে সুবিধা হয়)
        const errMsg = error.response ? `Status: ${error.response.status}` : error.message;
        return res.status(500).json({ success: false, message: 'Connection Error', error: errMsg });
    }
};
