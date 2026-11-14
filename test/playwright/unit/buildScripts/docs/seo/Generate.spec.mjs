import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';
import fg             from 'fast-glob';

import {
    assertStableReleaseNoteGithubLinks,
    collectBlogRoutes,
    collectExampleFamilyRoutes,
    collectExampleRoutes,
    extractExampleFamilyDefinitions,
    extractMarkdownSeoMetadata,
    formatLearnSeoTitle,
    getContentRouteObjects,
    getContentRoutes,
    getDisallowedReleaseNoteGithubLinks,
    getExistingSitemapLastmodMap,
    getLatestSitemapLastmod,
    getLlmsFullTxt,
    getLlmsTxt,
    getPublishedExampleFamilies,
    getReleaseNotePriority,
    getSeoJson,
    getSitemapDiscussionsXml,
    getSitemapIndexXml,
    getSitemapXml,
    getSsgArchiveRoutes,
    hasReliableGitHistory
} from '../../../../../../buildScripts/docs/seo/generate.mjs';
import createReleaseIndex from '../../../../../../buildScripts/docs/index/release.mjs';
import verifySeoArtifacts from '../../../../../../buildScripts/docs/seo/verify.mjs';

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

    test('extracts familyDefinitions from TabContainer.mjs, refuses unreadable AST shapes, and emits only populated families', async () => {
        const examplesTabContainerPath = path.resolve(process.cwd(), 'apps/portal/view/examples/TabContainer.mjs');
        const tabContainerSource       = await fs.readFile(examplesTabContainerPath, 'utf-8');
        const definitions              = extractExampleFamilyDefinitions(tabContainerSource);

        expect(definitions.length).toBeGreaterThan(1);
        expect(definitions[0]).toEqual({
            family: null,
            route : '/examples',
            title : 'Featured'
        });

        const nonFeatured    = definitions.slice(1);
        const familyRouteIds = nonFeatured.map(item => item.route);

        expect(new Set(familyRouteIds).size).toBe(nonFeatured.length);

        for (const item of nonFeatured) {
            expect(typeof item.family).toBe('string');
            expect(item.family.length).toBeGreaterThan(0);
            expect(typeof item.title).toBe('string');
            expect(item.title.length).toBeGreaterThan(0);
            expect(item.route).toMatch(/^\/examples\/[a-z0-9-]+$/);
        }

        expect(() => extractExampleFamilyDefinitions('')).toThrow(/non-empty string/);
        expect(() => extractExampleFamilyDefinitions('class TabContainer {}')).toThrow(/no definitions found/);
        expect(() => extractExampleFamilyDefinitions('const config = {familyDefinitions: SOME_IDENTIFIER};')).toThrow(/ArrayExpression/);
        expect(() => extractExampleFamilyDefinitions('const config = {familyDefinitions: [{family: "grid-table", route: "/examples/grid"}]};')).toThrow(/Incomplete familyDefinitions entry/);

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

        await expect(getPublishedExampleFamilies({examplesPath, root: tempDir})).rejects.toThrow();

        const published = await getPublishedExampleFamilies({examplesPath, examplesTabContainerPath, root: tempDir});
        expect(published.map(item => item.route)).toEqual(['/examples/grid']);

        const familyRoutes = await collectExampleFamilyRoutes({examplesPath, examplesTabContainerPath, root: tempDir});
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
            examplesTabContainerPath,
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
            examplesTabContainerPath,
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

    test('decouples sitemap-discussions.xml from ticket/PR sitemap-archive.xml and emits ssg-archive-routes.json', async () => {
        const [archiveSitemap, discussionsSitemap, ssgArchiveRoutes] = await Promise.all([
            getSitemapXml({
                baseUrl       : 'https://neomjs.com/',
                corpusRoot,
                includeLastmod: false,
                onlyArchives  : true
            }),
            getSitemapDiscussionsXml({
                baseUrl       : 'https://neomjs.com/',
                corpusRoot,
                includeLastmod: false
            }),
            getSsgArchiveRoutes({corpusRoot})
        ]);

        expect(archiveSitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
        expect(archiveSitemap).toContain('<loc>https://neomjs.com/news/tickets/12742</loc>');
        expect(archiveSitemap).toContain('<loc>https://neomjs.com/news/pulls/20088</loc>');
        expect(archiveSitemap).not.toContain('/news/discussions/');
        expect(archiveSitemap).not.toContain('/news/releases/');
        expect(archiveSitemap).not.toContain('/news/blog/');
        expect(archiveSitemap).not.toContain('/learn/');
        expect(archiveSitemap).not.toContain('<loc>https://neomjs.com/</loc>');

        expect(discussionsSitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
        expect(discussionsSitemap).toContain('<loc>https://neomjs.com/news/discussions/11026</loc>');
        expect(discussionsSitemap).not.toContain('/news/tickets/');
        expect(discussionsSitemap).not.toContain('/news/pulls/');
        expect(discussionsSitemap).not.toContain('/learn/');

        expect(ssgArchiveRoutes).toEqual({
            routes: [
                '/news/pulls/20088',
                '/news/tickets/12742'
            ]
        });
    });

    test('deduplicates multi-bucket corpus routes into one entry per loc with newest lastmod regardless of bucket order', async () => {
        const dupCorpus    = path.join(tempDir, 'dup-corpus');
        const isolatedRoot = path.join(tempDir, 'dup-root');
        const releasesPath = path.join(isolatedRoot, 'apps/portal/resources/data/releases.json');
        const seoJsonPath  = path.join(isolatedRoot, 'apps/portal/resources/data/seo.json');

        await fs.outputFile(path.join(isolatedRoot, 'learn/guides/Setup.md'), '# Setup\n\nZero-build workspace setup guide for Neo.mjs.');
        await fs.outputJson(path.join(isolatedRoot, 'learn/tree.json'), {
            data: [{id: 'guides/Setup', isLeaf: true, name: 'Setup'}]
        });
        await fs.outputJson(path.join(isolatedRoot, 'apps/portal/resources/data/blog.json'), {data: []});
        await fs.outputJson(seoJsonPath, {
            '/about-us': {title: 'About Neo.mjs', description: 'About the Neo.mjs platform.'},
            '/docs'    : {title: 'Neo.mjs API Docs', description: 'API documentation.'},
            '/examples': {title: 'Neo.mjs Examples', description: 'Live examples.'},
            '/home'    : {title: 'Neo.mjs', description: 'Multi-threaded UI engine and Agent OS.'},
            '/news'    : {title: 'Neo.mjs News', description: 'Releases, blog, and updates.'},
            '/services': {title: 'Connect with Neo.mjs', description: 'Connect with the maintainers.'}
        });
        await fs.outputFile(
            path.join(releaseNotesRoot, 'v13.4.0.md'),
            '---\ntagName: 13.4.0\nname: Neo.mjs v13.4.0 Release Notes\npublishedAt: "2026-11-09T13:34:10Z"\n---\n# Neo.mjs v13.4.0 Release Notes\n'
        );
        await createReleaseIndex({outputFile: releasesPath, releaseNotesRoot});

        async function runCase({archiveDiscussionDate, activeDiscussionDate, v7IssueDate, v13IssueDate, activePullContent, archivePullContent}) {
            await fs.emptyDir(dupCorpus);
            await fs.outputFile(
                path.join(dupCorpus, 'archive/discussions/v13.3.0/chunk-1/discussion-19427.md'),
                `---\nnumber: 19427\ntitle: Repo ADRs\nupdatedAt: '${archiveDiscussionDate}'\n---\n# Repo ADRs\n`
            );
            await fs.outputFile(
                path.join(dupCorpus, 'discussions/chunk-1/discussion-19427.md'),
                `---\nnumber: 19427\ntitle: Repo ADRs\nupdatedAt: '${activeDiscussionDate}'\n---\n# Repo ADRs\n`
            );
            await fs.outputFile(
                path.join(dupCorpus, 'archive/issues/v7.9.1/chunk-1/issue-174.md'),
                `---\nid: 174\ntitle: DomEvent bubble\nlabels: [enhancement]\nupdatedAt: '${v7IssueDate}'\n---\n# Issue 174\n`
            );
            await fs.outputFile(
                path.join(dupCorpus, 'archive/issues/v13.2.0/chunk-1/issue-174.md'),
                `---\nid: 174\ntitle: DomEvent bubble\nlabels: [enhancement]\nupdatedAt: '${v13IssueDate}'\n---\n# Issue 174\n`
            );
            await fs.outputFile(path.join(dupCorpus, 'pulls/chunk-1/pr-20088.md'), activePullContent);
            await fs.outputFile(path.join(dupCorpus, 'archive/pulls/v13.4.0/chunk-1/pr-20088.md'), archivePullContent);

            const seoJson = await getSeoJson({releaseNotesRoot, releasesPath, root: isolatedRoot, seoJsonPath});

            const [coreXml, discussionsXml, archiveXml, ssgArchiveRoutes, llmsTxt, llmsFullTxt, llmsAllTxt, contentRoutes] = await Promise.all([
                getSitemapXml({baseUrl: 'https://neomjs.com', corpusRoot: dupCorpus, includeArchives: false, releaseNotesRoot, root: isolatedRoot, seoJson}),
                getSitemapDiscussionsXml({baseUrl: 'https://neomjs.com', corpusRoot: dupCorpus, releaseNotesRoot, root: isolatedRoot}),
                getSitemapXml({baseUrl: 'https://neomjs.com', corpusRoot: dupCorpus, includeArchives: true, onlyArchives: true, releaseNotesRoot, root: isolatedRoot}),
                getSsgArchiveRoutes({corpusRoot: dupCorpus}),
                getLlmsTxt({baseUrl: 'https://neomjs.com', corpusRoot: dupCorpus, includeArchives: false, releaseNotesRoot, releasesPath, root: isolatedRoot}),
                getLlmsFullTxt({baseUrl: 'https://neomjs.com', root: isolatedRoot}),
                getLlmsTxt({baseUrl: 'https://neomjs.com', corpusRoot: dupCorpus, includeArchives: true, releaseNotesRoot, releasesPath, root: isolatedRoot}),
                getContentRoutes({corpusRoot: dupCorpus, releaseNotesRoot, root: isolatedRoot})
            ]);
            const sitemapIndexXml = getSitemapIndexXml({
                baseUrl : 'https://neomjs.com',
                sitemaps: [
                    {path: 'sitemap-core.xml',        xml: coreXml},
                    {path: 'sitemap-discussions.xml', xml: discussionsXml}
                ]
            });

            await verifySeoArtifacts({
                baseUrl              : 'https://neomjs.com',
                corpusRoot           : dupCorpus,
                llmsAllTxt,
                llmsFullTxt,
                llmsTxt,
                releaseNotesRoot,
                root                 : isolatedRoot,
                seoJson,
                sitemapArchiveXml    : archiveXml,
                sitemapCoreXml       : coreXml,
                sitemapDiscussionsXml: discussionsXml,
                sitemapIndexXml,
                ssgArchiveRoutes
            });

            return {archiveXml, contentRoutes, discussionsXml, llmsAllTxt, ssgArchiveRoutes};
        }

        // Order A: [older, newer] on sorted paths + [missing lastmod, valid lastmod]
        const orderA = await runCase({
            archiveDiscussionDate: '2026-10-13T21:19:47Z',
            activeDiscussionDate : '2026-10-16T01:09:33Z',
            v13IssueDate         : '2020-05-10T12:00:00Z',
            v7IssueDate          : '2026-10-09T20:01:32Z',
            archivePullContent   : '# PR 20088 without frontmatter date\n',
            activePullContent    : '---\nnumber: 20088\ntitle: PR 20088\nupdatedAt: "2026-10-25T08:00:00Z"\n---\n# PR 20088\n'
        });

        // Order B: [newer, older] on sorted paths + [valid lastmod, missing lastmod]
        const orderB = await runCase({
            archiveDiscussionDate: '2026-10-16T01:09:33Z',
            activeDiscussionDate : '2026-10-13T21:19:47Z',
            v13IssueDate         : '2026-10-09T20:01:32Z',
            v7IssueDate          : '2020-05-10T12:00:00Z',
            archivePullContent   : '---\nnumber: 20088\ntitle: PR 20088\nupdatedAt: "2026-10-25T08:00:00Z"\n---\n# PR 20088\n',
            activePullContent    : '# PR 20088 without frontmatter date\n'
        });

        for (const {archiveXml, contentRoutes, discussionsXml, llmsAllTxt, ssgArchiveRoutes} of [orderA, orderB]) {
            const archiveLocs    = Array.from(archiveXml.matchAll(/<loc>(.*?)<\/loc>/g), match => match[1]);
            const discussionLocs = Array.from(discussionsXml.matchAll(/<loc>(.*?)<\/loc>/g), match => match[1]);
            expect(archiveLocs).toEqual([
                'https://neomjs.com/news/tickets/174',
                'https://neomjs.com/news/pulls/20088'
            ]);
            expect(discussionLocs).toEqual([
                'https://neomjs.com/news/discussions/19427'
            ]);
            expect(discussionsXml).toContain('<loc>https://neomjs.com/news/discussions/19427</loc>\n    <lastmod>2026-10-16T01:09:33Z</lastmod>');
            expect(archiveXml).toContain('<loc>https://neomjs.com/news/tickets/174</loc>\n    <lastmod>2026-10-09T20:01:32Z</lastmod>');
            expect(archiveXml).toContain('<loc>https://neomjs.com/news/pulls/20088</loc>\n    <lastmod>2026-10-25T08:00:00Z</lastmod>');
            expect(ssgArchiveRoutes).toEqual({
                routes: ['/news/pulls/20088', '/news/tickets/174']
            });
            expect(contentRoutes.filter(route => route === '/#/news/discussions/19427')).toHaveLength(1);
            expect(contentRoutes.filter(route => route === '/#/news/tickets/174')).toHaveLength(1);
            expect(llmsAllTxt.match(/raw\/news\/discussions\/19427\.md/g)).toHaveLength(1);
            expect(llmsAllTxt.match(/raw\/news\/tickets\/174\.md/g)).toHaveLength(1);
        }
    });

    test('getSitemapIndexXml emits a valid sitemapindex referencing sitemap-core.xml and sitemap-discussions.xml', () => {
        const coreXml = [
            '<urlset>',
            '  <url><loc>https://neomjs.com/</loc><lastmod>2026-10-20T10:00:00Z</lastmod></url>',
            '  <url><loc>https://neomjs.com/docs</loc><lastmod>2026-10-24T18:30:00Z</lastmod></url>',
            '</urlset>'
        ].join('\n');

        const discussionsXml = [
            '<urlset>',
            '  <url><loc>https://neomjs.com/news/discussions/19427</loc><lastmod>2026-10-25T01:00:00Z</lastmod></url>',
            '</urlset>'
        ].join('\n');

        expect(getLatestSitemapLastmod(coreXml)).toBe('2026-10-24T18:30:00Z');
        expect(getLatestSitemapLastmod(discussionsXml)).toBe('2026-10-25T01:00:00Z');
        expect(getLatestSitemapLastmod('<urlset><url><loc>https://neomjs.com/</loc></url></urlset>')).toBeNull();

        const defaultIndexXml = getSitemapIndexXml({baseUrl: 'https://neomjs.com'});
        expect(defaultIndexXml).toContain('<loc>https://neomjs.com/sitemap-core.xml</loc>');
        expect(defaultIndexXml).toContain('<loc>https://neomjs.com/sitemap-discussions.xml</loc>');
        expect(defaultIndexXml).not.toContain('sitemap-archive.xml');

        const indexXml = getSitemapIndexXml({
            baseUrl : 'https://neomjs.com',
            sitemaps: [
                {path: 'sitemap-core.xml',        xml: coreXml},
                {path: 'sitemap-discussions.xml', xml: discussionsXml}
            ]
        });

        expect(indexXml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
        expect(indexXml).toContain('<loc>https://neomjs.com/sitemap-core.xml</loc>\n    <lastmod>2026-10-24T18:30:00Z</lastmod>');
        expect(indexXml).toContain('<loc>https://neomjs.com/sitemap-discussions.xml</loc>\n    <lastmod>2026-10-25T01:00:00Z</lastmod>');
        expect(indexXml).not.toContain('sitemap-archive.xml');
    });

    test('getLlmsFullTxt, getSeoJson, and getSitemapXml skip redirect leaves and fail closed on missing learn/tree.json leaf files', async () => {
        const learnDir      = path.join(tempDir, 'learn');
        const treeFilePath  = path.join(learnDir, 'tree.json');
        const blogIndexPath = path.join(tempDir, 'blog.json');
        const seoJsonPath   = path.join(tempDir, 'seo.json');

        await fs.outputFile(path.join(learnDir, 'benefits/Introduction.md'), '# Introduction\n\nNeo is an agent institution.');
        await fs.outputFile(path.join(learnDir, 'guides/QuickStart.md'), '# Quick Start\n\nRun zero-build ES modules.');
        await fs.writeJSON(blogIndexPath, {data: []});
        await fs.writeJSON(seoJsonPath, {});
        await fs.writeJSON(treeFilePath, {
            data: [
                {id: 'benefits', isLeaf: false, name: 'Benefits'},
                {id: 'benefits/Introduction', isLeaf: true, name: 'Introduction'},
                {id: 'guides/QuickStart', isLeaf: true, name: 'Quick Start'},
                {id: 'ApiDocs', name: 'API Docs', route: '/docs'}
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
        expect(llmsFull).not.toContain('ApiDocs');

        const validSeoJson = await getSeoJson({
            blogIndexPath,
            examplesPath: path.join(tempDir, 'no-examples.json'),
            learnDir,
            releaseNotesRoot,
            releasesPath: path.join(tempDir, 'no-releases.json'),
            root        : tempDir,
            seoJsonPath,
            treeFilePath
        });
        expect(validSeoJson['/learn/ApiDocs']).toBeUndefined();
        expect(validSeoJson['/learn/benefits/Introduction']).toBeDefined();

        await fs.writeJSON(treeFilePath, {
            data: [
                {id: 'benefits/Introduction', isLeaf: true, name: 'Introduction'},
                {id: 'guides/Missing', isLeaf: true, name: 'Missing Guide'}
            ]
        });

        await expect(getLlmsFullTxt({baseUrl: 'https://neomjs.com', learnDir, treeFilePath}))
            .rejects.toThrow(/guides\/Missing/);
        await expect(getSeoJson({
            blogIndexPath,
            examplesPath: path.join(tempDir, 'no-examples.json'),
            learnDir,
            releaseNotesRoot,
            releasesPath: path.join(tempDir, 'no-releases.json'),
            root        : tempDir,
            seoJsonPath,
            treeFilePath
        })).rejects.toThrow(/guides\/Missing/);
        await expect(getContentRoutes({
            blogIndexPath,
            corpusRoot,
            examplesPath: path.join(tempDir, 'no-examples.json'),
            learnDir,
            releaseNotesRoot,
            root        : tempDir,
            treeFilePath
        })).rejects.toThrow(/guides\/Missing/);
        await expect(getSitemapXml({
            baseUrl       : 'https://neomjs.com/',
            blogIndexPath,
            corpusRoot,
            examplesPath  : path.join(tempDir, 'no-examples.json'),
            includeLastmod: false,
            learnDir,
            releaseNotesRoot,
            root          : tempDir,
            treeFilePath
        })).rejects.toThrow(/guides\/Missing/);
    });

    test('excludes both singular /childapp/ and plural /childapps/ popup helpers and honors isolated options.root + release titles', async () => {
        const isolatedRoot = path.join(tempDir, 'isolated-root');
        const releasesPath = path.join(isolatedRoot, 'apps/portal/resources/data/releases.json');

        await fs.outputFile(path.join(isolatedRoot, 'learn/guides/Setup.md'), '# Setup\n\nZero-build workspace setup.');
        await fs.outputJson(path.join(isolatedRoot, 'learn/tree.json'), {
            data: [
                {id: 'guides/Setup', isLeaf: true, name: 'Setup'},
                {id: 'ApiDocs', name: 'API Docs', route: '/docs'}
            ]
        });
        await fs.outputFile(path.join(isolatedRoot, 'learn/blog/hello.md'), '# Hello\n\nHermetic blog post.');
        await fs.outputJson(path.join(isolatedRoot, 'apps/portal/resources/data/blog.json'), {
            data: [
                {id: 'blog/hello', isLeaf: true, name: 'Hello Neo', path: 'learn/blog/hello.md'}
            ]
        });
        await fs.outputFile(
            path.join(isolatedRoot, 'apps/sharedcovid/index.html'),
            '<!DOCTYPE html><html><head><title>Shared Covid</title></head></html>'
        );
        await fs.outputFile(
            path.join(isolatedRoot, 'apps/sharedcovid/childapps/header/index.html'),
            '<!DOCTYPE html><html><head><title>Child Header</title></head></html>'
        );
        await fs.outputFile(
            path.join(isolatedRoot, 'examples/component/multiWindowHelix/index.html'),
            '<!DOCTYPE html><html><head><title>Multi Window Helix</title></head></html>'
        );
        await fs.outputFile(
            path.join(isolatedRoot, 'examples/component/multiWindowHelix/childapp/index.html'),
            '<!DOCTYPE html><html><head><title>Multi Window Helix Child</title></head></html>'
        );
        await fs.outputFile(
            path.join(isolatedRoot, 'examples/component/multiWindowCoronaGallery/index.html'),
            '<!DOCTYPE html><html><head><title>Multi Window Corona Gallery</title></head></html>'
        );
        await fs.outputFile(
            path.join(isolatedRoot, 'examples/component/multiWindowCoronaGallery/childapp/index.html'),
            '<!DOCTYPE html><html><head><title>Multi Window Corona Child</title></head></html>'
        );
        await fs.outputFile(
            path.join(releaseNotesRoot, 'v13.4.0.md'),
            '---\ntagName: 13.4.0\nname: Neo.mjs v13.4.0 Release Notes\npublishedAt: "2026-11-09T13:34:10Z"\n---\n# Neo.mjs v13.4.0 Release Notes\n'
        );

        await createReleaseIndex({outputFile: releasesPath, releaseNotesRoot});

        const [sitemap, llmsTxt] = await Promise.all([
            getSitemapXml({
                baseUrl       : 'https://neomjs.com/',
                corpusRoot,
                includeLastmod: false,
                releaseNotesRoot,
                root          : isolatedRoot
            }),
            getLlmsTxt({
                baseUrl: 'https://neomjs.com/',
                corpusRoot,
                releaseNotesRoot,
                releasesPath,
                root   : isolatedRoot
            })
        ]);

        expect(sitemap).toContain('<loc>https://neomjs.com/apps/sharedcovid/index.html</loc>');
        expect(sitemap).toContain('<loc>https://neomjs.com/examples/component/multiWindowHelix/index.html</loc>');
        expect(sitemap).toContain('<loc>https://neomjs.com/examples/component/multiWindowCoronaGallery/index.html</loc>');
        expect(sitemap).not.toContain('/childapp/');
        expect(sitemap).not.toContain('/childapps/');
        // Hermeticity check: real-repo guides absent from isolatedRoot must not leak through process.cwd()
        expect(sitemap).not.toContain('/learn/benefits/ArchitectureOverview');

        expect(llmsTxt).toContain('- [Multi Window Helix](https://neomjs.com/examples/component/multiWindowHelix/index.html)');
        expect(llmsTxt).not.toContain('/childapp/');
        expect(llmsTxt).not.toContain('/childapps/');
        expect(llmsTxt).toContain('- [Hello Neo](https://neomjs.com/raw/learn/blog/hello.md)');
        expect(llmsTxt).toContain('- [Setup](https://neomjs.com/raw/learn/guides/Setup.md)');
        expect(llmsTxt).toContain('- [v13.4.0 (2026-11-09): Neo.mjs v13.4.0 Release Notes](https://neomjs.com/raw/news/releases/13.4.0.md)');
        expect(llmsTxt).not.toContain(': Update](');
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

test.describe('docs SEO generator #20915: git lastmod fallback and sitemap-core pruning', () => {
    let corpusRoot, releaseNotesRoot, tempDir;

    test.beforeEach(async () => {
        tempDir          = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-seo-20915-'));
        corpusRoot       = path.join(tempDir, 'corpus');
        releaseNotesRoot = path.join(tempDir, 'notes');

        await fs.ensureDir(corpusRoot);
        await fs.ensureDir(releaseNotesRoot);
    });

    test.afterEach(async () => {
        await fs.remove(tempDir);
    });

    test('registers sitemap-discussions.xml in buildScripts/docs/seo/copy.mjs SEO_FILES', async () => {
        const copySource = await fs.readFile(path.resolve(process.cwd(), 'buildScripts/docs/seo/copy.mjs'), 'utf-8');

        expect(copySource).toContain("'sitemap-core.xml'");
        expect(copySource).toContain("'sitemap-discussions.xml'");
        expect(copySource).toContain("'sitemap-archive.xml'");
    });

    test('preserves pre-baked seo.json lastmod when getSeoJson runs first in a .git-less directory and emits <lastmod> in getSitemapXml', async () => {
        const noGitRoot   = path.join(tempDir, 'node_modules/neo.mjs');
        const seoJsonPath = path.join(noGitRoot, 'apps/portal/resources/data/seo.json');

        expect(hasReliableGitHistory(noGitRoot)).toBe(false);

        await fs.copy(
            path.resolve(process.cwd(), 'apps/portal/view/examples/TabContainer.mjs'),
            path.join(noGitRoot, 'apps/portal/view/examples/TabContainer.mjs')
        );
        await fs.outputFile(
            path.join(noGitRoot, 'learn/benefits/Introduction.md'),
            '# What Is Neo.mjs?\n\nPersistent AI maintainers and multi-threaded UI runtime.'
        );
        await fs.outputJson(path.join(noGitRoot, 'learn/tree.json'), {
            data: [{id: 'benefits/Introduction', isLeaf: true, name: 'Introduction'}]
        });
        await fs.outputFile(
            path.join(noGitRoot, 'learn/blog/json-ld-xss.md'),
            '# JSON.stringify is not safe inside a script tag\n\nOne closing script tag ends a JSON-LD block early.'
        );
        await fs.outputJson(path.join(noGitRoot, 'apps/portal/resources/data/blog.json'), {
            data: [{id: 'blog/json-ld-xss', isLeaf: true, name: 'JSON-LD XSS', path: 'learn/blog/json-ld-xss.md'}]
        });
        await fs.outputJson(path.join(noGitRoot, 'apps/portal/resources/data/examples.json'), [
            {id: 'grid-big-data', name: 'Big Data Grid', family: 'grid-table', feature: 'Buffered rendering'}
        ]);
        await fs.outputFile(
            path.join(releaseNotesRoot, 'v13.4.0.md'),
            '# Neo.mjs v13.4.0 Release Notes\n\nMinor release highlights.'
        );

        // Simulate packaged seo.json shipped inside node_modules/neo.mjs (including legacy /home fallback)
        await fs.outputJson(seoJsonPath, {
            '/about-us': {title: 'About Us - Neo.mjs', description: 'About the team.', lastmod: '2026-09-14'},
            '/docs'    : {title: 'Neo.mjs Docs', description: 'API documentation.', lastmod: '2026-10-02'},
            '/examples': {title: 'Neo.mjs Examples', description: 'Live examples.', lastmod: '2026-11-01'},
            '/home'    : {title: 'Neo.mjs', description: 'Multi-threaded UI platform.', lastmod: '2026-10-21'},
            '/learn'   : {title: 'Learn Neo.mjs', description: 'Learn Neo.mjs.', lastmod: '2026-11-05'},
            '/news'    : {title: 'Neo.mjs News', description: 'Latest updates.', lastmod: '2026-11-12'},
            '/services': {title: 'Connect with Neo.mjs', description: 'Connect with us.', lastmod: '2026-08-30'},
            '/examples/grid': {
                title      : 'Neo.mjs Grid & Table Examples',
                description: 'Grid examples.',
                lastmod    : '2026-11-03',
                schemaType : 'CollectionPage'
            },
            '/learn/benefits/Introduction': {
                title      : 'What Is Neo.mjs?',
                description: 'Persistent AI maintainers.',
                lastmod    : '2026-11-10',
                schemaType : 'TechArticle'
            },
            '/news/blog/json-ld-xss': {
                title      : 'JSON.stringify is not safe inside a script tag - Neo.mjs',
                description: 'One closing script tag ends a JSON-LD block early.',
                lastmod    : '2026-11-11',
                schemaType : 'BlogPosting'
            },
            '/news/releases/13.4.0': {
                title      : 'Neo.mjs v13.4.0 Release Notes',
                description: 'Minor release highlights.',
                lastmod    : '2026-11-09',
                schemaType : 'TechArticle'
            }
        });

        // Step 1 (neomjs/pages updateNeoVersion.mjs order): seoJson runs FIRST and overwrites seo.json on disk
        const regeneratedSeo = await getSeoJson({
            releaseNotesRoot,
            releasesPath: path.join(noGitRoot, 'apps/portal/resources/data/no-releases.json'),
            root        : noGitRoot,
            seoJsonPath
        });
        await fs.writeJSON(seoJsonPath, regeneratedSeo, {spaces: 4});

        expect(regeneratedSeo['/']?.lastmod).toBe('2026-10-21');
        expect(regeneratedSeo['/home']?.lastmod).toBe('2026-10-21');
        expect(regeneratedSeo['/about-us']?.lastmod).toBe('2026-09-14');
        expect(regeneratedSeo['/examples/grid']?.lastmod).toBe('2026-11-03');
        expect(regeneratedSeo['/learn/benefits/Introduction']?.lastmod).toBe('2026-11-10');
        expect(regeneratedSeo['/news/blog/json-ld-xss']?.lastmod).toBe('2026-11-11');
        expect(regeneratedSeo['/news/releases/13.4.0']?.lastmod).toBe('2026-11-09');

        // Step 2: generate runs SECOND against the .git-less root and reads the persisted seo.json from disk
        const coreXml = await getSitemapXml({
            baseUrl        : 'https://neomjs.com',
            corpusRoot,
            includeArchives: false,
            releaseNotesRoot,
            root           : noGitRoot,
            seoJsonPath
        });

        expect(coreXml).toContain('<loc>https://neomjs.com/</loc>\n    <lastmod>2026-10-21</lastmod>\n    <priority>1.0</priority>');
        expect(coreXml).toContain('<loc>https://neomjs.com/about-us</loc>\n    <lastmod>2026-09-14</lastmod>\n    <priority>0.7</priority>');
        expect(coreXml).toContain('<loc>https://neomjs.com/examples/grid</loc>\n    <lastmod>2026-11-03</lastmod>\n    <priority>0.9</priority>');
        expect(coreXml).toContain('<loc>https://neomjs.com/learn/benefits/Introduction</loc>\n    <lastmod>2026-11-10</lastmod>\n    <priority>1.0</priority>');
        expect(coreXml).toContain('<loc>https://neomjs.com/news/blog/json-ld-xss</loc>\n    <lastmod>2026-11-11</lastmod>\n    <priority>0.9</priority>');
        expect(coreXml).toContain('<loc>https://neomjs.com/news/releases/13.4.0</loc>\n    <lastmod>2026-11-09</lastmod>\n    <priority>0.9</priority>');
    });

    test('prunes /home, /apps/portal/index.html, hidden/redirect learn leaves, and < maxReleaseMajor - 1 releases while stamping robots noindex, follow', async () => {
        const isolatedRoot = path.join(tempDir, 'pruned-root');
        const seoJsonPath  = path.join(isolatedRoot, 'apps/portal/resources/data/seo.json');
        const releasesPath = path.join(isolatedRoot, 'apps/portal/resources/data/releases.json');

        await fs.outputFile(path.join(isolatedRoot, 'apps/portal/index.html'), '<!DOCTYPE html><html><head><title>Portal</title></head></html>');
        await fs.outputFile(path.join(isolatedRoot, 'examples/grid/bigData/index.html'), '<!DOCTYPE html><html><head><title>Big Data Grid</title></head></html>');

        await fs.outputFile(path.join(isolatedRoot, 'learn/benefits/Introduction.md'), '# What Is Neo.mjs?\n\nCanonical introduction.');
        await fs.outputFile(path.join(isolatedRoot, 'learn/guides/specificfeatures/MultiWindow.md'), '# Multi Window\n\nHidden internal draft.');
        await fs.outputFile(
            path.join(isolatedRoot, 'learn/agentos/decisions/0020-agent-harness-concept.md'),
            '---\ntype: redirect\n---\n# ADR 0020 Moved\n\nMoved to neo-agent-brain.\n'
        );
        await fs.outputJson(path.join(isolatedRoot, 'learn/tree.json'), {
            data: [
                {id: 'benefits/Introduction', isLeaf: true, name: 'Introduction'},
                {id: 'guides/specificfeatures/MultiWindow', hidden: true, isLeaf: true, name: 'MultiWindow'},
                {id: 'agentos/decisions/0020-agent-harness-concept', isLeaf: true, name: 'ADR 0020'}
            ]
        });
        await fs.outputJson(path.join(isolatedRoot, 'apps/portal/resources/data/blog.json'), {data: []});
        await fs.outputJson(seoJsonPath, {
            '/about-us': {title: 'About Neo.mjs', description: 'About Neo.mjs.', lastmod: '2026-10-01'},
            '/docs'    : {title: 'Neo.mjs Docs', description: 'Docs.', lastmod: '2026-10-01'},
            '/examples': {title: 'Neo.mjs Examples', description: 'Examples.', lastmod: '2026-10-01'},
            '/home'    : {title: 'Neo.mjs', description: 'Platform.', lastmod: '2026-10-21'},
            '/news'    : {title: 'Neo.mjs News', description: 'News.', lastmod: '2026-10-01'},
            '/services': {title: 'Connect with Neo.mjs', description: 'Connect.', lastmod: '2026-10-01'}
        });

        await fs.outputFile(path.join(releaseNotesRoot, 'v13.4.0.md'), '---\npublishedAt: "2026-11-09T13:34:10Z"\n---\n# Neo.mjs v13.4.0 Release Notes\n');
        await fs.outputFile(path.join(releaseNotesRoot, 'v12.1.0.md'), '---\npublishedAt: "2026-06-01T10:00:00Z"\n---\n# Neo.mjs v12.1.0 Release Notes\n');
        await fs.outputFile(path.join(releaseNotesRoot, 'v11.18.0.md'), '---\npublishedAt: "2025-12-15T10:00:00Z"\n---\n# Neo.mjs v11.18.0 Release Notes\n');
        await fs.outputFile(path.join(releaseNotesRoot, 'v8.0.0.md'), '---\npublishedAt: "2024-11-01T10:00:00Z"\n---\n# Neo.mjs v8.0.0 Release Notes\n');
        await createReleaseIndex({outputFile: releasesPath, releaseNotesRoot});

        const exampleRoutes = await collectExampleRoutes(isolatedRoot);
        expect(exampleRoutes.map(item => item.id)).toEqual(['/examples/grid/bigData/index.html']);

        const seoJson = await getSeoJson({releaseNotesRoot, releasesPath, root: isolatedRoot, seoJsonPath});
        const [coreXml, llmsTxt] = await Promise.all([
            getSitemapXml({baseUrl: 'https://neomjs.com', corpusRoot, includeArchives: false, releaseNotesRoot, root: isolatedRoot, seoJson}),
            getLlmsTxt({baseUrl: 'https://neomjs.com', corpusRoot, includeArchives: false, releaseNotesRoot, releasesPath, root: isolatedRoot})
        ]);

        expect(coreXml).toContain('<loc>https://neomjs.com/</loc>');
        expect(coreXml).not.toContain('<loc>https://neomjs.com/home</loc>');
        expect(coreXml).not.toContain('/apps/portal/index.html');
        expect(coreXml).toContain('<loc>https://neomjs.com/examples/grid/bigData/index.html</loc>');
        expect(coreXml).toContain('<loc>https://neomjs.com/learn/benefits/Introduction</loc>');
        expect(coreXml).not.toContain('/learn/guides/specificfeatures/MultiWindow');
        expect(coreXml).not.toContain('/learn/agentos/decisions/0020-agent-harness-concept');
        expect(coreXml).toContain('<loc>https://neomjs.com/news/releases/13.4.0</loc>');
        expect(coreXml).toContain('<loc>https://neomjs.com/news/releases/12.1.0</loc>');
        expect(coreXml).not.toContain('/news/releases/11.18.0');
        expect(coreXml).not.toContain('/news/releases/8.0.0');

        expect(llmsTxt).toContain('- [Home](https://neomjs.com/)');

        expect(seoJson['/learn/benefits/Introduction']?.robots).toBeUndefined();
        expect(seoJson['/learn/guides/specificfeatures/MultiWindow']?.robots).toBe('noindex, follow');
        expect(seoJson['/learn/agentos/decisions/0020-agent-harness-concept']?.robots).toBe('noindex, follow');
        expect(seoJson['/news/releases/13.4.0']?.robots).toBeUndefined();
        expect(seoJson['/news/releases/12.1.0']?.robots).toBeUndefined();
        expect(seoJson['/news/releases/11.18.0']?.robots).toBe('noindex, follow');
        expect(seoJson['/news/releases/8.0.0']?.robots).toBe('noindex, follow');

        // Verify live tracked apps/portal/resources/data/seo.json invariants
        const liveSeoJson = await fs.readJSON(path.resolve(process.cwd(), 'apps/portal/resources/data/seo.json'));
        expect(liveSeoJson['/']).toEqual(liveSeoJson['/home']);
        expect(liveSeoJson['/']?.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(liveSeoJson['/news/blog/json-ld-xss-json-stringify-in-a-script-tag']?.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        for (const adr of ['0020-agent-harness-concept', '0032-institution-cockpit-render-model', '0034-electron-shell-architecture', '0037-fleet-manager-outward-door-topology', '0038-fm-client-topology']) {
            expect(liveSeoJson[`/learn/agentos/decisions/${adr}`]?.robots).toBe('noindex, follow');
        }
    });
});
