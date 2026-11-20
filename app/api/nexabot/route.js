import { NextResponse } from 'next/server';

const DEFAULT_BASE_URL = 'https://nexabot.id/api';

function resolveApiKey(req, body) {
  const headerKey = req.headers.get('x-api-key') || '';
  const authHeader = req.headers.get('authorization') || '';
  const bearerKey = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const bodyKey = body && typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const envKey = process.env.NEXABOT_API_KEY ? process.env.NEXABOT_API_KEY.trim() : '';

  return (headerKey || bearerKey || bodyKey || envKey).replace(/^Bearer\s+/i, '').trim();
}

function buildTargetUrl(baseUrl, path) {
  const cleanBase = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const cleanPath = (path || '/v1/videos/r2v').startsWith('/')
    ? (path || '/v1/videos/r2v')
    : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const apiKey = resolveApiKey(req, body);

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key NEXABOT tidak ditemukan. Set NEXABOT_API_KEY di Vercel atau isi API key.' },
        { status: 401 }
      );
    }

    const action = body?.action || 'submit';
    const baseUrl = typeof body?.baseUrl === 'string' && body.baseUrl.trim()
      ? body.baseUrl.trim()
      : DEFAULT_BASE_URL;

    if (action === 'submit') {
      const targetUrl = buildTargetUrl(baseUrl, body?.endpointPath || '/v1/videos/r2v');
      const payload = body?.payload || {};

      const upstreamRes = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const text = await upstreamRes.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      return NextResponse.json(data, { status: upstreamRes.status });
    }

    if (action === 'status') {
      const taskId = body?.taskId;
      if (!taskId) {
        return NextResponse.json({ error: 'taskId wajib diisi untuk cek status.' }, { status: 400 });
      }

      const statusPath = (body?.statusPath || '/v1/videos/r2v/{id}').replace('{id}', encodeURIComponent(taskId));
      const targetUrl = buildTargetUrl(baseUrl, statusPath);

      const upstreamRes = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      const text = await upstreamRes.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      return NextResponse.json(data, { status: upstreamRes.status });
    }

    return NextResponse.json({ error: 'Action tidak didukung.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: `Proxy error: ${err?.message || 'Gagal menghubungi NEXABOT'}` },
      { status: 500 }
    );
  }
}
