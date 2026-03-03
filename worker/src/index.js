/**
 * Cloudflare Worker — Proxy de descarga para SubjectPacks.
 * Solo permite descargar assets de Mlgpigeon/SubjectPacks (GitHub Releases).
 * Añade CORS headers para que el navegador pueda hacer fetch.
 */

const ALLOWED_REPO = 'Mlgpigeon/SubjectPacks';
const GH_API = 'https://api.github.com';

export default {
  async fetch(request) {
    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const url = new URL(request.url);
    const assetId = url.pathname.slice(1); // e.g., "365737888"

    if (!assetId || !/^\d+$/.test(assetId)) {
      return new Response('Asset ID inválido', { status: 400 });
    }

    // Descargar el asset desde la API de GitHub
    const ghUrl = `${GH_API}/repos/${ALLOWED_REPO}/releases/assets/${assetId}`;
    const ghRes = await fetch(ghUrl, {
      headers: {
        'Accept': 'application/octet-stream',
        'User-Agent': 'ExamCoach-Worker',
      },
      redirect: 'follow',
    });

    if (!ghRes.ok) {
      return new Response(`GitHub error: ${ghRes.status}`, {
        status: ghRes.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    return new Response(ghRes.body, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  },
};
