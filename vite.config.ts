import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/** The pages of the site, with what a search engine should know about each. */
const PAGES = [
  { path: '/', file: 'index.html', priority: '1.0' },
  { path: '/about', file: 'about.html', priority: '0.7' },
  { path: '/privacy', file: 'privacy.html', priority: '0.4' },
];

/** Writes robots.txt, sitemap.xml, and llms.txt with the correct site address. */
function seoFiles(site: string): Plugin {
  const today = new Date().toISOString().slice(0, 10);
  return {
    name: 'keys-wizard-seo-files',
    generateBundle() {
      const urls = PAGES.map(
        (p) => `  <url><loc>${site}${p.path}</loc><lastmod>${today}</lastmod><priority>${p.priority}</priority></url>`,
      );
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`,
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
          `- [The app](${site}/): open a song and practice it`,
          `- [About](${site}/about): what the app does, its limits, and who made it`,
          `- [Privacy](${site}/privacy): what data the app uses and where the data stays`,
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

export default defineConfig(({ mode }) => {
  const site = (loadEnv(mode, process.cwd()).VITE_SITE_URL ?? '').replace(/\/$/, '');
  return {
    server: { port: 5183 },
    plugins: [cleanUrls(), seoFiles(site)],
    build: {
      chunkSizeWarningLimit: 2500,
      rollupOptions: {
        input: Object.fromEntries(
          [...PAGES.map((p) => p.file), '404.html'].map((f) => [f.replace('.html', ''), resolve(__dirname, f)]),
        ),
      },
    },
  };
});
