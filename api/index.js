const axios = require('axios');

module.exports = async (req, res) => {
    // CORS & Method Check
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' });

    const { host, mac } = req.body;
    if (!host || !mac) return res.status(400).json({ success: false, message: 'Missing Host or MAC' });

    try {
        const cleanHost = host.endsWith('/') ? host : `${host}/`;
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
            'Cookie': `mac=${mac}; stb_lang=en; timezone=Europe/Paris;`,
            'Accept': '*/*',
            'Referer': cleanHost,
            'X-User-Agent': 'Model: MAG250; Link: Ethernet'
        };

        // ১. Handshake
        const handUrl = `${cleanHost}portal.php?type=stb&action=handshake&token=&prehash=false&JsHttpRequest=1-xml`;
        const handRes = await axios.get(handUrl, { headers, timeout: 6000 });
        
        if (!handRes.data?.js?.token) {
            return res.json({ success: false, message: 'MAC Dead / Invalid Host ❌' });
        }

        const token = handRes.data.js.token;
        const authHeaders = { ...headers, 'Authorization': `Bearer ${token}` };

        // ২. সব তথ্য একসাথে আনা (Profile + Main Info + Categories)
        const [profileRes, mainInfoRes, liveRes, vodRes, seriesRes] = await Promise.all([
            axios.get(`${cleanHost}portal.php?type=stb&action=get_profile&JsHttpRequest=1-xml`, { headers: authHeaders }),
            axios.get(`${cleanHost}portal.php?type=account_info&action=get_main_info&JsHttpRequest=1-xml`, { headers: authHeaders }),
            axios.get(`${cleanHost}portal.php?type=itv&action=get_genres&JsHttpRequest=1-xml`, { headers: authHeaders }),
            axios.get(`${cleanHost}portal.php?type=vod&action=get_categories&JsHttpRequest=1-xml`, { headers: authHeaders }),
            axios.get(`${cleanHost}portal.php?type=series&action=get_categories&JsHttpRequest=1-xml`, { headers: authHeaders })
        ]);

        const p = profileRes.data?.js || {};     // Profile Data
        const m = mainInfoRes.data?.js || {};    // Main Info (Max Online here)
        
        const m3uLink = `${cleanHost}get.php?username=${mac}&password=${mac}&type=m3u_plus&output=ts`;

        // ক্যাটাগরি প্রসেসিং
        const extractTitles = (data) => {
            if (data?.js && Array.isArray(data.js)) {
                return data.js.map(item => item.title).slice(0, 10); // UI ক্লিন রাখতে ১০টা দেখাবে
            }
            return [];
        };

        return res.json({
            success: true,
            message: 'Active Account ✅',
            data: {
                // Basic Info
                mac: mac,
                expiry: p.phone || p.end_date || 'Unlimited',
                created: p.created || 'Unknown',
                
                // Advanced Info (আপনার চাওয়া লিস্ট)
                username: p.fname || p.login || p.name || 'N/A',
                password: p.password || 'N/A',
                adult_pass: p.parent_password || '0000',
                tariff_id: p.tariff_plan_id || 'N/A',
                plan_name: m.phone || p.package_name || 'N/A', // অনেক সময় Plan Name ফোনে থাকে
                max_online: m.max_online || '1', // ডিফল্ট ১
                stb_type: p.stb_type || 'MAG250',
                country: p.country || p.locale || 'N/A',
                settings_pass: p.settings_password || 'N/A',
                comment: p.comment || 'No Comment',

                // Tools
                m3u: m3uLink,
                
                // Content Lists
                liveCategories: extractTitles(liveRes.data),
                vodCategories: extractTitles(vodRes.data),
                seriesCategories: extractTitles(seriesRes.data)
            }
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: 'Connection Failed', error: error.message });
    }
};
