const axios = require('axios');
const https = require('https');

module.exports = async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

    const { host, mac } = req.body;
    if (!host || !mac) return res.status(400).json({ message: 'Missing Data' });

    // ১. SSL ভেরিফিকেশন বন্ধ করা (অনেক আইপিটিভি প্যানেলে SSL এরর দেয়)
    const httpsAgent = new https.Agent({ 
        rejectUnauthorized: false,
        keepAlive: true 
    });

    const extract = (text, key) => {
        try {
            if (typeof text !== 'string') text = JSON.stringify(text);
            const parts = text.split(`"${key}":"`);
            if (parts.length > 1) return parts[1].split('"')[0].replace(/\\/g, '');
        } catch (e) {}
        return null;
    };

    let baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
    
    // ২. ডিবাগ লগ রাখার অ্যারে
    let debugLogs = [];

    const portalPaths = [
        '/portal.php',
        '/server/load.php',
        '/stalker_portal/server/load.php',
        '/c/portal.php',
        '/magportal/portal.php'
    ];

    // Python Script এর হুবহু হেডার
    const headers = {
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG250 stbapp ver: 2 rev: 250 Safari/533.3',
        'Cookie': `mac=${mac}; stb_lang=en; timezone=Europe/Paris;`,
        'Accept': '*/*',
        'Referer': baseUrl + '/c/',
        'X-User-Agent': 'Model: MAG250; Link: Ethernet',
        'Authorization': 'Bearer 123'
    };

    let workingPath = '';
    let token = '';

    try {
        // ৩. লুপ চালিয়ে চেক করা এবং লগ রাখা
        for (const path of portalPaths) {
            const targetUrl = `${baseUrl}${path}?type=stb&action=handshake&token=&prehash=false&JsHttpRequest=1-xml`;
            
            try {
                const response = await axios.get(targetUrl, { 
                    headers, 
                    httpsAgent, // SSL Bypass
                    timeout: 4000 
                });

                const rawData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
                
                // লগ সেভ করছি
                debugLogs.push({
                    path: path,
                    status: response.status,
                    has_token: rawData.includes('token'),
                    preview: rawData.substring(0, 50) // রেসপন্সের প্রথম ৫০ অক্ষর
                });

                let tempToken = extract(rawData, "token") || response.data?.js?.token;

                if (tempToken) {
                    workingPath = path;
                    token = tempToken;
                    break;
                }
            } catch (e) {
                // এরর লগ
                debugLogs.push({
                    path: path,
                    error: e.message,
                    status: e.response?.status || 'Unknown',
                    response_data: e.response?.data ? JSON.stringify(e.response.data).substring(0, 50) : 'No Data'
                });
            }
        }

        // ৪. যদি ফেইল করে, তাহলে পুরো লগ পাঠিয়ে দেব
        if (!token) {
            return res.json({ 
                success: false, 
                message: '❌ Handshake Failed',
                debug_info: debugLogs // এখানেই আপনি আসল কারণ দেখতে পাবেন
            });
        }

        // ৫. সফল হলে বাকি ডাটা আনা (Profile)
        headers['Authorization'] = `Bearer ${token}`;
        
        let profData = {};
        try {
            const profUrl = `${baseUrl}${workingPath}?type=stb&action=get_profile&JsHttpRequest=1-xml`;
            const profRes = await axios.get(profUrl, { headers, httpsAgent, timeout: 5000 });
            profData = profRes.data?.js || {};
        } catch (e) {
            debugLogs.push({ step: 'get_profile', error: e.message });
        }

        // সফল রেসপন্স
        return res.json({
            success: true,
            message: 'Active Account ✅',
            connected_path: workingPath,
            data: {
                mac: mac,
                expiry: profData.phone || profData.end_date || 'Unlimited',
                created: profData.created || 'Unknown',
                username: profData.login || profData.fname || 'N/A',
                password: profData.password || 'N/A',
                tariff_id: profData.tariff_plan_id || 'N/A',
                m3u: `${baseUrl}/get.php?username=${mac}&password=${mac}&type=m3u_plus&output=ts`
            },
            logs: debugLogs // সফল হলেও লগ দেখাবে
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: 'Server Crash', error: error.message, logs: debugLogs });
    }
};
