import type { APIRoute } from 'astro';
import { livePantheons, getSystem } from '../lib/content';

const BASE = (import.meta.env.SITE || 'https://mythos-d4t.pages.dev').replace(/\/+$/, '');

export const GET: APIRoute = () => {
  const urls: { loc: string; priority: string }[] = [{ loc: '/', priority: '1.0' }];

  for (const p of livePantheons) {
    const system = getSystem(p.id);
    urls.push({ loc: `/${p.id}/`, priority: '0.9' });
    for (const s of p.sections) {
      if (!s.route) continue;
      urls.push({ loc: `/${p.id}/${s.route}/`, priority: '0.5' });
    }
    for (const e of system?.entries ?? []) {
      urls.push({ loc: `/${p.id}/entry/${e.id}/`, priority: '0.8' });
    }
  }

  urls.push({ loc: '/about/', priority: '0.3' });

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${BASE}${u.loc}</loc><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
