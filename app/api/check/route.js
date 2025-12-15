// app/api/check/route.js
import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request) {
  try {
    // 1. ফ্রন্টএন্ড থেকে ডাটা নেওয়া
    const body = await request.json();
    const { host, mac } = body;

    if (!host || !mac) {
      return NextResponse.json({ error: 'Host and MAC are required' }, { status: 400 });
    }

    // 2. টার্গেট ইউআরএল সেটআপ (আপনার লজিক অনুযায়ী)
    // উদাহরণ: আমরা শুধু চেক করছি সার্ভার লাইভ আছে কিনা
    // আপনি এখানে Stalker Portal এর handshake URL বসাতে পারেন
    const targetUrl = `${host}/portal.php`; 

    // 3. রিকোয়েস্ট হেডার কনফিগারেশন (Backend থেকে রিকোয়েস্ট যাচ্ছে, তাই CORS ধরবে না)
    const config = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'Cookie': `mac=${mac}; stb_lang=en; timezone=Europe/Paris;`,
        'Accept': '*/*',
        // অন্যান্য প্রয়োজনীয় হেডার এখানে যোগ করবেন
      },
      timeout: 5000 // ৫ সেকেন্ড টাইমআউট
    };

    // 4. এক্সটার্নাল সার্ভারে রিকোয়েস্ট পাঠানো
    const response = await axios.get(targetUrl, config);

    // 5. রেসপন্স প্রসেসিং (এখানে আপনার Python এর লজিক কনভার্ট করে বসাতে হবে)
    // উদাহরণস্বরূপ আমরা শুধু স্ট্যাটাস পাঠাচ্ছি
    return NextResponse.json({
      success: true,
      status: response.status,
      data: "Server Responded (Add your parsing logic here)" 
    });

  } catch (error) {
    console.error('Proxy Error:', error.message);
    return NextResponse.json({ 
      success: false, 
      error: 'Connection Failed or Invalid MAC',
      details: error.message 
    }, { status: 500 });
  }
}
