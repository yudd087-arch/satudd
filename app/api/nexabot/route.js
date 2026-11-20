import { NextResponse } from 'next/server';

const DEFAULT_BASE_URL = 'https://nexabot.id';

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

function normalizeBaseUrl(rawBase) {
  return (rawBase || DEFAULT_BASE_URL)
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');
}

export async function POST(req) {
  try {
    const body = await req.json();
    const apiKey = resolveApiKey(req, body);

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key NEXABOT tidak ditemukan. Set NEXABOT_API_KEY di Vercel atau isi di API Settings.' },
        { status: 401 }
      );
    }

    const action = body?.action || 'submit';
    const baseUrl = normalizeBaseUrl(body?.baseUrl);

    if (action === 'submit') {
      const targetUrl = `${baseUrl}/api/v1/api`;
      const payload = body?.payload || {};

      const upstreamRes = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
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

    if (action === 'download' || action === 'status') {
      const jobId = body?.jobId || body?.taskId;
      if (!jobId) {
        return NextResponse.json({ error: 'jobId wajib diisi.' }, { status: 400 });
      }

      const targetUrl = `${baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}/download`;
      const upstreamRes = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
        },
      });

      const contentType = upstreamRes.headers.get('content-type') || '';

      if (upstreamRes.ok && (contentType.includes('video/') || contentType.includes('octet-stream'))) {
        const buffer = await upstreamRes.arrayBuffer();
        const base64Video = Buffer.from(buffer).toString('base64');
        const mime = contentType.includes('video/') ? contentType.split(';')[0] : 'video/mp4';
        return NextResponse.json({
          ready: true,
          videoDataUrl: `data:${mime};base64,${base64Video}`,
        });
      }

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
