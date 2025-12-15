// app/page.js
'use client';
import { useState } from 'react';

export default function Home() {
  const [host, setHost] = useState('');
  const [mac, setMac] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const checkPortal = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      // আমাদের নিজেদের তৈরি করা Backend API তে রিকোয়েস্ট পাঠাচ্ছি
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, mac }),
      });

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ error: 'Failed to connect to internal API' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gray-900 text-white">
      <div className="w-full max-w-md p-8 bg-gray-800 rounded-lg shadow-xl border border-gray-700">
        <h1 className="text-2xl font-bold mb-6 text-center text-green-400">IPTV Portal Checker</h1>
        
        <form onSubmit={checkPortal} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Portal URL (http://...)</label>
            <input
              type="text"
              required
              placeholder="http://example.com:8080/c/"
              className="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-green-500"
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm mb-1">MAC Address</label>
            <input
              type="text"
              required
              placeholder="00:1A:79:XX:XX:XX"
              className="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-green-500"
              value={mac}
              onChange={(e) => setMac(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 rounded font-bold transition disabled:opacity-50"
          >
            {loading ? 'Checking...' : 'Check Validity'}
          </button>
        </form>

        {/* Result Display Section */}
        {result && (
          <div className={`mt-6 p-4 rounded ${result.success ? 'bg-green-900/50 border-green-500' : 'bg-red-900/50 border-red-500'} border`}>
            <h3 className="font-bold mb-2">{result.success ? 'Active ✅' : 'Failed ❌'}</h3>
            <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </main>
  );
}
