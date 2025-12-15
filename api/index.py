from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import json
import re

app = Flask(__name__)
CORS(app)

# 🛠️ Universal Logic: JSON ফেইল করলে টেক্সট থেকে ডাটা বের করবে
def extract_value(text, key):
    try:
        if f'"{key}":"' in text:
            return text.split(f'"{key}":"')[1].split('"')[0].replace(r'\/', '/')
        if f'"{key}":' in text: # সংখ্যার জন্য (যেমন max_online)
            return text.split(f'"{key}":')[1].split(',')[0].replace('}', '')
    except:
        pass
    return None

@app.route('/api/check', methods=['POST'])
def check_mac():
    data = request.json
    host = data.get('host', '').strip()
    mac = data.get('mac', '').strip()

    if not host or not mac:
        return jsonify({'success': False, 'message': 'Missing Host or MAC'})

    # URL ক্লিনিং এবং সেটআপ
    if host.endswith('/'): host = host[:-1]
    
    # অটোমেটিক পাথ ডিটেকশন (FluxStream Logic)
    # /c/ থাকলে সেটা ডিটেক্ট করবে, না থাকলে কমন পাথ চেক করবে
    base_url = host
    if '/c/' in host:
        base_url = host.split('/c/')[0]
        portal_paths = ['/c/portal.php', '/c/server/load.php']
    else:
        # সাধারণ পাথ লিস্ট
        portal_paths = [
            '/portal.php', 
            '/server/load.php', 
            '/stalker_portal/server/load.php',
            '/magportal/portal.php',
            '/c/portal.php'
        ]

    # সেশন তৈরি (Python Requests Session কুকি অটোমেটিক হ্যান্ডেল করে)
    session = requests.Session()
    
    # 🛡️ হেডার কনফিগারেশন (FluxStream Headers)
    headers = {
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'Cookie': f'mac={mac}; stb_lang=en; timezone=Europe/Paris;',
        'Accept': '*/*',
        'Referer': base_url + '/',
        'Authorization': 'Bearer 123',
        'X-User-Agent': 'Model: MAG250; Link: Ethernet'
    }

    token = None
    working_path = ""
    raw_response = ""

    # ১. হ্যান্ডশেক লুপ (Handshake)
    for path in portal_paths:
        try:
            target = f"{base_url}{path}?type=stb&action=handshake&token=&prehash=false&JsHttpRequest=1-xml"
            resp = session.get(target, headers=headers, timeout=6)
            
            # টোকেন চেক (JSON বা Text দুইভাবেই)
            extracted_token = extract_value(resp.text, 'token')
            if extracted_token:
                token = extracted_token
                working_path = path
                break
        except:
            continue

    if not token:
        return jsonify({'success': False, 'message': '❌ Handshake Failed (Invalid MAC or Blocked)'})

    # ২. প্রোফাইল এবং বিস্তারিত তথ্য (Profile & Main Info)
    # টোকেন আপডেট
    headers['Authorization'] = f"Bearer {token}"
    
    info_data = {}
    
    try:
        # Get Profile
        prof_url = f"{base_url}{working_path}?type=stb&action=get_profile&JsHttpRequest=1-xml"
        prof_resp = session.get(prof_url, headers=headers, timeout=6)
        raw_text = prof_resp.text
        
        # সব তথ্য বের করা হচ্ছে (FluxStream Style)
        info_data['expiry'] = extract_value(raw_text, 'phone') or extract_value(raw_text, 'end_date') or 'Unlimited'
        info_data['created'] = extract_value(raw_text, 'created') or 'Unknown'
        info_data['username'] = extract_value(raw_text, 'login') or extract_value(raw_text, 'fname') or 'N/A'
        info_data['password'] = extract_value(raw_text, 'password') or 'N/A'
        info_data['stb_type'] = extract_value(raw_text, 'stb_type') or 'MAG250'
        info_data['portal_path'] = working_path

        # Get Main Info (Max Online এর জন্য)
        main_url = f"{base_url}{working_path}?type=account_info&action=get_main_info&JsHttpRequest=1-xml"
        main_resp = session.get(main_url, headers=headers, timeout=5)
        info_data['max_online'] = extract_value(main_resp.text, 'max_online') or '1'
        info_data['status'] = extract_value(main_resp.text, 'status') or 'Active'

    except Exception as e:
        return jsonify({'success': False, 'message': f'Profile Error: {str(e)}'})

    # ৩. M3U লিংক জেনারেট
    # কিছু পোর্টালে ইউজারনেম লাগে, কিছুতে ম্যাক। আমরা সেফটির জন্য দুটোই দিচ্ছি।
    user = info_data['username'] if info_data['username'] != 'N/A' else mac
    passwd = info_data['password'] if info_data['password'] != 'N/A' else mac
    
    # FluxStream ফরম্যাট অনুযায়ী ক্লিন হোস্ট
    clean_host = base_url
    if clean_host.endswith('/c'): clean_host = clean_host[:-2] # /c থাকলে বাদ দিয়ে রুট ইউআরএল নেওয়া ভালো m3u এর জন্য
    
    m3u_link = f"{clean_host}/get.php?username={user}&password={passwd}&type=m3u_plus&output=ts"

    # ফাইনাল রেসপন্স
    return jsonify({
        'success': True,
        'message': 'Active Account ✅',
        'data': {
            'mac': mac,
            'expiry': info_data.get('expiry'),
            'created': info_data.get('created'),
            'username': info_data.get('username'),
            'password': info_data.get('password'),
            'max_online': info_data.get('max_online'),
            'status': info_data.get('status'),
            'm3u': m3u_link
        }
    })

# Vercel entry point
if __name__ == '__main__':
    app.run()
