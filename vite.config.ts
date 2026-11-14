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
          'Keys Wizard runs in the browser. It has no accounts, no ads, and no analytics. Song files stay on the computer of the person who uses it. The code is open source (MIT). It was made by Antonio Rodríguez Martínez (antoniwan).',
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
  plugins: [siteUrl(), cleanUrls(), seoFiles()],
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      input: Object.fromEntries(
        [...PAGES.map((p) => p.file), '404.html'].map((f) => [f.replace('.html', ''), resolve(__dirname, f)]),
      ),
    },
  },
});
