import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';
import fg             from 'fast-glob';

import {
    assertStableReleaseNoteGithubLinks,
    collectBlogRoutes,
    extractMarkdownSeoMetadata,
    formatLearnSeoTitle,
    getContentRoutes,
    getContentRouteObjects,
    getDisallowedReleaseNoteGithubLinks,
    getExistingSitemapLastmodMap,
    getLatestSitemapLastmod,
    getLlmsFullTxt,
    getLlmsTxt,
    getPublishedExampleFamilies,
    getReleaseNotePriority,
    getSeoJson,
    getSitemapIndexXml,
    getSitemapXml,
    collectExampleFamilyRoutes,
    extractExampleFamilyDefinitions
} from '../../../../../../buildScripts/docs/seo/generate.mjs';

test.describe('docs SEO generator release-note link guard', () => {
    test('getDisallowedReleaseNoteGithubLinks returns only mutable or release-ref Neo source links', () => {
        const links = getDisallowedReleaseNoteGithubLinks([
            'https://github.com/neomjs/neo/blob/dev/learn/agentos/DreamPipeline.md',
            'https://github.com/neomjs/neo/tree/dev/.agents/skills',
            'https://github.com/neomjs/neo/blob/07b6933fd0f1afa022146c5dee3d3becac582ff7/src/component/MagicMoveText.mjs',
            'https://github.com/neomjs/neo/blob/main/learn/agentos/DreamPipeline.md',
            'https://github.com/neomjs/neo/tree/v13.0.0/.agents/skills',
            'https://github.com/neomjs/pages/blob/v13.0.0/buildScripts/enhanceSeo.mjs',
            'https://github.com/neomjs/neo/blob/v13.0.0/src/Neo.mjs)'
        ].join('\n'));

        expect(links).toEqual([
            'https://github.com/neomjs/neo/blob/main/learn/agentos/DreamPipeline.md',
            'https://github.com/neomjs/neo/tree/v13.0.0/.agents/skills',
            'https://github.com/neomjs/neo/blob/v13.0.0/src/Neo.mjs'
        ]);
    });

    test('assertStableReleaseNoteGithubLinks fails with the release-note path and disallowed Neo source link', () => {
        expect(() => assertStableReleaseNoteGithubLinks({
            filePath: path.join(process.cwd(), '.github/RELEASE_NOTES/v0.0.0.md'),
            content : 'See https://github.com/neomjs/neo/blob/main/buildScripts/enhanceSeo.mjs'
        })).toThrow(/\.github\/RELEASE_NOTES\/v0\.0\.0\.md[\s\S]*blob\/main\/buildScripts\/enhanceSeo\.mjs/);
    });

    test('active release notes use dev or immutable commit refs for Neo source links', async () => {
        const files = await fg('.github/RELEASE_NOTES/*.md', {cwd: process.cwd()});

        expect(files.length).toBeGreaterThan(0);

        const violations = [];

        for (const file of files) {
            const content = await fs.readFile(path.resolve(process.cwd(), file), 'utf-8');
            const links   = getDisallowedReleaseNoteGithubLinks(content);

            if (links.length > 0) {
                violations.push({file, links});
            }
        }

        expect(violations).toEqual([]);
    });
});

test.describe('docs SEO generator release-note recency priority (#12753)', () => {
    // Anchored on the newest release-note major = 13 (matches @tobiu's confirmed mapping).
    test('current + most-recent major stay at 0.9', () => {
        expect(getReleaseNotePriority('13.0.0', 13)).toBe(0.9);
        expect(getReleaseNotePriority('12.1.0', 13)).toBe(0.9);
    });

    test('older majors decay below the evergreen 0.7+ tier', () => {
        expect(getReleaseNotePriority('11.0.0', 13)).toBe(0.7);
        expect(getReleaseNotePriority('10.5.0', 13)).toBe(0.6);
        expect(getReleaseNotePriority('9.0.0',  13)).toBe(0.5);
        expect(getReleaseNotePriority('8.1.2',  13)).toBe(0.4);
        expect(getReleaseNotePriority('7.0.0',  13)).toBe(0.4); // delta 6 -> ancient floor
    });

    test('unparseable version or unknown anchor falls back to DEFAULT_PRIORITY (0.5)', () => {
        expect(getReleaseNotePriority('not-a-version', 13)).toBe(0.5);
        expect(getReleaseNotePriority('12.1.0', null)).toBe(0.5);
    });

    test('self-maintaining: re-anchoring on a newer major shifts the tiers down', () => {
        // Once v14 ships, v14/v13 stay 0.9 and v12 decays to 0.7 — no code change needed.
        expect(getReleaseNotePriority('14.0.0', 14)).toBe(0.9);
        expect(getReleaseNotePriority('13.0.0', 14)).toBe(0.9);
        expect(getReleaseNotePriority('12.0.0', 14)).toBe(0.7);
    });
});

test.describe('docs SEO generator existing-sitemap lastmod map (#19155)', () => {
    let dir;

    const url     = (loc, lastmod) => `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`,
          sitemap = entries => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset>\n${entries.join('\n')}\n</urlset>\n`,
          write   = async content => {
              const file = path.join(dir, 'sitemap.xml');
              await fs.writeFile(file, content);
              return file
          };

    test.beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-sitemap-lastmod-'))
    });

    test.afterEach(async () => {
        await fs.remove(dir)
    });

    test('an entry without lastmod neither takes the next entry\'s date nor swallows that entry', async () => {
        const map = await getExistingSitemapLastmodMap(await write(sitemap([
            url('https://neomjs.com/a'),
            url('https://neomjs.com/b', '2026-09-01')
        ])));

        expect(Object.fromEntries(map)).toEqual({'https://neomjs.com/b': '2026-09-01'})
    });

    test('dated entries map loc to lastmod, whichever tag comes first', async () => {
        const map = await getExistingSitemapLastmodMap(await write(sitemap([
            url('https://neomjs.com/a', '2026-08-01'),
            '<url><lastmod>2026-08-02</lastmod><loc>https://neomjs.com/b</loc></url>'
        ])));

        expect(Object.fromEntries(map)).toEqual({
            'https://neomjs.com/a': '2026-08-01',
            'https://neomjs.com/b': '2026-08-02'
        })
    });

    test('a sitemap without any lastmod maps nothing', async () => {
        const entries = Array.from({length: 2000}, (_, i) => url(`https://neomjs.com/news/tickets/${i}`));

        expect((await getExistingSitemapLastmodMap(await write(sitemap(entries)))).size).toBe(0)
    });

    test('a missing sitemap maps nothing', async () => {
        expect((await getExistingSitemapLastmodMap(path.join(dir, 'absent.xml'))).size).toBe(0)
    });
});

test.describe('docs SEO generator content roots (#19166)', () => {
    let corpusRoot, releaseNotesRoot, tempDir;

    test.beforeEach(async () => {
        tempDir          = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-seo-roots-'));
        corpusRoot       = path.join(tempDir, 'corpus');
        releaseNotesRoot = path.join(tempDir, 'notes');

        await fs.outputFile(path.join(corpusRoot, 'issues/chunk-1/issue-7.md'), '# Active');
        await fs.outputFile(path.join(corpusRoot, 'archive/issues/v1.0.0/chunk-1/issue-3.md'), '# Archived');
        await fs.outputFile(path.join(corpusRoot, 'pulls/chunk-1/pr-9.md'), '# Pull');
        await fs.outputFile(path.join(corpusRoot, 'discussions/chunk-1/discussion-5.md'), '# Discussion');
        await fs.outputFile(path.join(releaseNotesRoot, 'v1.2.3.md'), '# Release')
    });

    test.afterEach(async () => {
        await fs.remove(tempDir)
    });

    test('routes come from the declared corpus and release-notes roots', async () => {
        const routes = await getContentRoutes({corpusRoot, releaseNotesRoot});

        expect(routes).toEqual(expect.arrayContaining([
            '/#/news/discussions/5',
            '/#/news/pulls/9',
            '/#/news/releases/1.2.3',
            '/#/news/tickets/3',
            '/#/news/tickets/7'
        ]))
    });

    test('a missing root fails naming its flag', async () => {
        await expect(getContentRoutes({releaseNotesRoot})).rejects.toThrow('--corpus-root');
        await expect(getContentRoutes({corpusRoot})).rejects.toThrow('--release-notes')
    });

    test('every post in the portal blog index gets a route, a sitemap entry and an llms.txt line (#19501)', async () => {
        const index = await fs.readJSON(path.join(process.cwd(), 'apps/portal/resources/data/blog.json'));
        const posts = index.data.filter(node => node.isLeaf);
        const roots = {baseUrl: 'https://neomjs.com/', corpusRoot, includeLastmod: false, releaseNotesRoot};

        expect(posts.length).toBeGreaterThan(0);

        const [routes, sitemap, llmsTxt] = await Promise.all([getContentRoutes(roots), getSitemapXml(roots), getLlmsTxt(roots)]);

        for (const post of posts) {
            const slug = post.id.replace(/^blog\//, '');
            expect(routes).toContain(`/#/news/blog/${slug}`);
            expect(routes).not.toContain(`/#/news/blog/blog/${slug}`);
            expect(sitemap).toContain(`<loc>https://neomjs.com/news/blog/${slug}</loc>\n    <priority>0.9</priority>`);
            expect(llmsTxt).toContain(`- [${post.name}](https://neomjs.com/raw/${post.path})`)
        }
    })
});

test.describe('docs SEO generator blog routes (#19501)', () => {
    let tempDir;

    test.beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-seo-blog-'))
    });

    test.afterEach(async () => {
        await fs.remove(tempDir)
    });

    test('a post becomes a /news/blog/<slug> route dated by its markdown file', async () => {
        const postPath  = path.join(tempDir, 'a-post.md');
        const indexPath = path.join(tempDir, 'blog.json');

        await fs.outputFile(postPath, '# A post');
        await fs.writeJSON(indexPath, {data: [
            {id: '2026', isLeaf: false, path: null},
            {id: 'blog/a-post', isLeaf: true, name: 'A post.', path: postPath}
        ]});

        expect(await collectBlogRoutes(indexPath)).toEqual([
            {category: 'blog', filePath: postPath, id: '/news/blog/a-post', name: 'A post.'}
        ])
    });

    test('a post without its markdown file fails, naming the post', async () => {
        const indexPath = path.join(tempDir, 'blog.json');

        await fs.writeJSON(indexPath, {data: [
            {id: 'blog/missing-post', isLeaf: true, name: 'Missing.', path: path.join(tempDir, 'missing-post.md')}
        ]});

        await expect(collectBlogRoutes(indexPath)).rejects.toThrow('blog/missing-post')
    })
});

test.describe('docs SEO generator example family routes (#20727)', () => {
    let corpusRoot, releaseNotesRoot, tempDir;

    test.beforeEach(async () => {
        tempDir          = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-seo-example-families-'));
        corpusRoot       = path.join(tempDir, 'corpus');
        releaseNotesRoot = path.join(tempDir, 'notes');

        await fs.ensureDir(corpusRoot);
        await fs.outputFile(path.join(releaseNotesRoot, 'v13.4.0.md'), '# Release 13.4.0');
    });

    test.afterEach(async () => {
        await fs.remove(tempDir);
    });

    test('extracts familyDefinitions from TabContainer.mjs without duplicating the table and emits only populated families', async () => {
        const tabContainerSource = await fs.readFile(
            path.resolve(process.cwd(), 'apps/portal/view/examples/TabContainer.mjs'),
            'utf-8'
        );
        const definitions = extractExampleFamilyDefinitions(tabContainerSource);

        expect(definitions.map(item => ({family: item.family, route: item.route, title: item.title}))).toEqual([
            {family: null,           route: '/examples',              title: 'Featured'},
            {family: 'grid-table',   route: '/examples/grid',         title: 'Grid & Table'},
            {family: 'forms',        route: '/examples/forms',        title: 'Forms'},
            {family: 'multi-window', route: '/examples/multi-window', title: 'Multi-Window'},
            {family: 'calendar',     route: '/examples/calendar',     title: 'Calendar'},
            {family: 'components',   route: '/examples/components',   title: 'Components'},
            {family: 'state',        route: '/examples/state',        title: 'State & Data'}
        ]);

        const examplesPath = path.join(tempDir, 'examples.json');
        const seoJsonPath  = path.join(tempDir, 'seo.json');

        await fs.writeJSON(examplesPath, [
            {
                id     : 'grid-big-data',
                name   : 'Buffered Data Grid with 5M cells',
                family : 'grid-table',
                feature: 'Buffered rendering in both directions'
            },
            {
                id     : 'hidden-forms-demo',
                name   : 'Hidden Forms Demo',
                family : 'forms',
                hidden : true,
                feature: 'Must not publish an empty family tab'
            }
        ]);
        await fs.writeJSON(seoJsonPath, {
            '/examples/forms': {
                title      : 'Stale Forms Entry',
                description: 'Must be removed when forms has 0 visible records.',
                schemaType : 'CollectionPage'
            }
        });

        const published = await getPublishedExampleFamilies({examplesPath, root: tempDir});
        expect(published.map(item => item.route)).toEqual(['/examples/grid']);

        const familyRoutes = await collectExampleFamilyRoutes({examplesPath, root: tempDir});
        expect(familyRoutes).toEqual([
            {
                category: 'example-family',
                filePath: examplesPath,
                id      : '/examples/grid',
                name    : 'Grid & Table Examples'
            }
        ]);

        const seoJson = await getSeoJson({
            blogIndexPath   : path.join(tempDir, 'no-blog.json'),
            examplesPath,
            learnDir        : path.join(tempDir, 'no-learn'),
            releaseNotesRoot: path.join(tempDir, 'no-notes'),
            releasesPath    : path.join(tempDir, 'no-releases.json'),
            root            : tempDir,
            seoJsonPath,
            treeFilePath    : path.join(tempDir, 'no-tree.json')
        });

        expect(seoJson['/examples/grid']).toEqual({
            title      : 'Neo.mjs Grid & Table Examples',
            description: 'Explore 1 live Neo.mjs Grid & Table example: Buffered rendering in both directions.',
            schemaType : 'CollectionPage'
        });
        expect(seoJson['/examples/forms']).toBeUndefined();
        expect(seoJson['/examples/multi-window']).toBeUndefined();
        expect(seoJson['/examples/calendar']).toBeUndefined();
        expect(seoJson['/examples/components']).toBeUndefined();
        expect(seoJson['/examples/state']).toBeUndefined();

        const roots = {
            baseUrl       : 'https://neomjs.com/',
            corpusRoot,
            examplesPath,
            includeLastmod: false,
            releaseNotesRoot
        };

        const [routes, routeObjects, sitemap, llmsTxt] = await Promise.all([
            getContentRoutes(roots),
            getContentRouteObjects(roots),
            getSitemapXml(roots),
            getLlmsTxt(roots)
        ]);

        expect(routes).toContain('/#/examples/grid');
        expect(routes).not.toContain('/#/examples/forms');
        expect(routeObjects).toContainEqual({
            route          : '/examples/grid',
            clientSideRoute: '/#/examples/grid'
        });
        expect(routeObjects).not.toContainEqual({
            route          : '/examples/forms',
            clientSideRoute: '/#/examples/forms'
        });
        expect(sitemap).toContain('<loc>https://neomjs.com/examples/grid</loc>\n    <priority>0.9</priority>');
        expect(sitemap).not.toContain('<loc>https://neomjs.com/examples/forms</loc>');
        expect(llmsTxt).toContain('- [Grid & Table Examples](https://neomjs.com/examples/grid)');
        expect(llmsTxt).not.toContain('https://neomjs.com/examples/forms');
    });
});

test.describe('docs SEO generator archive exclusion (#20089)', () => {
    let corpusRoot, releaseNotesRoot, tempDir;

    test.beforeEach(async () => {
        tempDir          = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-seo-archive-'));
        corpusRoot       = path.join(tempDir, 'corpus');
        releaseNotesRoot = path.join(tempDir, 'notes');

        await fs.outputFile(path.join(corpusRoot, 'issues/chunk-1/issue-12742.md'), '# Ticket 12742');
        await fs.outputFile(path.join(corpusRoot, 'pulls/chunk-1/pr-20088.md'), '# PR 20088');
        await fs.outputFile(path.join(corpusRoot, 'discussions/chunk-1/discussion-11026.md'), '# Discussion 11026');
        await fs.outputFile(path.join(releaseNotesRoot, 'v13.0.0.md'), '# Release 13.0.0');
    });

    test.afterEach(async () => {
        await fs.remove(tempDir);
    });

    test('getSitemapXml and getLlmsTxt exclude raw ticket, PR, and discussion archive routes by default', async () => {
        const roots = {
            baseUrl       : 'https://neomjs.com/',
            corpusRoot,
            includeLastmod: false,
            releaseNotesRoot
        };

        const [routes, sitemap, llmsTxt] = await Promise.all([
            getContentRoutes(roots),
            getSitemapXml(roots),
            getLlmsTxt(roots)
        ]);

        // SPA route table retains all routes
        expect(routes).toContain('/#/news/tickets/12742');
        expect(routes).toContain('/#/news/pulls/20088');
        expect(routes).toContain('/#/news/discussions/11026');

        // Primary sitemap.xml includes canonical release/learn/blog routes and excludes archive churn
        expect(sitemap).toContain('<loc>https://neomjs.com/news/releases/13.0.0</loc>');
        expect(sitemap).not.toContain('/news/tickets/');
        expect(sitemap).not.toContain('/news/pulls/');
        expect(sitemap).not.toContain('/news/discussions/');

        // Primary llms.txt includes release notes, excludes archive churn, and links to llms-full.txt + llms-all.txt
        expect(llmsTxt).toContain('## Release Notes');
        expect(llmsTxt).toContain('- [Connect](https://neomjs.com/services)');
        expect(llmsTxt).not.toContain('[Services](https://neomjs.com/services)');
        expect(llmsTxt).not.toContain('https://neomjs.com/connect');
        expect(sitemap).toContain('<loc>https://neomjs.com/services</loc>');
        expect(sitemap).not.toContain('<loc>https://neomjs.com/connect</loc>');
        expect(llmsTxt).not.toContain('## GitHub Tickets');
        expect(llmsTxt).not.toContain('## GitHub Pull Requests');
        expect(llmsTxt).not.toContain('## GitHub Discussions');
        expect(llmsTxt).toContain('## Optional');
        expect(llmsTxt).toContain('https://neomjs.com/llms-full.txt');
        expect(llmsTxt).toContain('https://neomjs.com/llms-all.txt');
    });

    test('getSitemapXml and getLlmsTxt include archive routes when includeArchives is true', async () => {
        const roots = {
            baseUrl        : 'https://neomjs.com/',
            corpusRoot,
            includeArchives: true,
            includeLastmod : false,
            releaseNotesRoot
        };

        const [sitemap, llmsTxt] = await Promise.all([
            getSitemapXml(roots),
            getLlmsTxt(roots)
        ]);

        expect(sitemap).toContain('<loc>https://neomjs.com/news/tickets/12742</loc>');
        expect(sitemap).toContain('<loc>https://neomjs.com/news/pulls/20088</loc>');
        expect(sitemap).toContain('<loc>https://neomjs.com/news/discussions/11026</loc>');

        expect(llmsTxt).toContain('- [Ticket #12742](https://neomjs.com/raw/news/tickets/12742.md)');
        expect(llmsTxt).toContain('- [Pull Request #20088](https://neomjs.com/raw/news/pulls/20088.md)');
        expect(llmsTxt).toContain('- [Discussion #11026](https://neomjs.com/raw/news/discussions/11026.md)');
        expect(llmsTxt).not.toContain('## Optional');
    });

    test('getSitemapXml with onlyArchives emits exclusively archive routes for sitemap-archive.xml', async () => {
        const archiveSitemap = await getSitemapXml({
            baseUrl       : 'https://neomjs.com/',
            corpusRoot,
            includeLastmod: false,
            onlyArchives  : true
        });

        expect(archiveSitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
        expect(archiveSitemap).toContain('<loc>https://neomjs.com/news/tickets/12742</loc>');
        expect(archiveSitemap).toContain('<loc>https://neomjs.com/news/pulls/20088</loc>');
        expect(archiveSitemap).toContain('<loc>https://neomjs.com/news/discussions/11026</loc>');
        expect(archiveSitemap).not.toContain('/news/releases/');
        expect(archiveSitemap).not.toContain('/news/blog/');
        expect(archiveSitemap).not.toContain('/learn/');
        expect(archiveSitemap).not.toContain('https://neomjs.com/home');
    });

    test('getSitemapIndexXml emits a valid sitemapindex with newest child lastmod dates', () => {
        const coreXml = [
            '<urlset>',
            '  <url><loc>https://neomjs.com/home</loc><lastmod>2026-10-20T10:00:00Z</lastmod></url>',
            '  <url><loc>https://neomjs.com/docs</loc><lastmod>2026-10-24T18:30:00Z</lastmod></url>',
            '</urlset>'
        ].join('\n');

        const archiveXml = [
            '<urlset>',
            '  <url><loc>https://neomjs.com/news/tickets/20089</loc><lastmod>2026-10-25T01:00:00Z</lastmod></url>',
            '</urlset>'
        ].join('\n');

        expect(getLatestSitemapLastmod(coreXml)).toBe('2026-10-24T18:30:00Z');
        expect(getLatestSitemapLastmod(archiveXml)).toBe('2026-10-25T01:00:00Z');
        expect(getLatestSitemapLastmod('<urlset><url><loc>https://neomjs.com/home</loc></url></urlset>')).toBeNull();

        const indexXml = getSitemapIndexXml({
            baseUrl : 'https://neomjs.com',
            sitemaps: [
                {path: 'sitemap-core.xml',    xml: coreXml},
                {path: 'sitemap-archive.xml', xml: archiveXml}
            ]
        });

        expect(indexXml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
        expect(indexXml).toContain('<loc>https://neomjs.com/sitemap-core.xml</loc>\n    <lastmod>2026-10-24T18:30:00Z</lastmod>');
        expect(indexXml).toContain('<loc>https://neomjs.com/sitemap-archive.xml</loc>\n    <lastmod>2026-10-25T01:00:00Z</lastmod>');
    });

    test('getLlmsFullTxt concatenates markdown prose for learn/tree.json leaf guides', async () => {
        const learnDir     = path.join(tempDir, 'learn');
        const treeFilePath = path.join(learnDir, 'tree.json');

        await fs.outputFile(path.join(learnDir, 'benefits/Introduction.md'), '# Introduction\n\nNeo is an agent institution.');
        await fs.outputFile(path.join(learnDir, 'guides/QuickStart.md'), '# Quick Start\n\nRun zero-build ES modules.');
        await fs.writeJSON(treeFilePath, {
            data: [
                {id: 'benefits', isLeaf: false, name: 'Benefits'},
                {id: 'benefits/Introduction', isLeaf: true, name: 'Introduction'},
                {id: 'guides/QuickStart', isLeaf: true, name: 'Quick Start'},
                {id: 'guides/Missing', isLeaf: true, name: 'Missing Guide'}
            ]
        });

        const llmsFull = await getLlmsFullTxt({
            baseUrl: 'https://neomjs.com',
            learnDir,
            treeFilePath
        });

        expect(llmsFull).toContain('# Neo.mjs: Full Documentation Atlas (llms-full.txt)');
        expect(llmsFull).toContain('# [Introduction](https://neomjs.com/raw/learn/benefits/Introduction.md)');
        expect(llmsFull).toContain('Source: https://neomjs.com/learn/benefits/Introduction');
        expect(llmsFull).toContain('Neo is an agent institution.');
        expect(llmsFull).toContain('# [Quick Start](https://neomjs.com/raw/learn/guides/QuickStart.md)');
        expect(llmsFull).toContain('Run zero-build ES modules.');
        expect(llmsFull).not.toContain('Missing Guide');
    });

    test('getSeoJson populates route-specific metadata for learn, blog, and release leaves while preserving top-level routes (#20688)', async () => {
        const learnDir      = path.join(tempDir, 'learn');
        const treeFilePath  = path.join(learnDir, 'tree.json');
        const blogIndexPath = path.join(tempDir, 'blog.json');
        const releasesPath  = path.join(tempDir, 'releases.json');
        const seoJsonPath   = path.join(tempDir, 'seo.json');
        const blogPostPath  = path.join(tempDir, 'post.md');

        await fs.writeJSON(seoJsonPath, {
            '/about-us': {
                title      : 'About Us (Edited) - Neo.mjs',
                description: 'Direct edit in seo.json survives regeneration.'
            },
            '/learn': {
                title      : 'Learn Neo.mjs',
                description: 'Learn the fundamentals of the Neo.mjs platform.'
            },
            '/news/blog': {
                title      : 'Neo.mjs Blog',
                description: 'The official blog for the Neo.mjs platform.'
            },
            '/services': {
                title      : 'Connect with Neo.mjs',
                description: 'Build an app with Neo.mjs, explore persistent project memory for coding agents, join the public development work, or reach the maintainers directly.'
            },
            '/learn/old/RemovedGuide': {
                title      : 'Removed Guide - Neo.mjs',
                description: 'Stale leaf that must not survive regeneration.',
                schemaType : 'TechArticle'
            }
        });

        await fs.outputFile(
            path.join(learnDir, 'benefits/Introduction.md'),
            '# What Is Neo.mjs?\n\n**On a normal night here, with no human awake, AIs from rival labs open pull requests across Neo repositories.**'
        );
        await fs.writeJSON(treeFilePath, {
            data: [
                {id: 'benefits/Introduction', isLeaf: true, name: 'Introduction'}
            ]
        });

        await fs.outputFile(
            blogPostPath,
            '# Move web app panels between windows\n\n**Move a grid into another browser window and dock it back with its filters, selection, and scroll position intact.**'
        );
        await fs.writeJSON(blogIndexPath, {
            data: [
                {id: 'blog/a-workspace', isLeaf: true, name: 'Move web app panels', path: blogPostPath}
            ]
        });

        await fs.writeJSON(releasesPath, [
            {id: '13.3.1', isLeaf: true}
        ]);

        const seoJson = await getSeoJson({
            blogIndexPath,
            learnDir,
            releaseNotesRoot,
            releasesPath,
            root: tempDir,
            seoJsonPath,
            treeFilePath
        });

        expect(seoJson['/services']).toEqual({
            title      : 'Connect with Neo.mjs',
            description: 'Build an app with Neo.mjs, explore persistent project memory for coding agents, join the public development work, or reach the maintainers directly.'
        });
        expect(seoJson['/about-us']).toEqual({
            title      : 'About Us (Edited) - Neo.mjs',
            description: 'Direct edit in seo.json survives regeneration.'
        });
        expect(seoJson['/learn/old/RemovedGuide']).toBeUndefined();
        expect(seoJson['/learn/benefits/Introduction']).toEqual({
            title      : 'What Is Neo.mjs?',
            description: 'On a normal night here, with no human awake, AIs from rival labs open pull requests across Neo repositories.',
            schemaType : 'TechArticle'
        });
        expect(seoJson['/news/blog/a-workspace']).toEqual({
            title      : 'Move web app panels between windows - Neo.mjs',
            description: 'Move a grid into another browser window and dock it back with its filters, selection, and scroll position intact.',
            schemaType : 'BlogPosting'
        });
        expect(seoJson['/news/releases/13.3.1']).toEqual({
            title      : 'Neo.mjs v13.3.1 Release Notes',
            description: 'Release notes and changelog for Neo.mjs v13.3.1.',
            schemaType : 'TechArticle'
        });
        expect(seoJson['/news/releases/13.0.0']).toEqual({
            title      : 'Release 13.0.0 - Neo.mjs',
            description: 'Release notes and changelog for Neo.mjs v13.0.0.',
            schemaType : 'TechArticle'
        });

        expect(extractMarkdownSeoMetadata('# Custom Guide\n\n> Short quote\n\nThis paragraph explains how multi-threaded UI rendering keeps the main thread responsive under load.')).toEqual({
            title      : 'Custom Guide - Neo.mjs',
            description: 'This paragraph explains how multi-threaded UI rendering keeps the main thread responsive under load.'
        });
    });

    test('formatLearnSeoTitle and getSeoJson apply /learn/* search-intent title qualifiers (#20715)', async () => {
        expect(formatLearnSeoTitle('Overview', '/learn/comparisons/Overview')).toBe(
            'JavaScript Framework Comparisons (React, Angular, Vue, Solid vs Neo.mjs) | Neo.mjs'
        );
        expect(formatLearnSeoTitle('Neo.mjs vs React.js', '/learn/comparisons/NeoVsReact')).toBe(
            'Neo.mjs vs React.js — Multi-Threaded JavaScript UI Comparison | Neo.mjs'
        );
        expect(formatLearnSeoTitle('Extreme Speed', '/learn/benefits/body/Speed')).toBe(
            'Extreme Speed — Multi-Threaded JavaScript Application Engine | Neo.mjs'
        );
        expect(formatLearnSeoTitle('The Application Engine for the AI Era', '/learn/benefits/body/ApplicationEngine')).toBe(
            'The Application Engine for the AI Era - Neo.mjs'
        );
        expect(formatLearnSeoTitle('Core Agent Skills', '/learn/agentos/CoreSkills')).toBe(
            'Core Agent Skills — AI Agent OS & Multi-Threaded Application Engine | Neo.mjs'
        );
        expect(formatLearnSeoTitle('Collections', '/learn/guides/datahandling/Collections')).toBe(
            'Collections — Neo.mjs Developer Guide'
        );
        expect(formatLearnSeoTitle('Earthquakes', '/learn/tutorials/Earthquakes')).toBe(
            'Earthquakes — Neo.mjs Tutorial | Neo.mjs'
        );
        expect(formatLearnSeoTitle('Setup', '/learn/gettingstarted/Setup')).toBe(
            'Setup — Multi-Threaded JavaScript Application Engine | Neo.mjs'
        );
        expect(formatLearnSeoTitle('What Is Neo.mjs?', '/learn/benefits/Introduction')).toBe(
            'What Is Neo.mjs?'
        );
        expect(formatLearnSeoTitle('Neural Link: The Possession Interface', '/learn/agentos/NeuralLink')).toBe(
            'Neural Link: The Possession Interface - Neo.mjs'
        );

        const learnDir     = path.join(tempDir, 'learn-qualifiers');
        const treeFilePath = path.join(learnDir, 'tree.json');
        const seoJsonPath  = path.join(tempDir, 'seo-qualifiers.json');

        await fs.writeJSON(seoJsonPath, {});
        await fs.outputFile(path.join(learnDir, 'comparisons/Overview.md'), '# Overview\n\nFramework comparison matrix across modern JavaScript engines.');
        await fs.outputFile(path.join(learnDir, 'comparisons/NeoVsReact.md'), '# Neo.mjs vs React.js\n\nComparing multi-threaded UI execution with React virtual DOM.');
        await fs.outputFile(path.join(learnDir, 'benefits/body/Speed.md'), '# Extreme Speed\n\nOff-main-thread application worker execution keeps frames smooth.');
        await fs.outputFile(path.join(learnDir, 'benefits/body/ApplicationEngine.md'), '# The Application Engine for the AI Era\n\nHeading already carries the category noun.');
        await fs.outputFile(path.join(learnDir, 'agentos/CoreSkills.md'), '# Core Agent Skills\n\nProgressive disclosure skills for autonomous coding agents.');
        await fs.outputFile(path.join(learnDir, 'guides/datahandling/Collections.md'), '# Collections\n\nIndexed, filterable, and sortable data collections.');
        await fs.outputFile(path.join(learnDir, 'tutorials/Earthquakes.md'), '# Earthquakes\n\nStep-by-step multi-window geospatial application tutorial.');
        await fs.outputFile(path.join(learnDir, 'gettingstarted/Setup.md'), '# Setup\n\nInstall and run a Neo.mjs workspace in under a minute.');
        await fs.writeJSON(treeFilePath, {
            data: [
                {id: 'comparisons/Overview', isLeaf: true, name: 'Overview'},
                {id: 'comparisons/NeoVsReact', isLeaf: true, name: 'Neo.mjs vs React.js'},
                {id: 'benefits/body/Speed', isLeaf: true, name: 'Extreme Speed'},
                {id: 'benefits/body/ApplicationEngine', isLeaf: true, name: 'Application Engine'},
                {id: 'agentos/CoreSkills', isLeaf: true, name: 'Core Agent Skills'},
                {id: 'guides/datahandling/Collections', isLeaf: true, name: 'Collections'},
                {id: 'tutorials/Earthquakes', isLeaf: true, name: 'Earthquakes'},
                {id: 'gettingstarted/Setup', isLeaf: true, name: 'Setup'}
            ]
        });

        const fixtureSeo = await getSeoJson({
            blogIndexPath   : path.join(tempDir, 'no-blog.json'),
            learnDir,
            releaseNotesRoot: path.join(tempDir, 'no-notes'),
            releasesPath    : path.join(tempDir, 'no-releases.json'),
            root            : tempDir,
            seoJsonPath,
            treeFilePath
        });

        expect(fixtureSeo['/learn/comparisons/Overview']?.title).toBe(
            'JavaScript Framework Comparisons (React, Angular, Vue, Solid vs Neo.mjs) | Neo.mjs'
        );
        expect(fixtureSeo['/learn/comparisons/NeoVsReact']?.title).toBe(
            'Neo.mjs vs React.js — Multi-Threaded JavaScript UI Comparison | Neo.mjs'
        );
        expect(fixtureSeo['/learn/benefits/body/Speed']?.title).toBe(
            'Extreme Speed — Multi-Threaded JavaScript Application Engine | Neo.mjs'
        );
        expect(fixtureSeo['/learn/benefits/body/ApplicationEngine']?.title).toBe(
            'The Application Engine for the AI Era - Neo.mjs'
        );
        expect(fixtureSeo['/learn/agentos/CoreSkills']?.title).toBe(
            'Core Agent Skills — AI Agent OS & Multi-Threaded Application Engine | Neo.mjs'
        );
        expect(fixtureSeo['/learn/guides/datahandling/Collections']?.title).toBe(
            'Collections — Neo.mjs Developer Guide'
        );
        expect(fixtureSeo['/learn/tutorials/Earthquakes']?.title).toBe(
            'Earthquakes — Neo.mjs Tutorial | Neo.mjs'
        );
        expect(fixtureSeo['/learn/gettingstarted/Setup']?.title).toBe(
            'Setup — Multi-Threaded JavaScript Application Engine | Neo.mjs'
        );
    });
});
