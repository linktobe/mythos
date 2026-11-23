import type { APIRoute } from 'astro';
import data from '../generated/entities.json';

const BASE = 'https://mythos-d4t.pages.dev';

export const GET: APIRoute = () => {
  const urls = [
    { loc: '/', priority: '1.0' },
    ...data.entries.map((e) => ({ loc: `/shen/${e.id}/`, priority: '0.8' })),
    { loc: '/qun/', priority: '0.5' },
    { loc: '/qi/', priority: '0.5' },
    { loc: '/di/', priority: '0.6' },
    { loc: '/tu/', priority: '0.5' },
    { loc: '/about/', priority: '0.3' },
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${BASE}${u.loc}</loc><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
