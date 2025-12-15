const axios = require('axios');
const https = require('https');
const crypto = require('crypto');

module.exports = async (req, res) => {
    // CORS Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

    const { host, mac } = req.body;
    if (!host || !mac) return res.status(400).json({ message: 'Missing Data' });

    // ১. অ্যাডভান্সড SSL/TLS স্পুফিং (Cloudflare বাইপাস করার মেইন অস্ত্র)
    // আমরা ব্রাউজারের মতো সাইফার (Ciphers) লিস্ট দিচ্ছি
    const agent = new https.Agent({
        rejectUnauthorized: false,
        keepAlive: true,
        ciphers: [
            'TLS_AES_128_GCM_SHA256',
            'TLS_AES_256_GCM_SHA384',
            'TLS_CHACHA20_POLY1305_SHA256',
            'ECDHE-ECDSA-AES128-GCM-SHA256',
            'ECDHE-RSA-AES128-GCM-SHA256',
            'ECDHE-ECDSA-AES256-GCM-SHA384',
            'ECDHE-RSA-AES256-GCM-SHA384',
            'ECDHE-ECDSA-CHACHA20-POLY1305',
            'ECDHE-RSA-CHACHA20-POLY1305',
            'ECDHE-RSA-AES128-SHA',
            'ECDHE-RSA-AES256-SHA',
            'AES128-GCM-SHA256',
            'AES256-GCM-SHA384',
            'AES128-SHA',
            'AES256-SHA'
        ].join(':'),
        ecdhCurve: 'prime256v1:secp384r1',
        secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT
    });

    // ২. একদম রিয়েল ব্রাউজারের মতো হেডার
    const browserHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Connection': 'keep-alive',
        'Cookie': `mac=${mac}; stb_lang=en; timezone=Europe/Paris;`
    };

    const extract = (text, key) => {
        try {
            if (typeof text !== 'string') text = JSON.stringify(text);
            const parts = text.split(`"${key}":"`);
            if (parts.length > 1) return parts[1].split('"')[0].replace(/\\/g, '');
        } catch (e) {}
        return null;
    };

    let baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
    const paths = ['/portal.php', '/server/load.php', '/c/portal.php']; // ছোট লিস্ট, ব্লক এড়াতে
    
    let token = '';
    let workingPath = '';
    let debugLogs = [];

    try {
        for (const path of paths) {
            const targetUrl = `${baseUrl}${path}?type=stb&action=handshake&token=&prehash=false&JsHttpRequest=1-xml`;
            
            try {
                const response = await axios.get(targetUrl, { 
                    headers: browserHeaders, 
                    httpsAgent: agent, // কাস্টম এজেন্ট ব্যবহার
                    timeout: 5000 
                });

                const rawData = JSON.stringify(response.data);
                
                // ডিবাগ লগ
                debugLogs.push({ path, status: response.status, data_preview: rawData.substring(0, 50) });

                let tempToken = extract(rawData, "token") || response.data?.js?.token;
                if (tempToken) {
                    workingPath = path;
                    token = tempToken;
                    break;
                }
            } catch (e) {
                // 403 এরর হ্যান্ডেলিং
                debugLogs.push({ path, error: e.message, status: e.response?.status });
                continue;
            }
        }

        if (!token) {
            return res.json({ 
                success: false, 
                message: '❌ Blocked by Cloudflare or Invalid',
                debug_info: debugLogs
            });
        }

        // সফল হলে টোকেন দিয়ে রিকোয়েস্ট
        const authHeaders = { ...browserHeaders, 'Authorization': `Bearer ${token}` };
        
        const profRes = await axios.get(`${baseUrl}${workingPath}?type=stb&action=get_profile&JsHttpRequest=1-xml`, { 
            headers: authHeaders, 
            httpsAgent: agent,
            timeout: 5000 
        });

        const p = profRes.data?.js || {};

        return res.json({
            success: true,
            message: 'Bypassed & Active ✅',
            data: {
                mac,
                expiry: p.phone || p.end_date || 'Unlimited',
                created: p.created,
                username: p.login || p.fname || 'N/A',
                password: p.password || 'N/A',
                m3u: `${baseUrl}/get.php?username=${mac}&password=${mac}&type=m3u_plus&output=ts`
            }
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: 'Server Error', error: error.message, logs: debugLogs });
    }
};
