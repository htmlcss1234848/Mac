// api/index.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Main checking route
app.post('/api/check', async (req, res) => {
    const { host, mac } = req.body;

    if (!host || !mac) {
        return res.status(400).json({ success: false, message: 'Host and MAC address required' });
    }

    // URL formatting (ensure it ends with /)
    const formattedHost = host.endsWith('/') ? host : `${host}/`;
    
    // Stalker Portal Handshake URL construction
    const targetUrl = `${formattedHost}portal.php?type=stb&action=handshake&token=&prehash=false&JsHttpRequest=1-xml`;

    const headers = {
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'Cookie': `mac=${mac}; stb_lang=en; timezone=Europe/Paris;`,
        'Accept': '*/*',
        'Referer': formattedHost,
        'X-User-Agent': 'Model: MAG250; Link: Ethernet'
    };

    try {
        // Request to external IPTV Server
        const response = await axios.get(targetUrl, { 
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
