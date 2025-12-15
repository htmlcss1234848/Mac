// api/index.js (Native Vercel Function)
const axios = require('axios');

module.exports = async (req, res) => {
    // ১. CORS হ্যান্ডলিং (যাতে ব্রাউজার থেকে এরর না দেয়)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // OPTIONS রিকোয়েস্ট হ্যান্ডেল করা (Pre-flight check)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // ২. শুধু POST রিকোয়েস্ট এক্সেপ্ট করবে
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method Not Allowed' });
    }

    const { host, mac } = req.body;
    if (!host || !mac) {
        return res.status(400).json({ success: false, message: 'Missing Host or MAC' });
    }

    // ৩. মেইন লজিক (Stalker Portal Check)
    const cleanHost = host.endsWith('/') ? host : `${host}/`;
    
    const headers = {
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'Cookie': `mac=${mac}; stb_lang=en; timezone=Europe/Paris;`,
        'Accept': '*/*',
        'Referer': cleanHost,
        'X-User-Agent': 'Model: MAG250; Link: Ethernet'
    };

    try {
        // ধাপ ১: Handshake
        const handshakeUrl = `${cleanHost}portal.php?type=stb&action=handshake&token=&prehash=false&JsHttpRequest=1-xml`;
        
        // Timeout কমিয়ে 5 সেকেন্ড করা হলো যাতে Vercel ফাংশন টাইমআউট না হয়
        const handResponse = await axios.get(handshakeUrl, { headers, timeout: 5000 });
        const handData = handResponse.data;

        if (!handData?.js?.token) {
            return res.json({ success: false, message: 'MAC Dead / Invalid Host ❌' });
        }

        const token = handData.js.token;

        // ধাপ ২: প্রোফাইল ডাটা
        const profileUrl = `${cleanHost}portal.php?type=stb&action=get_profile&JsHttpRequest=1-xml`;
        const profileHeaders = { ...headers, 'Authorization': `Bearer ${token}` };
        
        const profileResponse = await axios.get(profileUrl, { headers: profileHeaders, timeout: 5000 });
        const profileData = profileResponse.data;

        // M3U লিংক জেনারেট
        const m3uLink = `${cleanHost}get.php?username=${mac}&password=${mac}&type=m3u_plus&output=ts`;

        // সফল রেসপন্স
        return res.json({
            success: true,
            message: 'Active Account ✅',
            data: {
                mac: mac,
                expiry: profileData?.js?.phone || profileData?.js?.end_date || 'Unlimited',
                created: profileData?.js?.created || 'Unknown',
                m3u: m3uLink
            }
        });

    } catch (error) {
        console.error("API Error:", error.message);
        return res.status(500).json({ 
            success: false, 
            message: 'Connection Failed', 
            error: error.message 
        });
    }
};
