// ClearFeed Hub — a Cloudflare Worker that holds the family's settings and
// receives activity logs from every device (TV module, ClearFeed, ClearFeed Web).
//
// Storage: one KV namespace bound as KV.
//   settings            -> the shared settings JSON (same shape as settings.json)
//   devices             -> { "<device name>": firstSeenMs }
//   log:<device name>   -> { lastSeen: ms, entries: [ {t, kind, reason, text, detail, site, url}, ... ] }
//
// Secrets (Settings -> Variables and Secrets):
//   ADMIN_KEY   used by the manager page: read logs, write settings
//   DEVICE_KEY  used by devices: read settings, append to their own log
//
// Nothing here ever sees what was watched: devices send only what was HIDDEN
// or BLOCKED, and only the title/search text they already judged.

const MAX_ENTRIES_PER_DEVICE = 1000;
const MAX_ENTRIES_PER_POST = 200;
const MAX_BODY_BYTES = 200 * 1024;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,x-cf-key',
  'Access-Control-Max-Age': '86400'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS }
  });
}
const err = (msg, status) => json({ error: msg }, status);

function role(req, env) {
  const k = req.headers.get('x-cf-key') || new URL(req.url).searchParams.get('k') || '';
  if (!k) return null;
  if (env.ADMIN_KEY && k === env.ADMIN_KEY) return 'admin';
  if (env.DEVICE_KEY && k === env.DEVICE_KEY) return 'device';
  return null;
}

const cleanName = (s) => String(s || '').trim().replace(/[^\w .-]/g, '').slice(0, 40) || 'unnamed';
const str = (v, n) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, n);

async function readLog(env, device) {
  const v = await env.KV.get('log:' + device, 'json');
  return v && Array.isArray(v.entries) ? v : { lastSeen: 0, entries: [] };
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/' || path === '/health') return json({ ok: true, service: 'clearfeed-hub' });

    if (!env.KV) return err('KV binding missing: add a KV namespace binding named KV', 500);
    if (!env.ADMIN_KEY || !env.DEVICE_KEY) return err('secrets missing: set ADMIN_KEY and DEVICE_KEY', 500);

    const who = role(req, env);
    if (!who) return err('unauthorised', 401);
    const admin = who === 'admin';

    // ---- settings ----
    if (path === '/settings' && req.method === 'GET') {
      const s = await env.KV.get('settings', 'json');
      return json(s || {});
    }
    if (path === '/settings' && req.method === 'PUT') {
      if (!admin) return err('admin key required', 403);
      let body;
      try { body = await req.json(); } catch (e) { return err('body must be JSON', 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return err('settings must be an object', 400);
      body._updatedAt = new Date().toISOString();
      await env.KV.put('settings', JSON.stringify(body));
      return json({ ok: true, updatedAt: body._updatedAt });
    }

    // ---- devices ----
    if (path === '/devices' && req.method === 'GET') {
      if (!admin) return err('admin key required', 403);
      const devices = (await env.KV.get('devices', 'json')) || {};
      const out = [];
      for (const name of Object.keys(devices)) {
        const l = await readLog(env, name);
        out.push({ name, firstSeen: devices[name], lastSeen: l.lastSeen, entries: l.entries.length });
      }
      out.sort((a, b) => b.lastSeen - a.lastSeen);
      return json(out);
    }

    // ---- log ----
    if (path === '/log' && req.method === 'POST') {
      if ((Number(req.headers.get('content-length')) || 0) > MAX_BODY_BYTES) return err('too large', 413);
      let body;
      try { body = await req.json(); } catch (e) { return err('body must be JSON', 400); }
      const device = cleanName(body.device);
      const incoming = Array.isArray(body.entries) ? body.entries.slice(0, MAX_ENTRIES_PER_POST) : [];
      const now = Date.now();
      const entries = incoming.map((e) => ({
        t: Number(e && e.t) || now,
        kind: str(e && e.kind, 20) || 'hidden',
        reason: str(e && e.reason, 40),
        text: str(e && e.text, 200),
        detail: str(e && e.detail, 120),
        site: str(e && e.site, 40),
        url: str(e && e.url, 300),
        creator: str(e && e.creator, 120),
        videoId: str(e && e.videoId, 20)
      }));
      const cur = await readLog(env, device);
      cur.lastSeen = now;
      if (entries.length) {
        cur.entries = entries.sort((a, b) => b.t - a.t).concat(cur.entries);
        if (cur.entries.length > MAX_ENTRIES_PER_DEVICE) cur.entries.length = MAX_ENTRIES_PER_DEVICE;
      }
      await env.KV.put('log:' + device, JSON.stringify(cur));
      const devices = (await env.KV.get('devices', 'json')) || {};
      if (!devices[device]) { devices[device] = now; await env.KV.put('devices', JSON.stringify(devices)); }
      return json({ ok: true, stored: entries.length, total: cur.entries.length });
    }
    if (path === '/log' && req.method === 'GET') {
      if (!admin) return err('admin key required', 403);
      const device = url.searchParams.get('device');
      const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 300));
      const since = Number(url.searchParams.get('since')) || 0;
      let names;
      if (device) names = [cleanName(device)];
      else names = Object.keys((await env.KV.get('devices', 'json')) || {});
      let all = [];
      for (const name of names) {
        const l = await readLog(env, name);
        for (const e of l.entries) { if (e.t > since) all.push({ device: name, ...e }); }
      }
      all.sort((a, b) => b.t - a.t);
      return json({ entries: all.slice(0, limit), devices: names });
    }
    if (path === '/log' && req.method === 'DELETE') {
      if (!admin) return err('admin key required', 403);
      const device = url.searchParams.get('device');
      const devices = (await env.KV.get('devices', 'json')) || {};
      const names = device ? [cleanName(device)] : Object.keys(devices);
      for (const name of names) {
        await env.KV.delete('log:' + name);
        delete devices[name];
      }
      await env.KV.put('devices', JSON.stringify(devices));
      return json({ ok: true, cleared: names });
    }

    return err('not found', 404);
  }
};
