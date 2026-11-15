import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import pkg from './package.json';

/**
 * The public address of the site: the homepage field in package.json.
 * Canonical links, the sitemap, robots.txt, llms.txt, and the structured
 * data all read it. If the site moves, change that one field.
 */
const SITE = pkg.homepage.replace(/\/$/, '');

/** The pages of the site, with what a search engine should know about each. */
const PAGES = [
  { path: '/', file: 'index.html', priority: '1.0' },
  { path: '/about', file: 'about.html', priority: '0.7' },
  { path: '/privacy', file: 'privacy.html', priority: '0.4' },
];

/**
 * Visit counts, on the live site only. Vercel sets VERCEL_ENV to "production" for the build of main, so
 * local builds, tests, and previews add nothing. Two counters run side by side, and neither sets a cookie:
 * Vercel Web Analytics (served from this site) and Stats, the Umami that Antonio hosts for all his sites.
 * The privacy page says what they see. If this changes, change privacy.html in the same commit.
 */
const STATS = {
  host: 'https://antoniwan-stats.vercel.app',
  websiteId: 'ef253480-5d25-4742-9b86-c8bda7969488',
};

/**
 * Runs before the counters load. Clicks on links to other sites become an "outbound" event with the host and
 * the address without its query. A call to action (data-umami-event="cta") that leaves the site keeps its
 * own event and gets the same two properties, so the click counts once.
 */
const STATS_HOOK = `window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
document.addEventListener('click', function (event) {
  var link = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!link) return;
  var url = new URL(link.href, location.href);
  if (!/^https?:$/.test(url.protocol) || url.host === location.host) return;
  if (link.getAttribute('data-umami-event') === 'cta') {
    link.setAttribute('data-umami-event-to', url.hostname);
    link.setAttribute('data-umami-event-url', url.origin + url.pathname);
    return;
  }
  if (link.hasAttribute('data-umami-event')) return;
  if (window.umami) window.umami.track('outbound', { to: url.hostname, url: url.origin + url.pathname });
}, true);`;

/** Adds the visit counters to every page of the live site. */
function analytics(): Plugin {
  const live = process.env.VERCEL_ENV === 'production';
  return {
    name: 'keys-wizard-analytics',
    apply: 'build',
    transformIndexHtml: () =>
      live
        ? [
            { tag: 'script', children: STATS_HOOK, injectTo: 'head' },
            { tag: 'script', attrs: { defer: true, src: '/_vercel/insights/script.js' }, injectTo: 'head' },
            {
              tag: 'script',
              attrs: {
                defer: true,
                src: `${STATS.host}/p.js`,
                'data-website-id': STATS.websiteId,
                'data-domains': new URL(SITE).hostname,
                'data-do-not-track': 'true',
              },
              injectTo: 'head',
            },
          ]
        : [],
  };
}

/** Puts the site address into each page where it says %SITE_URL%. */
function siteUrl(): Plugin {
  return {
    name: 'keys-wizard-site-url',
    transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('%SITE_URL%', SITE) },
  };
}

/** Writes robots.txt, sitemap.xml, and llms.txt with the correct site address. */
function seoFiles(): Plugin {
  const today = new Date().toISOString().slice(0, 10);
  return {
    name: 'keys-wizard-seo-files',
    generateBundle() {
      const urls = PAGES.map(
        (p) => `  <url><loc>${SITE}${p.path}</loc><lastmod>${today}</lastmod><priority>${p.priority}</priority></url>`,
      );
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'llms.txt',
        source: [
          '# Keys Wizard',
          '',
          '> A free web app to learn songs on a MIDI keyboard. You open a MIDI, Guitar Pro, MusicXML, or text tab file. The notes fall onto a keyboard on the screen. The song waits until you play the correct key.',
          '',
          'Keys Wizard runs in the browser. It has no accounts, no ads, and no cookies. It counts visits without cookies. Song files stay on the computer of the person who uses it. The code is open source (MIT). It was made by Antonio Rodríguez Martínez (antoniwan).',
          '',
          '## Pages',
          '',
          `- [The app](${SITE}/): open a song and practice it`,
          `- [About](${SITE}/about): what the app does, its limits, and who made it`,
          `- [Privacy](${SITE}/privacy): what data the app uses and where the data stays`,
          '',
          '## Source',
          '',
          '- [Code on GitHub](https://github.com/antoniwan/keys-wizard)',
          '- [README](https://github.com/antoniwan/keys-wizard/blob/main/README.md): features, file types, and limits',
          '- [Maker](https://antoniwan.online)',
          '',
        ].join('\n'),
      });
    },
  };
}

/** In development, serve /about and /privacy the way the live site does. */
function cleanUrls(): Plugin {
  return {
    name: 'keys-wizard-clean-urls',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const page = PAGES.find((p) => p.path !== '/' && req.url?.split('?')[0] === p.path);
        if (page) req.url = `/${page.file}`;
        next();
      });
    },
  };
}

export default defineConfig({
  server: { port: 5183 },
  plugins: [siteUrl(), cleanUrls(), seoFiles(), analytics()],
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      input: Object.fromEntries(
        [...PAGES.map((p) => p.file), '404.html'].map((f) => [f.replace('.html', ''), resolve(__dirname, f)]),
      ),
    },
  },
});
