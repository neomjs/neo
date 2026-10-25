import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';
import fg             from 'fast-glob';

import {
    assertStableReleaseNoteGithubLinks,
    collectBlogRoutes,
    getContentRoutes,
    getDisallowedReleaseNoteGithubLinks,
    getExistingSitemapLastmodMap,
    getLatestSitemapLastmod,
    getLlmsFullTxt,
    getLlmsTxt,
    getReleaseNotePriority,
    getSitemapIndexXml,
    getSitemapXml
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

        expect(indexXml).toContain('<sitemapindex xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">');
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
});
