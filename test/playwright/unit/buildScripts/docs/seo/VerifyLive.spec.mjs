import {test, expect}                          from '@playwright/test';
import {execFile}                              from 'node:child_process';
import http                                    from 'node:http';
import path                                    from 'node:path';
import {promisify}                             from 'node:util';
import verifyLiveSeoSurface, {countHtmlH1Tags} from '../../../../../../buildScripts/docs/seo/verifyLive.mjs';

const execFileAsync = promisify(execFile);
const CLI_PATH      = path.resolve(process.cwd(), 'buildScripts/docs/seo/verifyLive.mjs');

/**
 * @summary Verifies live HTTP SEO and agent-discovery surface probing against a local `node:http` fixture server.
 */
test.describe('buildScripts/docs/seo/verifyLive.mjs (#20999)', () => {
    let baseUrl, server, state;

    /**
     * @returns {Object}
     */
    function createDefaultState() {
        return {
            archiveNoindexHeader      : true,
            canonicalOrigin           : null,
            includeArchiveInIndex     : false,
            includeDiscussionsInIndex : true,
            includeNeoRouteJsonLd     : true,
            includeRobotsContentSignal: true,
            llmsExtraLine             : null,
            markdownTwinsEnabled      : true,
            robotsContentSignalLine   : 'Content-Signal: search=yes, ai-input=yes'
        };
    }

    test.beforeEach(async () => {
        state  = createDefaultState();
        server = http.createServer((req, res) => {
            const url           = new URL(req.url, baseUrl);
            const origin        = state.canonicalOrigin || baseUrl;
            const accept        = String(req.headers.accept || '');
            const wantsMarkdown = accept.includes('text/markdown');

            if (url.pathname === '/robots.txt') {
                const lines = [
                    'User-agent: *',
                    'Allow: /',
                    ...(state.includeRobotsContentSignal
                        ? [state.robotsContentSignalLine]
                        : []),
                    '',
                    `Sitemap: ${origin}/sitemap.xml`
                ];
                res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
                res.end(`${lines.join('\n')}\n`);
                return;
            }

            if (url.pathname === '/sitemap.xml') {
                const entries = [
                    `  <sitemap><loc>${origin}/sitemap-core.xml</loc></sitemap>`,
                    ...(state.includeDiscussionsInIndex
                        ? [`  <sitemap><loc>${origin}/sitemap-discussions.xml</loc></sitemap>`]
                        : []),
                    ...(state.includeArchiveInIndex
                        ? [`  <sitemap><loc>${origin}/sitemap-archive.xml</loc></sitemap>`]
                        : [])
                ];
                res.writeHead(200, {'Content-Type': 'application/xml; charset=utf-8'});
                res.end([
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                    ...entries,
                    '</sitemapindex>'
                ].join('\n'));
                return;
            }

            if (url.pathname === '/sitemap-core.xml') {
                res.writeHead(200, {'Content-Type': 'application/xml; charset=utf-8'});
                res.end([
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                    `  <url><loc>${origin}/</loc></url>`,
                    `  <url><loc>${origin}/learn/benefits/Introduction</loc></url>`,
                    '</urlset>'
                ].join('\n'));
                return;
            }

            if (url.pathname === '/sitemap-discussions.xml') {
                res.writeHead(200, {'Content-Type': 'application/xml; charset=utf-8'});
                res.end([
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                    `  <url><loc>${origin}/news/discussions/19733</loc></url>`,
                    '</urlset>'
                ].join('\n'));
                return;
            }

            if (url.pathname === '/llms.txt') {
                res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
                res.end([
                    '# Neo.mjs: An Agent Institution',
                    '',
                    `- [Introduction](${origin}/raw/learn/benefits/Introduction.md)`,
                    ...(state.llmsExtraLine ? [state.llmsExtraLine] : []),
                    '',
                    '## Optional',
                    `- [Full Atlas](${origin}/llms-full.txt)`,
                    `- [Complete Corpus](${origin}/llms-all.txt)`
                ].join('\n'));
                return;
            }

            if (url.pathname === '/llms-full.txt') {
                res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
                res.end('# Neo.mjs: Full Documentation Atlas\n\nPersistent AI maintainers.\n');
                return;
            }

            if (url.pathname === '/') {
                res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
                res.end([
                    '<!DOCTYPE html>',
                    '<html><head>',
                    '<title>Neo.mjs - An Agent Institution</title>',
                    '<meta name="description" content="Persistent AI maintainers and multi-threaded UI engine.">',
                    `<link rel="canonical" href="${origin}/">`,
                    '<script type="application/ld+json" data-schema-name="neo-organism">',
                    '{"@context":"https://schema.org","@type":"WebSite","name":"Neo.mjs"}',
                    '</script>',
                    '</head><body><h1>Neo.mjs</h1></body></html>'
                ].join('\n'));
                return;
            }

            if (url.pathname === '/learn/benefits/Introduction.md') {
                if (!state.markdownTwinsEnabled) {
                    res.writeHead(302, {
                        'Content-Type': 'text/html; charset=utf-8',
                        Location      : '/#/learn/benefits/Introduction'
                    });
                    res.end('<!DOCTYPE html><html><body>Redirecting</body></html>');
                    return;
                }

                res.writeHead(200, {
                    'Content-Type': 'text/markdown; charset=utf-8',
                    Vary          : 'Accept'
                });
                res.end('# What Is Neo.mjs?\n\nPersistent AI maintainers and multi-threaded UI runtime.\n');
                return;
            }

            if (url.pathname === '/learn/benefits/Introduction') {
                if (wantsMarkdown) {
                    if (!state.markdownTwinsEnabled) {
                        res.writeHead(302, {
                            'Content-Type': 'text/html; charset=utf-8',
                            Location      : '/#/learn/benefits/Introduction'
                        });
                        res.end('<!DOCTYPE html><html><body>Redirecting</body></html>');
                        return;
                    }

                    res.writeHead(200, {
                        'Content-Type': 'text/markdown; charset=utf-8',
                        Vary          : 'Accept'
                    });
                    res.end('# What Is Neo.mjs?\n\nPersistent AI maintainers and multi-threaded UI runtime.\n');
                    return;
                }

                res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
                res.end([
                    '<!DOCTYPE html>',
                    '<html><head>',
                    '<title>What Is Neo.mjs? | Neo.mjs</title>',
                    '<meta name="description" content="Persistent AI maintainers and multi-threaded UI runtime.">',
                    `<link rel="canonical" href="${origin}/learn/benefits/Introduction">`,
                    ...(state.includeNeoRouteJsonLd
                        ? [
                            '<script type="application/ld+json" data-schema-name="neo-route">',
                            '{"@context":"https://schema.org","@type":"TechArticle","headline":"What Is Neo.mjs?"}',
                            '</script>'
                        ]
                        : []),
                    '</head><body><h1>What Is Neo.mjs?</h1></body></html>'
                ].join('\n'));
                return;
            }

            if (url.pathname === '/news/tickets/20671') {
                const robotsHeader = state.archiveNoindexHeader
                    ? {'X-Robots-Tag': 'noindex, follow'}
                    : {};

                if (wantsMarkdown) {
                    if (!state.markdownTwinsEnabled) {
                        res.writeHead(200, {
                            'Content-Type': 'text/html; charset=utf-8',
                            ...robotsHeader
                        });
                        res.end('<!DOCTYPE html><html><body>SPA fallback</body></html>');
                        return;
                    }

                    res.writeHead(200, {
                        'Content-Type': 'text/markdown; charset=utf-8',
                        Vary          : 'Accept',
                        ...robotsHeader
                    });
                    res.end('# Ticket #20671\n\nGooglebot & Agent Discovery epic.\n');
                    return;
                }

                res.writeHead(200, {
                    'Content-Type': 'text/html; charset=utf-8',
                    ...robotsHeader
                });
                res.end('<!DOCTYPE html><html><head><title>Ticket #20671 | Neo.mjs</title></head><body><h1>Ticket #20671</h1></body></html>');
                return;
            }

            res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
            res.end('Not Found');
        });

        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        baseUrl       = `http://127.0.0.1:${address.port}`;
    });

    test.afterEach(async () => {
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }
    });

    test('passes when robots.txt, sitemaps, llms*.txt, Googlebot SSR, and Markdown twins all conform', async () => {
        const result = await verifyLiveSeoSurface({
            baseUrl,
            requireMarkdownTwins: true
        });

        expect(result.passed).toBe(true);
        expect(result.baseUrl).toBe(baseUrl);
        expect(result.checks).toHaveLength(12);
        expect(result.checks.every(check => check.passed)).toBe(true);

        state.canonicalOrigin = 'https://neomjs.com';
        const stagingResult = await verifyLiveSeoSurface({
            baseUrl,
            expectedCanonicalOrigin: 'https://neomjs.com',
            requireMarkdownTwins   : true
        });
        expect(stagingResult.passed).toBe(true);
        expect(stagingResult.expectedOrigin).toBe('https://neomjs.com');
    });

    test('fails closed on missing Content-Signal, sitemap/llms.txt leaks, missing JSON-LD/noindex, and missing Markdown twins', async () => {
        // (a) robots.txt missing Content-Signal or carrying unapproved ai-train=yes
        state = {...createDefaultState(), includeRobotsContentSignal: false};
        await expect(verifyLiveSeoSurface({baseUrl})).rejects.toThrow(/\[robots\.txt\][\s\S]*Content-Signal/);

        state = {
            ...createDefaultState(),
            robotsContentSignalLine: 'Content-Signal: search=yes, ai-input=yes, ai-train=yes'
        };
        await expect(verifyLiveSeoSurface({baseUrl})).rejects.toThrow(/\[robots\.txt\][\s\S]*Content-Signal: search=yes, ai-input=yes"/);

        // (b) sitemap.xml leaks sitemap-archive.xml or omits sitemap-discussions.xml; llms.txt leaks discussion archive URLs
        state = {...createDefaultState(), includeArchiveInIndex: true};
        await expect(verifyLiveSeoSurface({baseUrl})).rejects.toThrow(/\[sitemap\.xml\][\s\S]*sitemap-archive\.xml/);

        state = {...createDefaultState(), includeDiscussionsInIndex: false};
        await expect(verifyLiveSeoSurface({baseUrl})).rejects.toThrow(/\[sitemap\.xml\][\s\S]*sitemap-discussions\.xml/);

        state = {...createDefaultState(), llmsExtraLine: `- [Discussion #19733](${baseUrl}/news/discussions/19733)`};
        await expect(verifyLiveSeoSurface({baseUrl})).rejects.toThrow(/\[llms\.txt\][\s\S]*discussion archive URLs/);

        state = {...createDefaultState(), llmsExtraLine: `- [Discussion #19733](${baseUrl}/raw/news/discussions/19733.md)`};
        await expect(verifyLiveSeoSurface({baseUrl})).rejects.toThrow(/\[llms\.txt\][\s\S]*discussion archive URLs/);

        // (c) Googlebot deep route lacks neo-route JSON-LD or archive ticket lacks X-Robots-Tag: noindex
        state = {...createDefaultState(), includeNeoRouteJsonLd: false};
        await expect(verifyLiveSeoSurface({baseUrl})).rejects.toThrow(/\[googlebot-learn\][\s\S]*neo-route/);

        state = {...createDefaultState(), archiveNoindexHeader: false};
        await expect(verifyLiveSeoSurface({baseUrl})).rejects.toThrow(/\[googlebot-archive-ticket\][\s\S]*noindex/);

        // (d) Accept: text/markdown returns 302 / text/html when requireMarkdownTwins: true, while succeeding when false
        state = {...createDefaultState(), markdownTwinsEnabled: false};
        await expect(verifyLiveSeoSurface({baseUrl, requireMarkdownTwins: true}))
            .rejects.toThrow(/\[markdown-accept-learn\][\s\S]*(?:302|text\/markdown)/);

        const withoutTwins = await verifyLiveSeoSurface({
            baseUrl,
            requireMarkdownTwins: false
        });
        expect(withoutTwins.passed).toBe(true);
        expect(withoutTwins.checks).toHaveLength(9);
        expect(withoutTwins.checks.every(check => check.passed)).toBe(true);
    });

    test('executes standalone CLI flags (--base-url, --expected-origin, --skip-markdown-twins, --json) and exits 1 on failure', async () => {
        state = {
            ...createDefaultState(),
            canonicalOrigin     : 'https://neomjs.com',
            markdownTwinsEnabled: false
        };

        const {stdout} = await execFileAsync(process.execPath, [
            CLI_PATH,
            '--base-url', baseUrl,
            '--expected-origin', 'https://neomjs.com',
            '--skip-markdown-twins',
            '--json'
        ]);
        const report = JSON.parse(stdout);
        expect(report.passed).toBe(true);
        expect(report.expectedOrigin).toBe('https://neomjs.com');
        expect(report.checks).toHaveLength(9);

        await expect(execFileAsync(process.execPath, [
            CLI_PATH,
            '--base-url', baseUrl,
            '--expected-origin', 'https://neomjs.com',
            '--json'
        ])).rejects.toMatchObject({code: 1});
    });

    test('counts <h1> elements accurately while ignoring HTML comments, <script>, and <style> blocks', () => {
        const html = [
            '<!-- <h1>Commented out heading</h1> -->',
            '<script type="module">const tpl = "<h1>Fake heading</h1>";</script >',
            '<style>/* <h1>Fake style heading</h1> */</style>',
            '<main><h1 class="hero-title">Real Heading</h1><h2>Subheading</h2></main>'
        ].join('\n');

        expect(countHtmlH1Tags(html)).toBe(1);
        expect(countHtmlH1Tags('<h1>One</h1><h1>Two</h1>')).toBe(2);
        expect(countHtmlH1Tags('<div>No heading</div>')).toBe(0);
    });
});
