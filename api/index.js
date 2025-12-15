// api/index.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/check', async (req, res) => {
    const { host, mac } = req.body;

    if (!host || !mac) return res.status(400).json({ success: false, message: 'Missing Host or MAC' });

    // ১. URL ক্লিন করা
    const cleanHost = host.endsWith('/') ? host : `${host}/`;
    
    // ২. সাধারণ হেডার
    const headers = {
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'Cookie': `mac=${mac}; stb_lang=en; timezone=Europe/Paris;`,
        'Accept': '*/*',
        'Referer': cleanHost,
        'X-User-Agent': 'Model: MAG250; Link: Ethernet'
    };

    try {
        // ধাপ ১: Handshake (Token পাওয়ার জন্য)
        const handshakeUrl = `${cleanHost}portal.php?type=stb&action=handshake&token=&prehash=false&JsHttpRequest=1-xml`;
        const handResponse = await axios.get(handshakeUrl, { headers, timeout: 8000 });
        const handData = handResponse.data;

        // চেক করা টোকেন পাওয়া গেছে কিনা
        if (!handData?.js?.token) {
            return res.json({ success: false, message: 'MAC Dead or Invalid Host ❌' });
        }

        const token = handData.js.token;

        // ধাপ ২: প্রোফাইল ডাটা (Expiry Date পাওয়ার জন্য)
        const profileUrl = `${cleanHost}portal.php?type=stb&action=get_profile&JsHttpRequest=1-xml`;
        // প্রোফাইল রিকোয়েস্টে Authorization হেডার লাগে
        const profileHeaders = { ...headers, 'Authorization': `Bearer ${token}` };
        
        const profileResponse = await axios.get(profileUrl, { headers: profileHeaders, timeout: 8000 });
        const profileData = profileResponse.data;

        if (profileData?.js) {
            // M3U লিংক তৈরি করা (Stalker Middleware এর ডিফল্ট ফরম্যাট অনুযায়ী)
            // নোট: সব পোর্টালে এই ফরম্যাট কাজ নাও করতে পারে, তবে ৯০% ক্ষেত্রে করে
            const m3uLink = `${cleanHost}get.php?username=${mac}&password=${mac}&type=m3u_plus&output=ts`;

            return res.json({
                success: true,
                message: 'Active Account ✅',
                data: {
                    mac: mac,
                    expiry: profileData.js.phone || profileData.js.end_date || 'Unlimited/Unknown',
                    created: profileData.js.created || 'Unknown',
                    token: token,
                    m3u: m3uLink
                }
            });
        } else {
            return res.json({ success: true, message: 'Active (No Profile Data)', data: { mac, expiry: 'Unknown' } });
        }

    } catch (error) {
        console.error("API Error:", error.message);
        return res.status(500).json({ success: false, message: 'Connection Error', error: error.message });
    }
});

module.exports = app;
            headers, 
            timeout: 8000 // 8s timeout
        });

        const data = response.data;
        
        // Checking if response contains token/js object (Sign of valid MAC)
        if (data && typeof data === 'object' && data.js && data.js.token) {
             return res.json({ 
                success: true, 
                message: 'Active MAC', 
                data: data.js 
            });
        } else {
            return res.json({ 
                success: false, 
                message: 'MAC invalid or expired (No token received)',
                raw: data
            });
        }

    } catch (error) {
        console.error("Proxy Error:", error.message);
        return res.status(500).json({ 
            success: false, 
            message: 'Connection Failed. Check if the Host URL is correct and reachable.', 
            error: error.message 
        });
    }
});

// Export for Vercel
module.exports = app;
