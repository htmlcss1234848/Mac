from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import json
import re

app = Flask(__name__)
CORS(app)

# সেশন এবং হেডার কনফিগারেশন
def get_headers(mac, host):
    return {
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'Cookie': f'mac={mac}; stb_lang=en; timezone=Europe/Paris;',
        'Accept': '*/*',
        'Referer': host + '/c/',
        'X-User-Agent': 'Model: MAG250; Link: Ethernet',
        'Authorization': 'Bearer 123'
    }

def extract_token(text):
    try:
        if '"token":"' in text:
            return text.split('"token":"')[1].split('"')[0]
        # JSON পার্স করার চেষ্টা
        data = json.loads(text)
        return data.get('js', {}).get('token')
    except:
        return None

def extract_info(text, key):
    try:
        if f'"{key}":"' in text:
            return text.split(f'"{key}":"')[1].split('"')[0].replace(r'\/', '/')
    except:
        pass
    return 'N/A'

@app.route('/api/check', methods=['POST'])
def check_mac():
    data = request.json
    host = data.get('host', '').strip()
    mac = data.get('mac', '').strip()

    if not host or not mac:
        return jsonify({'success': False, 'message': 'Missing Host or MAC'})

    # URL ক্লিন করা
    if host.endswith('/'): host = host[:-1]
    # অটোমেটিক /c/ বা পাথ ডিটেকশন লজিক
    paths = ['/portal.php', '/c/portal.php', '/server/load.php', '/stalker_portal/server/load.php']
    
    # হোস্ট যদি অলরেডি /c/ থাকে তবে পাথের শুরুতে /c/ বাদ দিতে হবে বা এডজাস্ট করতে হবে
    if '/c/' in host:
        base_host = host.split('/c/')[0]
        paths = ['/c/portal.php', '/c/server/load.php']
    else:
        base_host = host

    session = requests.Session()
    headers = get_headers(mac, base_host)
    
    token = None
    working_path = ""
    
    # ১. হ্যান্ডশেক (Handshake)
    for path in paths:
        target_url = f"{base_host}{path}?type=stb&action=handshake&token=&prehash=false&JsHttpRequest=1-xml"
        try:
            resp = session.get(target_url, headers=headers, timeout=5)
            # টেক্সট রেসপন্স চেক (পাইথন স্ক্রিপ্টের মতো)
            if 'token' in resp.text:
                token = extract_token(resp.text)
                if token:
                    working_path = path
                    break
        except:
            continue

    if not token:
        return jsonify({'success': False, 'message': 'MAC Dead / Handshake Failed ❌'})

    # ২. প্রোফাইল ইনফো (Profile Info)
    headers['Authorization'] = f"Bearer {token}"
    profile_url = f"{base_host}{working_path}?type=stb&action=get_profile&JsHttpRequest=1-xml"
    
    try:
        prof_resp = session.get(profile_url, headers=headers, timeout=5)
        text = prof_resp.text
        
        # পাইথন স্টাইলে ডাটা বের করা (JSON ফেইল করলেও কাজ করবে)
        expiry = extract_info(text, 'phone') or extract_info(text, 'end_date') or 'Unlimited'
        created = extract_info(text, 'created') or 'Unknown'
        username = extract_info(text, 'login') or extract_info(text, 'fname') or 'N/A'
        password = extract_info(text, 'password') or 'N/A'
        
        m3u_link = f"{base_host}/get.php?username={mac}&password={mac}&type=m3u_plus&output=ts"

        return jsonify({
            'success': True,
            'message': 'Active Account ✅',
            'data': {
                'mac': mac,
                'expiry': expiry,
                'created': created,
                'username': username,
                'password': password,
                'm3u': m3u_link
            }
        })

    except Exception as e:
        return jsonify({'success': False, 'message': f'Error: {str(e)}'})

# Vercel এর জন্য হ্যান্ডলার
app.debug = True
