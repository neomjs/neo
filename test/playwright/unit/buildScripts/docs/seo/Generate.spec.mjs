import {test, expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';
import fg             from 'fast-glob';

import {
    TOP_LEVEL_SOURCE_PATHS,
    assertStableReleaseNoteGithubLinks,
    collectBlogRoutes,
    collectExampleFamilyRoutes,
    collectExampleRoutes,
    extractExampleFamilyDefinitions,
    extractFrontmatterField,
    extractMarkdownSeoMetadata,
    extractPortalIndexMetadata,
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

import {EXAMPLE_FAMILY_SEO, getExampleFamilySeo} from '../../../../../../buildScripts/docs/seo/seoJson.mjs';
import {EXAMPLES_DIR}                            from '../../../../../../buildScripts/util/exampleCatalog.mjs';

/**
 * @summary Writes fixture records as a catalog folder, all of them in one group file in the order given.
 * @param {String} dir
 * @param {Object[]} records
 * @returns {Promise<String>} The folder
 */
async function outputCatalog(dir, records) {
    await fs.outputJson(path.join(dir, 'index.json'), ['fixture']);
    await fs.outputJson(path.join(dir, 'fixture.json'), records);
    return dir
}

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

    test('every defined family names its search intent within the title limit', async () => {
        const source      = await fs.readFile(path.resolve(process.cwd(), 'apps/portal/view/examples/MainContainer.mjs'), 'utf-8'),
              definitions = extractExampleFamilyDefinitions(source).filter(item => item.family);

        expect(definitions.map(item => item.family).sort()).toEqual(Object.keys(EXAMPLE_FAMILY_SEO).sort());

        for (const {subject, title} of Object.values(EXAMPLE_FAMILY_SEO)) {
            expect(title.length, title).toBeLessThanOrEqual(68);
            expect(title, title).not.toMatch(/framework/i);
            expect(title, title).toMatch(/JavaScript/);
            expect(subject, title).toMatch(/JavaScript/)
        }

        expect(getExampleFamilySeo({family: 'new-group', title: 'New Group'})).toEqual({
            subject: 'JavaScript New Group',
            title  : 'JavaScript New Group Examples | Neo.mjs'
        })
    });

    test('a group publishes through alsoIn, and a record counts only where production can open it', async () => {
        const examplesMainContainerPath = path.resolve(process.cwd(), 'apps/portal/view/examples/MainContainer.mjs'),
              examplesDir               = path.join(tempDir, 'examples'),
              urls                      = {dist_prod: 'dist/production/examples/dialog/index.html'};

        await outputCatalog(examplesDir, [
            {id: 'dialog-drag-drop', family: 'dialogs', alsoIn: ['drag-drop'], image: 'devmode/dialog.png', urls, feature: 'Draggable dialogs'},
            {id: 'tree-hidden-in-prod', family: 'tree', image: 'devmode/tree.png', hiddenIn: ['dist_prod'], urls, feature: 'Hidden in production'},
            {id: 'tree-dev-only', family: 'tree', image: 'devmode/tree.png', urls: {devmode: 'examples/tree/index.html'}, feature: 'No production build'}
        ]);

        const published = await getPublishedExampleFamilies({examplesDir, examplesMainContainerPath, root: tempDir});

        // Definition order, with the alsoIn member counted in both groups; neither tree record is one production opens
        expect(published.map(item => item.route)).toEqual(['/examples/dialogs', '/examples/drag-drop']);
        expect(published.map(item => item.records.map(record => record.id))).toEqual([['dialog-drag-drop'], ['dialog-drag-drop']])
    });

    test('extracts familyDefinitions from MainContainer.mjs, refuses unreadable AST shapes, and emits only covered families', async () => {
        const examplesMainContainerPath = path.resolve(process.cwd(), 'apps/portal/view/examples/MainContainer.mjs');
        const mainContainerSource       = await fs.readFile(examplesMainContainerPath, 'utf-8');
        const definitions               = extractExampleFamilyDefinitions(mainContainerSource);

        expect(definitions.length).toBeGreaterThan(1);
        expect(definitions[0]).toEqual({
            family: 'apps',
            route : '/examples/apps',
            title : 'Apps'
        });

        const familyRouteIds = definitions.map(item => item.route);

        expect(new Set(familyRouteIds).size).toBe(definitions.length);

        for (const item of definitions) {
            expect(typeof item.family).toBe('string');
            expect(item.family.length).toBeGreaterThan(0);
            expect(typeof item.title).toBe('string');
            expect(item.title.length).toBeGreaterThan(0);
            expect(item.route).toMatch(/^\/examples\/[a-z0-9-]+$/);
        }

        expect(() => extractExampleFamilyDefinitions('')).toThrow(/non-empty string/);
        expect(() => extractExampleFamilyDefinitions('class MainContainer {}')).toThrow(/no definitions found/);
        expect(() => extractExampleFamilyDefinitions('const config = {familyDefinitions: SOME_IDENTIFIER};')).toThrow(/ArrayExpression/);
        expect(() => extractExampleFamilyDefinitions('const config = {familyDefinitions: [{family: "grid-table", route: "/examples/grid"}]};')).toThrow(/Incomplete familyDefinitions entry/);

        const examplesDir  = path.join(tempDir, 'examples');
        const seoJsonPath  = path.join(tempDir, 'seo.json');

        await outputCatalog(examplesDir, [
            {
                id     : 'grid-big-data',
                name   : 'Buffered Data Grid with 5M cells',
                family : 'grid-table',
                image  : 'devmode/grid-big-data.png',
                urls   : {dist_prod: 'dist/production/examples/grid/bigData/index.html'},
                feature: 'Buffered rendering in both directions.'
            },
            {
                id     : 'grid-uncovered',
                name   : 'Uncovered Grid',
                family : 'grid-table',
                image  : null,
                feature: 'Must not count: a record without a cover gets no card'
            },
            {
                id     : 'gantt-basic',
                name   : 'Community Garden Plan',
                family : 'gantt',
                image  : null,
                feature: 'Must not publish a family whose records have no cover'
            },
            {
                id     : 'hidden-forms-demo',
                name   : 'Hidden Forms Demo',
                family : 'forms',
                hidden : true,
                image  : 'devmode/forms.png',
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

        await expect(getPublishedExampleFamilies({examplesDir, root: tempDir})).rejects.toThrow();

        const published = await getPublishedExampleFamilies({examplesDir, examplesMainContainerPath, root: tempDir});
        expect(published.map(item => item.route)).toEqual(['/examples/grid']);

        const familyRoutes = await collectExampleFamilyRoutes({examplesDir, examplesMainContainerPath, root: tempDir});
        expect(familyRoutes).toEqual([
            {
                category: 'example-family',
                filePath: examplesDir,
                id      : '/examples/grid',
                name    : 'Grid & Table Examples'
            }
        ]);

        const seoJson = await getSeoJson({
            blogIndexPath   : path.join(tempDir, 'no-blog.json'),
            examplesDir,
            examplesMainContainerPath,
            learnDir        : path.join(tempDir, 'no-learn'),
            releaseNotesRoot: path.join(tempDir, 'no-notes'),
            releasesPath    : path.join(tempDir, 'no-releases.json'),
            root            : tempDir,
            seoJsonPath,
            treeFilePath    : path.join(tempDir, 'no-tree.json')
        });

        expect(seoJson['/examples/grid']).toEqual({
            title      : 'JavaScript Data Grid Examples — 100k Rows in a Web Worker | Neo.mjs',
            description: 'Explore 1 live JavaScript data grid example: Buffered rendering in both directions.',
            schemaType : 'CollectionPage'
        });
        expect(seoJson['/examples/gantt']).toBeUndefined();
        expect(seoJson['/examples/forms']).toBeUndefined();
        expect(seoJson['/examples/multi-window']).toBeUndefined();
        expect(seoJson['/examples/calendar']).toBeUndefined();
        expect(seoJson['/examples/components']).toBeUndefined();
        expect(seoJson['/examples/state']).toBeUndefined();

        const roots = {
            baseUrl       : 'https://neomjs.com/',
            corpusRoot,
            examplesDir,
            examplesMainContainerPath,
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
            '/about-us'        : {title: 'About Neo.mjs', description: 'About the Neo.mjs platform.'},
            '/docs'            : {title: 'Neo.mjs API Docs', description: 'API documentation.'},
            '/examples'        : {title: 'Neo.mjs Examples', description: 'Live examples.'},
            '/home'            : {title: 'Neo.mjs', description: 'Multi-threaded UI engine and Agent OS.'},
            '/news'            : {title: 'Neo.mjs News', description: 'Releases, blog, and updates.'},
            '/news/blog'       : {title: 'Neo.mjs Engineering Blog', description: 'Engineering blog posts.'},
            '/news/discussions': {title: 'Neo.mjs Discussions', description: 'Architectural discussions.'},
            '/news/medium'     : {title: 'Neo.mjs Medium Archive', description: 'External articles.'},
            '/news/releases'   : {title: 'Neo.mjs Release Notes', description: 'Version history.'},
            '/news/videos'     : {title: 'Neo.mjs Videos', description: 'Live demos and product films.'},
            '/services'        : {title: 'Connect with Neo.mjs', description: 'Connect with the maintainers.'}
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
            examplesDir : path.join(tempDir, 'no-examples'),
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
            examplesDir : path.join(tempDir, 'no-examples'),
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
            examplesDir : path.join(tempDir, 'no-examples'),
            learnDir,
            releaseNotesRoot,
            root        : tempDir,
            treeFilePath
        })).rejects.toThrow(/guides\/Missing/);
        await expect(getSitemapXml({
            baseUrl       : 'https://neomjs.com/',
            blogIndexPath,
            corpusRoot,
            examplesDir   : path.join(tempDir, 'no-examples'),
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
            schemaType : 'TechArticle',
            robots     : 'noindex, follow'
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

    test('extractMarkdownSeoMetadata skips leading page-metadata fields and the TL;DR label (#21820)', () => {
        const describe = lines => extractMarkdownSeoMetadata(lines.join('\n')).description;

        expect(describe([
            '# Neo.mjs v11.17.1 Release Notes',
            '',
            '**Release Type:** Patch Release',
            '**Stability:** Production-ready',
            '**Upgrade Path:** Drop-in replacement for v11.17.0',
            '',
            '---',
            '',
            'This patch release fixes a configuration oversight that left new applications out of the npm package.'
        ])).toBe('This patch release fixes a configuration oversight that left new applications out of the npm package.');

        expect(describe([
            '# Neo.mjs v13.4.0 Release Notes',
            '',
            '**Release Type:** A minor release, and the householding one, with the open issues down to five.',
            '',
            '**Stability:** Stable.',
            '**Upgrade Path:** Not a drop-in for every app.',
            '',
            '> **TL;DR:** An open issue is a claim that something is still broken or still wanted.'
        ])).toBe('An open issue is a claim that something is still broken or still wanted.');

        expect(describe([
            '# Config System Deep Dive',
            '',
            '**Pre-requisite:** It is highly recommended to study [The Unified Class Config System](../ConfigSystem.md)',
            'first to understand the foundations.',
            '',
            '**Target Audience**: Developers who write their own configs and need to know how they resolve.',
            '',
            'The class configuration system is a cornerstone of the engine, declaring state as configs.'
        ])).toBe('The class configuration system is a cornerstone of the engine, declaring state as configs.');

        // A bold label that is not page metadata opens real prose, so it stays the description
        expect(describe([
            '# Fixed Row Heights',
            '',
            '**The Problem:** A grid with a fixed row height has to clip long text or waste space.',
            '',
            'A second paragraph that the description must not reach on this page.'
        ])).toBe('The Problem: A grid with a fixed row height has to clip long text or waste space.');
    });

    test('formatLearnSeoTitle and getSeoJson apply /learn/* search-intent title qualifiers (#20715)', async () => {
        expect(formatLearnSeoTitle('Overview', '/learn/comparisons/Overview')).toBe(
            'Neo.mjs vs React, Angular, Vue & Solid: Application Engine vs JavaScript Frameworks | Neo.mjs'
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
            'Neo.mjs vs React, Angular, Vue & Solid: Application Engine vs JavaScript Frameworks | Neo.mjs'
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
            path.resolve(process.cwd(), 'apps/portal/view/examples/MainContainer.mjs'),
            path.join(noGitRoot, 'apps/portal/view/examples/MainContainer.mjs')
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
        await outputCatalog(path.join(noGitRoot, EXAMPLES_DIR), [
            {id: 'grid-big-data', name: 'Big Data Grid', family: 'grid-table', image: 'devmode/grid-big-data.png', urls: {dist_prod: 'dist/production/examples/grid/bigData/index.html'}, feature: 'Buffered rendering'}
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

    test('prunes aliases and hidden/redirect learn leaves while keeping a release history below 25 indexable', async () => {
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
        for (const version of ['13.4.0', '12.1.0', '11.18.0', '8.0.0']) {
            expect(coreXml).toContain(`<loc>https://neomjs.com/news/releases/${version}</loc>`);
            expect(seoJson[`/news/releases/${version}`]?.robots).toBeUndefined();
        }

        expect(llmsTxt).toContain('- [Home](https://neomjs.com/)');

        expect(seoJson['/learn/benefits/Introduction']?.robots).toBeUndefined();
        expect(seoJson['/learn/guides/specificfeatures/MultiWindow']?.robots).toBe('noindex, follow');
        expect(seoJson['/learn/agentos/decisions/0020-agent-harness-concept']?.robots).toBe('noindex, follow');

        // Verify live tracked apps/portal/resources/data/seo.json invariants
        const liveSeoJson = await fs.readJSON(path.resolve(process.cwd(), 'apps/portal/resources/data/seo.json'));
        expect(liveSeoJson['/']).toEqual(liveSeoJson['/home']);
        expect(liveSeoJson['/']?.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(liveSeoJson['/news/blog/json-ld-xss-json-stringify-in-a-script-tag']?.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        for (const adr of ['0020-agent-harness-concept', '0032-institution-cockpit-render-model', '0034-electron-shell-architecture', '0037-fleet-manager-outward-door-topology', '0038-fm-client-topology']) {
            expect(liveSeoJson[`/learn/agentos/decisions/${adr}`]?.robots).toBe('noindex, follow');
        }
    });

    test('indexes the latest 25 distinct release versions across majors and keeps the full LLM listing', async () => {
        const versions = [
            '14.0.0',
            ...Array.from({length: 6}, (_, i) => `13.${5 - i}.0`),
            '12.1.0', '12.0.0',
            ...Array.from({length: 17}, (_, i) => `11.${27 - i}.0`)
        ];
        const releasesPath = path.join(tempDir, 'apps/portal/resources/data/releases.json');

        await fs.outputJson(path.join(tempDir, 'apps/portal/resources/data/blog.json'), {data: []});
        await fs.outputJson(path.join(tempDir, 'learn/tree.json'), {data: []});
        await Promise.all(versions.map(version => {
            const notesDir = version.startsWith('14.') ? releaseNotesRoot : path.join(releaseNotesRoot, 'chunk-1');

            return fs.outputFile(path.join(notesDir, `v${version}.md`), `# Neo.mjs v${version} Release Notes\n`);
        }));
        await fs.outputFile(path.join(releaseNotesRoot, 'chunk-2/13.0.0.md'), '# Neo.mjs v13.0.0 Release Notes\n');
        await createReleaseIndex({outputFile: releasesPath, releaseNotesRoot});
        const releaseIndex = await fs.readJson(releasesPath);

        releaseIndex.push({id: '99.0.0', isLeaf: true});
        await fs.writeJson(releasesPath, releaseIndex);

        const baseUrl            = 'https://neomjs.com';
        const options            = {baseUrl, corpusRoot, releaseNotesRoot, releasesPath, root: tempDir};
        const seoJson            = await getSeoJson(options);
        const [coreXml, llmsTxt] = await Promise.all([
            getSitemapXml({...options, seoJson}),
            getLlmsTxt(options)
        ]);

        const expectedVersions  = versions.slice(0, 25).sort();
        const coreVersions      = Array.from(coreXml.matchAll(/<loc>https:\/\/neomjs\.com\/news\/releases\/([^<]+)<\/loc>/g), ([, version]) => version).sort();
        const indexableVersions = Object.entries(seoJson)
            .filter(([route, metadata]) => route.startsWith('/news/releases/') && metadata.robots === undefined)
            .map(([route]) => route.split('/').at(-1))
            .sort();

        expect.soft(coreVersions).toEqual(expectedVersions);
        expect.soft(indexableVersions).toEqual(expectedVersions);
        expect.soft(seoJson['/news/releases/11.11.0']?.robots).toBe('noindex, follow');
        expect.soft(seoJson['/news/releases/99.0.0']?.robots).toBe('noindex, follow');
        expect(llmsTxt).toContain('- [v11.12.0](https://neomjs.com/raw/news/releases/11.12.0.md)');
        expect(llmsTxt).toContain('- [v11.11.0](https://neomjs.com/raw/news/releases/11.11.0.md)');
    });
});

test('preserves release cut lastmod through a later squash and uses Git dates for subsequent edits', async () => {
    const tempDir      = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-seo-release-cut-'));
    const root         = path.join(tempDir, 'engine');
    const noteSource   = '.github/RELEASE_NOTES/v14.0.0.md';
    const portalSource = 'apps/portal/index.html';
    const indexSource  = 'apps/portal/resources/data/releases.json';
    const aboutSource  = 'apps/portal/view/about/Container.mjs';
    const notePath     = path.join(root, noteSource);
    const portalPath   = path.join(root, portalSource);
    const seoJsonPath  = path.join(root, 'apps/portal/resources/data/seo.json');
    const releaseRoute = '/news/releases/14.0.0';
    const draftDate    = '2026-11-20';
    const cutDate      = '2026-11-23';
    const draftNote    = '# Neo.mjs v14.0.0 Release Notes\n\nEngine 14 highlights.\n';
    const portalHtml   = '<html><head><title>Neo.mjs Engine 14</title><meta name="description" content="Engine 14."></head></html>';
    const stampedNote  = [
        '---',
        `publishedAt: '${cutDate}T12:00:00Z'`,
        'seoSourcePaths:',
        ...[noteSource, portalSource, indexSource].map(source => `  - ${source}`),
        '---',
        draftNote
    ].join('\n');

    const git = (args, date=draftDate) => execFileSync('git', args, {
        cwd     : root,
        encoding: 'utf8',
        env     : {
            ...process.env,
            GIT_AUTHOR_DATE    : `${date}T12:00:00Z`,
            GIT_AUTHOR_EMAIL   : 'seo-fixture@example.invalid',
            GIT_AUTHOR_NAME    : 'SEO Fixture',
            GIT_COMMITTER_DATE : `${date}T12:00:00Z`,
            GIT_COMMITTER_EMAIL: 'seo-fixture@example.invalid',
            GIT_COMMITTER_NAME : 'SEO Fixture',
            GIT_CONFIG_GLOBAL  : os.devNull,
            GIT_CONFIG_NOSYSTEM: '1'
        }
    }).trim();

    const commit = (date, message) => {
        git(['add', '.']);
        git(['commit', '--quiet', '-m', `${message} (#21808)`], date);
    };

    const index             = () => createReleaseIndex({outputFile: path.join(root, indexSource), releaseNotesRoot: path.dirname(notePath)});
    const familyDefinitions = [{family: 'apps', route: '/examples/apps', title: 'Apps'}];
    const generate          = (options={}) => getSeoJson({root, familyDefinitions, ...options});

    try {
        await fs.outputFile(notePath, draftNote);
        await fs.outputFile(portalPath, portalHtml.replace('Engine 14', 'Engine 14 Draft'));
        await fs.outputFile(path.join(root, aboutSource), '// About page source.\n');
        await outputCatalog(path.join(root, EXAMPLES_DIR), [{
            family   : 'apps',
            image    : 'portal.jpg',
            name     : 'Portal',
            sourceUrl: 'apps/portal',
            urls     : {dist_prod: 'dist/production/apps/portal/index.html'}
        }]);
        await fs.outputJson(seoJsonPath, {
            '/about-us'     : {title: 'About Us', description: 'About the project.'},
            '/news/releases': {title: 'Release Notes', description: 'Neo.mjs release notes.'}
        });
        await index();
        git(['init', '--quiet']);
        commit(draftDate, 'Track the draft');
        const base = git(['rev-parse', 'HEAD']);

        await fs.writeFile(notePath, stampedNote);
        await fs.writeFile(portalPath, portalHtml);
        await index();

        const routes     = ['/', '/home', '/news/releases', releaseRoute, '/examples/apps'];
        const defaultSeo = await generate();
        const baked      = await generate({pendingReleaseNote: notePath});

        expect(routes.map(route => defaultSeo[route]?.lastmod)).toEqual(routes.map(() => draftDate));
        expect.soft(routes.map(route => baked[route]?.lastmod), 'prepared routes use the cut date').toEqual(routes.map(() => cutDate));
        expect(baked['/about-us']?.lastmod).toBe(draftDate);

        await fs.writeJson(seoJsonPath, baked);
        const serializedSeo = JSON.stringify(baked);
        commit(cutDate, 'Prepare the release');
        expect.soft(JSON.stringify(await generate()), 'prepared commit matches its baked catalog').toBe(serializedSeo);

        const tree   = git(['rev-parse', 'HEAD^{tree}']);
        const squash = git(['commit-tree', tree, '-p', base, '-m', 'Squash the release (#21808)'], '2026-11-24');
        git(['checkout', '--quiet', '--detach', squash]);
        expect.soft(JSON.stringify(await generate()), 'later squash matches the same baked catalog').toBe(serializedSeo);

        const packageRoot = path.join(tempDir, 'node_modules/neo.mjs');

        await fs.copy(root, packageRoot, {filter: file => file !== path.join(root, '.git')});
        expect(JSON.stringify(await generate({root: packageRoot}))).toBe(serializedSeo);

        await fs.writeFile(notePath, stampedNote.replace('Engine 14 highlights.', 'Updated Engine 14 highlights.'));
        await fs.writeFile(portalPath, portalHtml.replace('Engine 14.', 'Updated Engine 14.'));
        commit('2026-11-25', 'Edit the release note and Portal');
        const edited = await generate();
        expect([edited['/'].lastmod, edited[releaseRoute].lastmod]).toEqual(['2026-11-25', '2026-11-25']);
        expect(edited['/examples/apps'].lastmod).toBe('2026-11-25');

        await fs.writeFile(notePath, stampedNote);
        await fs.writeFile(portalPath, portalHtml);
        commit('2026-11-26', 'Revert the later edits');
        const reverted = await generate();
        expect([reverted['/'].lastmod, reverted[releaseRoute].lastmod]).toEqual(['2026-11-26', '2026-11-26']);
        expect(reverted['/news/releases'].lastmod).toBe(cutDate);
    } finally {
        await fs.remove(tempDir);
    }
});

test.describe('docs SEO generator #20917: frontmatter seoTitle/seoDescription and search-intent titles', () => {
    test('extractFrontmatterField and extractMarkdownSeoMetadata honor custom seoTitle and seoDescription overrides', () => {
        const doubleQuoted = [
            '---',
            'seoTitle: "Live \\"DOM\\" MCP | Neo.mjs"',
            'seoDescription: "Custom double-quoted description for search intent."',
            '---',
            '# Editorial Heading',
            '',
            'Opening body paragraph that would otherwise become the scraped description.'
        ].join('\n');

        expect(extractFrontmatterField(doubleQuoted, 'seoTitle')).toBe('Live "DOM" MCP | Neo.mjs');
        expect(extractMarkdownSeoMetadata(doubleQuoted, {route: '/learn/guides/mcp/NeuralLink'})).toEqual({
            title      : 'Live "DOM" MCP | Neo.mjs',
            description: 'Custom double-quoted description for search intent.'
        });

        const singleQuotedWithoutBrand = [
            '---',
            "seoTitle: 'Web Worker''s Data Grid'",
            'seoDescription: Unquoted concise developer summary under 160 chars.',
            '---',
            '# Short H1'
        ].join('\n');

        expect(extractFrontmatterField(singleQuotedWithoutBrand, 'seoTitle')).toBe("Web Worker's Data Grid");
        expect(extractMarkdownSeoMetadata(singleQuotedWithoutBrand, {route: '/learn/guides/datahandling/Grids'})).toEqual({
            title      : "Web Worker's Data Grid - Neo.mjs",
            description: 'Unquoted concise developer summary under 160 chars.'
        });
    });

    test('extractPortalIndexMetadata and getSeoJson derive / and /home from apps/portal/index.html with fallback when absent', async () => {
        expect(extractPortalIndexMetadata([
            '<!DOCTYPE html><html><head>',
            '<title>  Neo.mjs - An Agent Institution  </title>',
            '<meta name="description" content="Persistent AI maintainers on one agent\'s record.">',
            '</head></html>'
        ].join('\n'))).toEqual({
            title      : 'Neo.mjs - An Agent Institution',
            description: "Persistent AI maintainers on one agent's record."
        });

        expect(extractPortalIndexMetadata([
            '<html><head>',
            '<title>\n  Multi-Line\n  Portal Title\n</title>',
            "<meta content='Content before name with single quotes.' name='description'>",
            '</head></html>'
        ].join('\n'))).toEqual({
            title      : 'Multi-Line Portal Title',
            description: 'Content before name with single quotes.'
        });

        expect(extractPortalIndexMetadata('<html><head><title>Title Only</title></head></html>')).toBeNull();
        expect(extractPortalIndexMetadata('<html><head><meta name="description" content="Desc only."></head></html>')).toBeNull();
        expect(extractPortalIndexMetadata('<html><head><title>   </title><meta name="description" content="Desc."></head></html>')).toBeNull();

        const isolatedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-seo-portal-index-'));

        try {
            const seoJsonPath     = path.join(isolatedRoot, 'apps/portal/resources/data/seo.json');
            const portalIndexPath = path.join(isolatedRoot, 'apps/portal/index.html');

            await fs.outputJson(seoJsonPath, {
                '/home': {
                    title      : 'Neo.mjs — Home',
                    description: 'Stale fallback description.',
                    lastmod    : '2026-10-21',
                    schemaType : 'WebPage'
                }
            });

            // 1. Without apps/portal/index.html on disk, getSeoJson falls back to existingSeo['/'] || existingSeo['/home']
            const fallbackSeo = await getSeoJson({root: isolatedRoot, seoJsonPath});
            expect(fallbackSeo['/']).toEqual({
                title      : 'Neo.mjs — Home',
                description: 'Stale fallback description.',
                lastmod    : '2026-10-21',
                schemaType : 'WebPage'
            });
            expect(fallbackSeo['/home']).toEqual(fallbackSeo['/']);

            // 2. With apps/portal/index.html present, getSeoJson derives / and /home from index.html at build time
            await fs.outputFile(portalIndexPath, [
                '<!DOCTYPE html><html><head>',
                '<title>Neo.mjs - An Agent Institution</title>',
                '<meta name="description" content="Derived directly from apps/portal/index.html at build time.">',
                '</head></html>'
            ].join('\n'));

            const derivedSeo = await getSeoJson({root: isolatedRoot, seoJsonPath});
            expect(derivedSeo['/']).toEqual({
                title      : 'Neo.mjs - An Agent Institution',
                description: 'Derived directly from apps/portal/index.html at build time.',
                lastmod    : '2026-10-21',
                schemaType : 'WebPage'
            });
            expect(derivedSeo['/home']).toEqual(derivedSeo['/']);
        } finally {
            await fs.remove(isolatedRoot);
        }
    });

    test('apps/portal/index.html and seo.json / and /home align at build time and portal section routes target developer search intent', async () => {
        const rootDir         = process.cwd();
        const indexHtml       = await fs.readFile(path.resolve(rootDir, 'apps/portal/index.html'), 'utf-8');
        const seoJson         = await fs.readJSON(path.resolve(rootDir, 'apps/portal/resources/data/seo.json'));
        const portalIndexMeta = extractPortalIndexMetadata(indexHtml);
        const ldJsonRaw       = indexHtml.match(/<script\s+type="application\/ld\+json"\s+data-schema-name="neo-organism">([\s\S]*?)<\/script>/)?.[1];

        expect(portalIndexMeta).toEqual({
            title      : 'Neo.mjs - An Agent Institution',
            description: expect.stringContaining('Neo.mjs is an agent institution:')
        });
        expect(() => JSON.parse(ldJsonRaw)).not.toThrow();

        expect(seoJson['/']?.title).toBe(portalIndexMeta.title);
        expect(seoJson['/']?.description).toBe(portalIndexMeta.description);
        expect(seoJson['/home']?.title).toBe(portalIndexMeta.title);
        expect(seoJson['/home']?.description).toBe(portalIndexMeta.description);
        expect(seoJson['/']?.title).not.toMatch(/\bframework\b/i);
        expect(seoJson['/']?.description).not.toMatch(/\bframework\b/i);

        const expectedSectionTitles = {
            '/docs'     : 'API Documentation — Multi-Threaded JavaScript Application Engine | Neo.mjs',
            '/examples' : 'Live JavaScript Examples — Web Worker Grids & Multi-Window UI | Neo.mjs',
            '/learn'    : 'Developer Guides — Web Worker UI Engine, SharedWorker & AI Agent OS | Neo.mjs',
            '/news/blog': 'Engineering Blog — Web Worker UI Architecture & AI Agent OS | Neo.mjs'
        };

        for (const [route, expectedTitle] of Object.entries(expectedSectionTitles)) {
            const entry = seoJson[route];
            expect(entry, `missing seo.json entry for ${route}`).toBeTruthy();
            expect(entry.title).toBe(expectedTitle);
            expect(entry.description.length).toBeGreaterThanOrEqual(80);
            expect(entry.description.length).toBeLessThanOrEqual(160);
            expect(entry.description).not.toMatch(/\bframework\b/i);
        }
    });

    test('anchors >= 12 flagship learn, blog, and standalone example routes to developer search intent without framework self-labeling', async () => {
        const rootDir = process.cwd();
        const seoJson = await fs.readJSON(path.resolve(rootDir, 'apps/portal/resources/data/seo.json'));

        const targetSeoRoutes = [
            '/news/blog/a-data-grid-in-a-web-worker',
            '/learn/guides/datahandling/Grids',
            '/learn/guides/datahandling/DynamicGrids',
            '/learn/guides/datahandling/PooledGridAnimation',
            '/learn/benefits/body/OffTheMainThread',
            '/learn/guides/fundamentals/WorkerArchitecture',
            '/learn/benefits/body/MultiWindow',
            '/learn/guides/specificfeatures/MultiWindow',
            '/learn/guides/uibuildingblocks/DockLayouts',
            '/learn/guides/uibuildingblocks/DockLayoutsWindows',
            '/news/blog/json-blueprints-and-shared-workers',
            '/learn/guides/advanced/CanvasArchitecture',
            '/learn/benefits/body/Speed',
            '/learn/guides/coreengine/WhyEnhance',
            '/learn/agentos/NeuralLink',
            '/learn/agentos/CoreSkills',
            '/news/blog/context-engineering-done-right',
            '/news/blog/ai-agents-runtime-possession'
        ];

        const indexableSeoRoutes = targetSeoRoutes.filter(route => !seoJson[route]?.robots?.includes('noindex'));
        expect(indexableSeoRoutes.length).toBeGreaterThanOrEqual(12);

        for (const route of targetSeoRoutes) {
            const entry = seoJson[route];
            expect(entry, `missing seo.json entry for ${route}`).toBeTruthy();
            expect(entry.title).toMatch(/\|\s*Neo\.mjs$/);
            expect(entry.title).not.toMatch(/\bframework\b/i);
            expect(entry.description.length).toBeGreaterThanOrEqual(80);
            expect(entry.description.length).toBeLessThanOrEqual(160);
            expect(entry.description).not.toMatch(/\bframework\b/i);
        }

        const bigDataHtml = await fs.readFile(path.resolve(rootDir, 'examples/grid/bigData/index.html'), 'utf-8');
        const canvasHtml  = await fs.readFile(path.resolve(rootDir, 'examples/component/canvas/index.html'), 'utf-8');

        const bigDataTitle = bigDataHtml.match(/<title>([^<]+)<\/title>/)?.[1] || '';
        const bigDataDesc  = bigDataHtml.match(/<meta\s+name="description"\s+content="([^"]+)"/)?.[1] || '';
        const canvasTitle  = canvasHtml.match(/<title>([^<]+)<\/title>/)?.[1] || '';
        const canvasDesc   = canvasHtml.match(/<meta\s+name="description"\s+content="([^"]+)"/)?.[1] || '';

        expect(bigDataTitle).toBe('JavaScript Data Grid — 100k Rows & 200 Columns in a Web Worker | Neo.mjs');
        expect(bigDataDesc.length).toBeLessThanOrEqual(160);
        expect(bigDataDesc).not.toMatch(/\bframework\b/i);

        expect(canvasTitle).toBe('OffscreenCanvas Web Worker Rendering Example | Neo.mjs');
        expect(canvasDesc.length).toBeLessThanOrEqual(160);
        expect(canvasDesc).not.toMatch(/\bframework\b/i);

        const allUpgradedTitles = [
            ...targetSeoRoutes.map(route => seoJson[route].title),
            bigDataTitle,
            canvasTitle
        ].join('\n');

        for (const phrase of [
            'JavaScript Data Grid',
            '100k',
            'Virtual Scrolling',
            'Web Worker',
            'SharedWorker',
            'Multi-Window',
            'OffscreenCanvas',
            'GitHub Workflow MCP',
            'Live Browser DOM'
        ]) {
            expect(allUpgradedTitles).toContain(phrase);
        }
    });
});

test.describe('docs SEO generator #20919: News hub routes and SharedWorker WebSocket blog post', () => {
    let corpusRoot, releaseNotesRoot, tempDir;

    test.beforeEach(async () => {
        tempDir          = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-seo-20919-'));
        corpusRoot       = path.join(tempDir, 'corpus');
        releaseNotesRoot = path.join(tempDir, 'notes');

        await fs.ensureDir(corpusRoot);
        await fs.outputFile(path.join(releaseNotesRoot, 'v13.4.0.md'), '# Neo.mjs v13.4.0 Release Notes\n');
    });

    test.afterEach(async () => {
        await fs.remove(tempDir);
    });

    test('TOP_LEVEL_SOURCE_PATHS maps all 15 Portal and News hub routes to existing on-disk files', async () => {
        const rootDir = process.cwd();

        expect(Object.keys(TOP_LEVEL_SOURCE_PATHS).sort()).toEqual([
            '/',
            '/about-us',
            '/docs',
            '/examples',
            '/home',
            '/learn',
            '/news',
            '/news/blog',
            '/news/discussions',
            '/news/medium',
            '/news/pulls',
            '/news/releases',
            '/news/tickets',
            '/news/videos',
            '/services'
        ]);

        for (const [route, rawPaths] of Object.entries(TOP_LEVEL_SOURCE_PATHS)) {
            const relPaths = Array.isArray(rawPaths) ? rawPaths : [rawPaths];

            for (const relPath of relPaths) {
                const exists = await fs.pathExists(path.resolve(rootDir, relPath));
                expect(exists, `expected TOP_LEVEL_SOURCE_PATHS[${route}] -> ${relPath} to exist on disk`).toBe(true);
            }
        }
    });

    test('sitemap-core.xml emits 5 indexable News hubs at curated priorities, skips noindex routes, and llms.txt formats human labels', async () => {
        const rootDir = process.cwd();
        const seoJson = await fs.readJSON(path.resolve(rootDir, 'apps/portal/resources/data/seo.json'));

        const [sitemapCore, llmsTxt] = await Promise.all([
            getSitemapXml({
                baseUrl        : 'https://neomjs.com',
                corpusRoot,
                includeArchives: false,
                includeLastmod : false,
                releaseNotesRoot,
                root           : rootDir,
                seoJson
            }),
            getLlmsTxt({
                baseUrl        : 'https://neomjs.com',
                corpusRoot,
                includeArchives: false,
                releaseNotesRoot,
                root           : rootDir
            })
        ]);

        expect(sitemapCore).toContain('<loc>https://neomjs.com/news/blog</loc>\n    <priority>0.9</priority>');
        expect(sitemapCore).toContain('<loc>https://neomjs.com/news/releases</loc>\n    <priority>0.8</priority>');
        expect(sitemapCore).toContain('<loc>https://neomjs.com/news/discussions</loc>\n    <priority>0.6</priority>');
        expect(sitemapCore).toMatch(/<url>\s*<loc>https:\/\/neomjs\.com\/news\/medium<\/loc>\s*<\/url>/);
        expect(sitemapCore).toMatch(/<url>\s*<loc>https:\/\/neomjs\.com\/news\/videos<\/loc>\s*<\/url>/);
        expect(sitemapCore).not.toContain('<loc>https://neomjs.com/news/tickets</loc>');
        expect(sitemapCore).not.toContain('<loc>https://neomjs.com/news/pulls</loc>');

        // Defensive noindex skip in getSitemapXml when seo.json marks a route noindex
        const customNoindexXml = await getSitemapXml({
            baseUrl        : 'https://neomjs.com',
            corpusRoot,
            includeArchives: false,
            includeLastmod : false,
            releaseNotesRoot,
            root           : rootDir,
            seoJson        : {
                ...seoJson,
                '/news/medium': {
                    ...seoJson['/news/medium'],
                    robots: 'noindex, follow'
                }
            }
        });
        expect(customNoindexXml).not.toContain('<loc>https://neomjs.com/news/medium</loc>');

        expect(llmsTxt).toContain('- [News](https://neomjs.com/news)');
        expect(llmsTxt).toContain('- [News — Blog](https://neomjs.com/news/blog)');
        expect(llmsTxt).toContain('- [News — Release Notes](https://neomjs.com/news/releases)');
        expect(llmsTxt).toContain('- [News — Discussions](https://neomjs.com/news/discussions)');
        expect(llmsTxt).toContain('- [News — Medium Archive](https://neomjs.com/news/medium)');
        expect(llmsTxt).toContain('- [News — Videos](https://neomjs.com/news/videos)');
        expect(llmsTxt).not.toContain('[News/blog]');
        expect(llmsTxt).not.toContain('https://neomjs.com/news/tickets');
        expect(llmsTxt).not.toContain('https://neomjs.com/news/pulls');
    });

    test('seo.json carries curated metadata + YYYY-MM-DD lastmod for all News hubs and the SharedWorker WebSocket blog post', async () => {
        const rootDir = process.cwd();
        const seoJson = await fs.readJSON(path.resolve(rootDir, 'apps/portal/resources/data/seo.json'));

        const indexableNewsHubs = ['/news', '/news/blog', '/news/releases', '/news/discussions', '/news/medium', '/news/videos'];
        const noindexNewsHubs   = ['/news/tickets', '/news/pulls'];

        for (const route of indexableNewsHubs) {
            const entry = seoJson[route];
            expect(entry, `missing seo.json entry for ${route}`).toBeTruthy();
            expect(entry.title.length).toBeGreaterThan(15);
            expect(entry.title).not.toMatch(/\bframework\b/i);
            expect(entry.description.length).toBeGreaterThanOrEqual(80);
            expect(entry.description.length).toBeLessThanOrEqual(160);
            expect(entry.description).not.toMatch(/\bframework\b/i);
            expect(entry.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(entry.robots).toBeUndefined();
        }

        for (const route of noindexNewsHubs) {
            const entry = seoJson[route];
            expect(entry, `missing seo.json entry for ${route}`).toBeTruthy();
            expect(entry.title.length).toBeGreaterThan(10);
            expect(entry.title).not.toMatch(/\bframework\b/i);
            expect(entry.description.length).toBeLessThanOrEqual(160);
            expect(entry.description).not.toMatch(/\bframework\b/i);
            expect(entry.robots).toBe('noindex, follow');
            expect(entry.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }

        const sharedWorkerPost = seoJson['/news/blog/one-websocket-across-browser-windows-with-sharedworkers'];
        expect(sharedWorkerPost).toEqual({
            title      : 'SharedWorker WebSocket & Off-Main-Thread UI Across Windows | Neo.mjs',
            description: 'Share one live WebSocket across multiple browser windows in a SharedWorker without copying state per tab: stores, VDOM diffing, and reconnect logic in one heap.',
            schemaType : 'BlogPosting',
            lastmod    : expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
        });
        expect(sharedWorkerPost.description.length).toBeLessThanOrEqual(160);
        expect(sharedWorkerPost.title).not.toMatch(/\bframework\b/i);
        expect(sharedWorkerPost.description).not.toMatch(/\bframework\b/i);
    });

    test('collectExampleRoutes and getSeoJson exclude testbeds/opt-outs, qualify standalone metadata, and prevent duplicate standalone titles (#21169)', async () => {
        const rootDir      = process.cwd();
        const isolatedRoot = path.join(tempDir, 'standalone-seo');
        const seoJsonPath  = path.join(isolatedRoot, 'apps/portal/resources/data/seo.json');
        const examplesDir  = path.join(isolatedRoot, EXAMPLES_DIR);

        await fs.outputFile(path.join(isolatedRoot, 'apps/portal/index.html'), '<!DOCTYPE html><html><head><title>Portal</title></head></html>');
        await fs.outputFile(path.join(isolatedRoot, 'apps/ai/neural-link/index.html'), '<!DOCTYPE html><html><head><title>Neo.mjs Neural Link Testbed</title></head></html>');
        await fs.outputFile(path.join(isolatedRoot, 'examples/dashboard/crossWindowWitness/index.html'), '<!DOCTYPE html><html><head><title>#15065 Cross-Window Witness</title></head></html>');
        await fs.outputFile(path.join(isolatedRoot, 'apps/route/index.html'), '<!DOCTYPE html><html><head><title>Route</title></head></html>');
        await fs.outputJson(path.join(isolatedRoot, 'apps/route/neo-config.json'), {seo: false});
        await fs.outputFile(path.join(isolatedRoot, 'apps/sharedcovid/index.html'), '<!DOCTYPE html><html><head><title>Shared Covid</title></head></html>');
        await fs.outputFile(path.join(isolatedRoot, 'examples/panel/index.html'), '<!DOCTYPE html><html><head><title>Neo Panels</title></head></html>');
        await fs.outputFile(
            path.join(isolatedRoot, 'examples/grid/bigData/index.html'),
            '<!DOCTYPE html><html><head><title>JavaScript Data Grid — 100k Rows | Neo.mjs</title><meta name="description" content="Explicit big data description."></head></html>'
        );
        const fixtureCatalog = [
            {
                id           : 'shared-covid',
                name         : 'Multi Window Covid App',
                feature      : 'Historical country data can move into its own window',
                lookFor      : 'Maximize Historical Data to open the chart popup.',
                sharedWorkers: true,
                urls         : {devmode: 'apps/sharedcovid/index.html?view=chart#mainview=table'}
            },
            {
                id     : 'panel-demo',
                name   : 'Panels',
                feature: 'Switchable Neo.panel.Container headers in a worker thread',
                lookFor: 'Click header tools to collapse panels.',
                urls   : {devmode: 'examples/panel/index.html'}
            }
        ];
        await outputCatalog(examplesDir, fixtureCatalog);

        const routes = await collectExampleRoutes(isolatedRoot);
        expect(routes.map(route => route.id)).toEqual([
            '/apps/sharedcovid/index.html',
            '/examples/grid/bigData/index.html',
            '/examples/panel/index.html'
        ]);

        const fixtureSeo = await getSeoJson({
            blogIndexPath    : path.join(isolatedRoot, 'no-blog.json'),
            examplesDir,
            familyDefinitions: [],
            learnDir         : path.join(isolatedRoot, 'no-learn'),
            releaseNotesRoot : path.join(isolatedRoot, 'no-notes'),
            releasesPath     : path.join(isolatedRoot, 'no-releases.json'),
            root             : isolatedRoot,
            seoJsonPath,
            treeFilePath     : path.join(isolatedRoot, 'no-tree.json')
        });

        expect(fixtureSeo['/apps/ai/neural-link/index.html']).toBeUndefined();
        expect(fixtureSeo['/examples/dashboard/crossWindowWitness/index.html']).toBeUndefined();
        expect(fixtureSeo['/apps/route/index.html']).toBeUndefined();
        expect(fixtureSeo['/apps/sharedcovid/index.html']).toEqual({
            title      : 'Shared Covid — Multi-Window JavaScript Demo | Neo.mjs',
            description: 'Historical country data can move into its own window. Maximize Historical Data to open the chart popup.',
            schemaType : 'WebPage'
        });
        expect((await fs.readJSON(path.join(examplesDir, 'fixture.json')))[0].urls.devmode).toBe('apps/sharedcovid/index.html?view=chart#mainview=table');
        expect(fixtureSeo['/examples/grid/bigData/index.html']).toEqual({
            title      : 'JavaScript Data Grid — 100k Rows | Neo.mjs',
            description: 'Explicit big data description.',
            schemaType : 'WebPage'
        });
        expect(fixtureSeo['/examples/panel/index.html']).toEqual({
            title      : 'Panels — Web Worker JavaScript UI Demo | Neo.mjs',
            description: 'Switchable Neo.panel.Container headers in a worker thread. Click header tools to collapse panels.',
            schemaType : 'WebPage'
        });

        // Verify live repo standalone titles, opt-outs, and catalog caption joins
        const repoRoutes  = await collectExampleRoutes(rootDir);
        const repoIds     = new Set(repoRoutes.map(route => route.id));
        const liveSeoJson = await fs.readJSON(path.resolve(rootDir, 'apps/portal/resources/data/seo.json'));

        expect(repoIds.has('/apps/ai/neural-link/index.html')).toBe(false);
        expect(repoIds.has('/examples/dashboard/crossWindowWitness/index.html')).toBe(false);
        for (const optedOutRoute of [
            '/examples/grid/lockedColumns/index.html',
            '/examples/tablePerformance/index.html',
            '/examples/toolbar/paging/index.html'
        ]) {
            expect(repoIds.has(optedOutRoute)).toBe(false);
            expect(liveSeoJson[optedOutRoute]).toBeUndefined();
            expect(await fs.pathExists(path.resolve(rootDir, optedOutRoute.slice(1)))).toBe(true);
        }
        expect(liveSeoJson['/apps/sharedcovid/index.html']?.description).toBe(
            'A historical country-data chart can move into its own window. Maximise Historical Data, inspect its chart in the popup, then close the popup to return it...'
        );
        expect(new Set(repoRoutes.map(route => route.name)).size).toBe(repoRoutes.length);
        expect(new Set(repoRoutes.map(route => route.sourceTitle)).size).toBe(repoRoutes.length);
    });

    test('formatLearnSeoTitle qualifies Agent Institution spoke routes (#21848)', () => {
        expect(formatLearnSeoTitle('Cockpit Tour', '/learn/institution/CockpitTour')).toBe(
            'Cockpit Tour — AI Agent Institution & Fleet Cockpit | Neo.mjs'
        );
    });
});
