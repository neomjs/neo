import {test, expect}  from '@playwright/test';
import fs              from 'fs-extra';
import os              from 'os';
import path            from 'path';
import {fileURLToPath} from 'url';
import verifySeoArtifacts, {
    CONTENT_SIGNAL_DIRECTIVE,
    LLMS_TXT_MAX_BYTES,
    extractLocUrls,
    findDisallowedCorpusLessPortalFiles,
    findUnlistedLearnMarkdownFiles,
    validateLlmsTxtContent,
    validatePortalIndexJsonLd,
    validateRobotsTxt,
    validateSitemapIndexXml,
    validateUrlsetXml
} from '../../../../../../buildScripts/docs/seo/verify.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');

/**
 * @summary Verifies pre-write cross-artifact validation across `seo.json`, `sitemap*.xml`,
 * `ssg-archive-routes.json`, and `llms*.txt`.
 */
test.describe('buildScripts/docs/seo/verify.mjs (#20774 / #20915)', () => {
    let corpusRoot, releaseNotesRoot, rootDir, tempDir;

    /**
     * @returns {Object}
     */
    function buildValidBundle() {
        return {
            baseUrl: 'https://neomjs.com',
            corpusRoot,
            releaseNotesRoot,
            root   : rootDir,
            seoJson: {
                '/': {
                    title      : 'Neo.mjs',
                    description: 'Multi-threaded JavaScript application engine and Agent OS.',
                    lastmod    : '2026-10-21'
                },
                '/home': {
                    title      : 'Neo.mjs',
                    description: 'Multi-threaded JavaScript application engine and Agent OS.',
                    lastmod    : '2026-10-21'
                },
                '/learn/benefits/Introduction': {
                    title      : 'What Is Neo.mjs?',
                    description: 'Persistent AI maintainers and multi-threaded UI runtime.',
                    lastmod    : '2026-11-10',
                    schemaType : 'TechArticle'
                },
                '/learn/guides/HiddenInternal': {
                    title      : 'Hidden Internal Guide — Neo.mjs Developer Guide',
                    description: 'Internal evidence surface excluded from primary search index.',
                    lastmod    : '2026-08-25',
                    robots     : 'noindex, follow',
                    schemaType : 'TechArticle'
                },
                '/learn/agentos/decisions/0020-stub': {
                    title      : 'ADR 0020 Moved — AI Agent OS & Multi-Threaded Application Engine | Neo.mjs',
                    description: 'Moved pointer stub for ADR 0020.',
                    lastmod    : '2026-10-19',
                    robots     : 'noindex, follow',
                    schemaType : 'TechArticle'
                },
                '/news/blog/json-ld-xss': {
                    title      : 'JSON.stringify is not safe inside a script tag - Neo.mjs',
                    description: 'One closing script tag in a title ends a JSON-LD block early.',
                    lastmod    : '2026-11-12',
                    schemaType : 'BlogPosting'
                },
                '/news/releases/13.4.0': {
                    title      : 'Neo.mjs v13.4.0 Release Notes',
                    description: 'Release notes and changelog for Neo.mjs v13.4.0.',
                    lastmod    : '2026-11-09',
                    schemaType : 'TechArticle'
                },
                '/news/releases/12.1.0': {
                    title      : 'Neo.mjs v12.1.0 Release Notes',
                    description: 'Release notes and changelog for Neo.mjs v12.1.0.',
                    lastmod    : '2026-05-01',
                    schemaType : 'TechArticle'
                },
                '/news/releases/11.0.0': {
                    title      : 'Neo.mjs v11.0.0 Release Notes',
                    description: 'Release notes and changelog for Neo.mjs v11.0.0.',
                    lastmod    : '2025-11-01',
                    schemaType : 'TechArticle'
                },
                '/examples/grid/bigData/index.html': {
                    title      : 'JavaScript Data Grid — 100k Rows & 200 Columns in a Web Worker | Neo.mjs',
                    description: 'Interactive Neo.mjs JavaScript Data Grid benchmark streaming 100,000 rows and 200 columns in a Web Worker.',
                    lastmod    : '2026-11-10',
                    schemaType : 'WebPage'
                }
            },
            ssgArchiveRoutes: {
                routes: [
                    '/news/pulls/9',
                    '/news/tickets/3',
                    '/news/tickets/7'
                ]
            },
            sitemapCoreXml: [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                '  <url><loc>https://neomjs.com/</loc><lastmod>2026-10-21</lastmod></url>',
                '  <url><loc>https://neomjs.com/examples/grid/bigData/index.html</loc><lastmod>2026-11-10</lastmod></url>',
                '  <url><loc>https://neomjs.com/learn/benefits/Introduction</loc><lastmod>2026-11-10</lastmod></url>',
                '  <url><loc>https://neomjs.com/news/blog/json-ld-xss</loc><lastmod>2026-11-12</lastmod></url>',
                '  <url><loc>https://neomjs.com/news/releases/13.4.0</loc><lastmod>2026-11-09</lastmod></url>',
                '  <url><loc>https://neomjs.com/news/releases/12.1.0</loc><lastmod>2026-05-01</lastmod></url>',
                '  <url><loc>https://neomjs.com/news/releases/11.0.0</loc><lastmod>2025-11-01</lastmod></url>',
                '</urlset>'
            ].join('\n'),
            sitemapDiscussionsXml: [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                '  <url><loc>https://neomjs.com/news/discussions/5</loc><lastmod>2026-11-08T10:00:00Z</lastmod></url>',
                '</urlset>'
            ].join('\n'),
            sitemapArchiveXml: [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                '  <url><loc>https://neomjs.com/news/tickets/7</loc></url>',
                '  <url><loc>https://neomjs.com/news/tickets/3</loc></url>',
                '  <url><loc>https://neomjs.com/news/pulls/9</loc></url>',
                '</urlset>'
            ].join('\n'),
            sitemapIndexXml: [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                '  <sitemap><loc>https://neomjs.com/sitemap-core.xml</loc></sitemap>',
                '  <sitemap><loc>https://neomjs.com/sitemap-discussions.xml</loc></sitemap>',
                '</sitemapindex>'
            ].join('\n'),
            llmsTxt: [
                '# Neo.mjs: An Agent Institution',
                '',
                '## Latest Updates',
                '',
                '- [v13.4.0 (2026-11-09): Neo.mjs v13.4.0 Release Notes](https://neomjs.com/raw/news/releases/13.4.0.md)',
                '',
                '## Benefits',
                '',
                '- [Introduction](https://neomjs.com/raw/learn/benefits/Introduction.md)'
            ].join('\n'),
            llmsFullTxt: [
                '# Neo.mjs: Full Documentation Atlas (llms-full.txt)',
                '',
                '# [Introduction](https://neomjs.com/raw/learn/benefits/Introduction.md)',
                'Source: https://neomjs.com/learn/benefits/Introduction',
                '',
                '```markdown',
                'Example fenced raw URL ignored: https://neomjs.com/raw/learn/fenced/IllustrativeOnly.md',
                '```'
            ].join('\n'),
            llmsAllTxt: [
                '# Neo.mjs: An Agent Institution',
                '',
                '- [Ticket #7](https://neomjs.com/raw/news/tickets/7.md)',
                '- [Ticket #3](https://neomjs.com/raw/news/tickets/3.md)',
                '- [Pull Request #9](https://neomjs.com/raw/news/pulls/9.md)',
                '- [Discussion #5](https://neomjs.com/raw/news/discussions/5.md)'
            ].join('\n')
        };
    }

    test.beforeEach(async () => {
        tempDir          = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-seo-verify-'));
        rootDir          = path.join(tempDir, 'repo');
        corpusRoot       = path.join(tempDir, 'corpus');
        releaseNotesRoot = path.join(tempDir, 'notes');

        await fs.outputFile(path.join(rootDir, 'learn/benefits/Introduction.md'), '# What Is Neo.mjs?\n\nPersistent AI maintainers.');
        await fs.outputFile(path.join(rootDir, 'learn/guides/HiddenInternal.md'), '# Hidden Internal Guide\n\nInternal evidence surface.');
        await fs.outputFile(
            path.join(rootDir, 'learn/agentos/decisions/0020-stub.md'),
            '---\ntype: redirect\n---\n# ADR 0020 Moved\n\nMoved to sibling repository.\n'
        );
        await fs.outputJson(path.join(rootDir, 'learn/tree.json'), {
            data: [
                {id: 'benefits/Introduction', isLeaf: true, name: 'Introduction'},
                {id: 'guides/HiddenInternal', hidden: true, isLeaf: true, name: 'Hidden Internal'},
                {id: 'agentos/decisions/0020-stub', isLeaf: true, name: 'ADR 0020'}
            ]
        });
        await fs.outputFile(path.join(rootDir, 'learn/blog/json-ld-xss.md'), '# JSON.stringify XSS\n\nEscape closing script tags.');
        await fs.outputJson(path.join(rootDir, 'apps/portal/resources/data/blog.json'), {
            data: [
                {id: 'blog/json-ld-xss', isLeaf: true, name: 'JSON-LD XSS', path: 'learn/blog/json-ld-xss.md'}
            ]
        });
        await fs.outputFile(path.join(releaseNotesRoot, 'v13.4.0.md'), '# Neo.mjs v13.4.0 Release Notes');
        await fs.outputFile(path.join(releaseNotesRoot, 'v12.1.0.md'), '# Neo.mjs v12.1.0 Release Notes');
        await fs.outputFile(path.join(releaseNotesRoot, 'v11.0.0.md'), '# Neo.mjs v11.0.0 Release Notes');
        await fs.outputFile(path.join(corpusRoot, 'issues/chunk-1/issue-7.md'), '# Ticket 7');
        await fs.outputFile(path.join(corpusRoot, 'archive/issues/v1.0.0/chunk-1/issue-3.md'), '# Ticket 3');
        await fs.outputFile(path.join(corpusRoot, 'pulls/chunk-1/pr-9.md'), '# PR 9');
        await fs.outputFile(path.join(corpusRoot, 'discussions/chunk-1/discussion-5.md'), '# Discussion 5');
    });

    test.afterEach(async () => {
        await fs.remove(tempDir);
    });

    test('passes on a coherent SEO and LLM artifact bundle', async () => {
        await expect(verifySeoArtifacts(buildValidBundle())).resolves.toBeUndefined();
    });

    test('rejects sitemap-archive.xml in sitemap.xml, missing child sitemaps, and duplicate <loc> entries', async () => {
        const leakedArchiveIndexBundle = {
            ...buildValidBundle(),
            sitemapIndexXml: [
                '<sitemapindex>',
                '  <sitemap><loc>https://neomjs.com/sitemap-core.xml</loc></sitemap>',
                '  <sitemap><loc>https://neomjs.com/sitemap-discussions.xml</loc></sitemap>',
                '  <sitemap><loc>https://neomjs.com/sitemap-archive.xml</loc></sitemap>',
                '</sitemapindex>'
            ].join('\n')
        };
        await expect(verifySeoArtifacts(leakedArchiveIndexBundle)).rejects.toThrow(/must not reference noindex archive sitemap/);

        const missingDiscussionsBundle = {
            ...buildValidBundle(),
            sitemapIndexXml: '<sitemapindex><sitemap><loc>https://neomjs.com/sitemap-core.xml</loc></sitemap></sitemapindex>'
        };
        await expect(verifySeoArtifacts(missingDiscussionsBundle)).rejects.toThrow(/missing discussions child sitemap/);

        const duplicateCoreBundle = {
            ...buildValidBundle(),
            sitemapCoreXml: [
                '<urlset>',
                '  <url><loc>https://neomjs.com/</loc><lastmod>2026-10-21</lastmod></url>',
                '  <url><loc>https://neomjs.com/</loc><lastmod>2026-10-21</lastmod></url>',
                '</urlset>'
            ].join('\n')
        };
        await expect(verifySeoArtifacts(duplicateCoreBundle)).rejects.toThrow(/duplicate <loc> entry/);
    });

    test('rejects /home, /apps/portal/index.html, or missing canonical / in sitemap-core.xml', async () => {
        const legacyHomeBundle = {
            ...buildValidBundle(),
            sitemapCoreXml: [
                '<urlset>',
                '  <url><loc>https://neomjs.com/</loc><lastmod>2026-10-21</lastmod></url>',
                '  <url><loc>https://neomjs.com/home</loc><lastmod>2026-10-21</lastmod></url>',
                '</urlset>'
            ].join('\n')
        };
        await expect(verifySeoArtifacts(legacyHomeBundle)).rejects.toThrow(/canonical "\/" rather than/);

        const portalShellBundle = {
            ...buildValidBundle(),
            sitemapCoreXml: [
                '<urlset>',
                '  <url><loc>https://neomjs.com/</loc><lastmod>2026-10-21</lastmod></url>',
                '  <url><loc>https://neomjs.com/apps/portal/index.html</loc></url>',
                '</urlset>'
            ].join('\n')
        };
        await expect(verifySeoArtifacts(portalShellBundle)).rejects.toThrow(/must not contain Portal shell/);

        const missingRootBundle = {
            ...buildValidBundle(),
            sitemapCoreXml: [
                '<urlset>',
                '  <url><loc>https://neomjs.com/learn/benefits/Introduction</loc><lastmod>2026-11-10</lastmod></url>',
                '</urlset>'
            ].join('\n')
        };
        await expect(verifySeoArtifacts(missingRootBundle)).rejects.toThrow(/missing canonical root <loc>/);
    });

    test('rejects route partitioning leaks across core, discussions, archive, ssg-archive-routes.json, and llms.txt', async () => {
        const coreLeakBundle = {
            ...buildValidBundle(),
            sitemapCoreXml: [
                '<urlset>',
                '  <url><loc>https://neomjs.com/</loc><lastmod>2026-10-21</lastmod></url>',
                '  <url><loc>https://neomjs.com/news/tickets/7</loc></url>',
                '</urlset>'
            ].join('\n')
        };
        await expect(verifySeoArtifacts(coreLeakBundle)).rejects.toThrow(/sitemap-core\.xml must not contain archive route/);

        const discussionTicketLeakBundle = {
            ...buildValidBundle(),
            sitemapDiscussionsXml: [
                '<urlset>',
                '  <url><loc>https://neomjs.com/news/tickets/7</loc></url>',
                '</urlset>'
            ].join('\n')
        };
        await expect(verifySeoArtifacts(discussionTicketLeakBundle)).rejects.toThrow(/sitemap-discussions\.xml contains non-discussion route/);

        const archiveDiscussionLeakBundle = {
            ...buildValidBundle(),
            sitemapArchiveXml: [
                '<urlset>',
                '  <url><loc>https://neomjs.com/news/tickets/7</loc></url>',
                '  <url><loc>https://neomjs.com/news/discussions/5</loc></url>',
                '</urlset>'
            ].join('\n')
        };
        await expect(verifySeoArtifacts(archiveDiscussionLeakBundle)).rejects.toThrow(/overlaps with sitemap-discussions\.xml/);

        const archiveCoreOverlapBundle = {
            ...buildValidBundle(),
            sitemapArchiveXml: [
                '<urlset>',
                '  <url><loc>https://neomjs.com/learn/benefits/Introduction</loc></url>',
                '</urlset>'
            ].join('\n')
        };
        await expect(verifySeoArtifacts(archiveCoreOverlapBundle)).rejects.toThrow(/overlaps with sitemap-core\.xml/);

        const unsortedSsgBundle = {
            ...buildValidBundle(),
            ssgArchiveRoutes: {
                routes: ['/news/tickets/7', '/news/pulls/9', '/news/tickets/3']
            }
        };
        await expect(verifySeoArtifacts(unsortedSsgBundle)).rejects.toThrow(/not deterministically sorted/);

        const mismatchedSsgBundle = {
            ...buildValidBundle(),
            ssgArchiveRoutes: {
                routes: ['/news/pulls/9', '/news/tickets/7']
            }
        };
        await expect(verifySeoArtifacts(mismatchedSsgBundle)).rejects.toThrow(/do not match sitemap-archive\.xml/);

        const llmsUrlLeakBundle = {
            ...buildValidBundle(),
            llmsTxt: `${buildValidBundle().llmsTxt}\n- [Ticket](https://neomjs.com/raw/news/tickets/7.md)`
        };
        await expect(verifySeoArtifacts(llmsUrlLeakBundle)).rejects.toThrow(/llms\.txt must not contain ticket/);

        const llmsHeadingLeakBundle = {
            ...buildValidBundle(),
            llmsTxt: `${buildValidBundle().llmsTxt}\n\n## GitHub Discussions\n`
        };
        await expect(verifySeoArtifacts(llmsHeadingLeakBundle)).rejects.toThrow(/archive section "## GitHub Discussions"/);
    });

    test('rejects noindex/hidden/redirect leaks, missing <lastmod>, and missing blog.json seo.json entries', async () => {
        const missingLastmodInCoreBundle = buildValidBundle();
        missingLastmodInCoreBundle.sitemapCoreXml = missingLastmodInCoreBundle.sitemapCoreXml.replace(
            '<loc>https://neomjs.com/</loc><lastmod>2026-10-21</lastmod>',
            '<loc>https://neomjs.com/</loc>'
        );
        await expect(verifySeoArtifacts(missingLastmodInCoreBundle)).rejects.toThrow(/missing <lastmod> despite seo\.json lastmod/);

        const invalidLastmodFormatBundle = buildValidBundle();
        invalidLastmodFormatBundle.seoJson['/'].lastmod = '10/21/2026';
        await expect(verifySeoArtifacts(invalidLastmodFormatBundle)).rejects.toThrow(/invalid lastmod/);

        const noindexInCoreBundle = buildValidBundle();
        noindexInCoreBundle.sitemapCoreXml = noindexInCoreBundle.sitemapCoreXml.replace(
            '</urlset>',
            '  <url><loc>https://neomjs.com/learn/agentos/decisions/0020-stub</loc><lastmod>2026-10-19</lastmod></url>\n</urlset>'
        );
        await expect(verifySeoArtifacts(noindexInCoreBundle)).rejects.toThrow(/must not advertise noindex route/);

        const missingRedirectNoindexInSeoBundle = buildValidBundle();
        delete missingRedirectNoindexInSeoBundle.seoJson['/learn/agentos/decisions/0020-stub'].robots;
        await expect(verifySeoArtifacts(missingRedirectNoindexInSeoBundle)).rejects.toThrow(/hidden or redirect learn route.*noindex, follow/);

        const missingBlogSeoBundle = buildValidBundle();
        delete missingBlogSeoBundle.seoJson['/news/blog/json-ld-xss'];
        missingBlogSeoBundle.sitemapCoreXml = missingBlogSeoBundle.sitemapCoreXml.split('\n')
            .filter(line => !line.includes('<loc>https://neomjs.com/news/blog/json-ld-xss</loc>')).join('\n');
        await expect(verifySeoArtifacts(missingBlogSeoBundle)).rejects.toThrow(/missing blog post metadata entry for "\/news\/blog\/json-ld-xss"/);
    });

    test('enforces sitemap coverage and indexing metadata at release ranks 25 and 26 (#21811)', async () => {
        const bundle       = buildValidBundle(),
              rank25       = '/news/releases/13.3.1',
              rank26       = '/news/releases/13.3.0',
              metadataOnly = '/news/releases/99.0.0',
              coreEntries  = [];

        for (let patch = 0; patch < 25; patch++) {
            const version = `13.3.${patch}`,
                  route   = `/news/releases/${version}`;

            await fs.outputFile(path.join(releaseNotesRoot, `v${version}.md`), `# Neo.mjs v${version} Release Notes`);
            bundle.seoJson[route] = {
                title      : `Neo.mjs v${version} Release Notes`,
                description: `Release notes and changelog for Neo.mjs v${version}.`,
                schemaType : 'TechArticle'
            };

            if (patch > 0) {
                coreEntries.push(`  <url><loc>${bundle.baseUrl}${route}</loc></url>`)
            }
        }

        const historicalRoutes = ['/news/releases/11.0.0', '/news/releases/12.1.0', rank26];
        for (const route of historicalRoutes) {
            bundle.seoJson[route].robots = 'noindex, follow'
        }
        bundle.sitemapCoreXml = bundle.sitemapCoreXml.split('\n')
            .filter(line => !historicalRoutes.some(route => line.includes(`<loc>${bundle.baseUrl}${route}</loc>`)))
            .join('\n').replace('</urlset>', [...coreEntries, '</urlset>'].join('\n'));

        bundle.releasesPath = path.join(rootDir, 'release-index.json');
        await fs.outputJson(bundle.releasesPath, [{id: '99.0.0', isLeaf: true}]);
        bundle.seoJson[metadataOnly] = {
            title      : 'Neo.mjs v99.0.0 metadata',
            description: 'Release index entry without a note.',
            robots     : 'noindex, follow'
        };

        await expect(verifySeoArtifacts(bundle)).resolves.toBeUndefined();

        const missingIndexableSitemapBundle = {
            ...bundle,
            sitemapCoreXml: bundle.sitemapCoreXml.replace(`  <url><loc>${bundle.baseUrl}${rank25}</loc></url>\n`, '')
        };
        await expect(verifySeoArtifacts(missingIndexableSitemapBundle))
            .rejects.toThrow(/sitemap-core\.xml missing indexable release route "\/news\/releases\/13\.3\.1"/);

        const missingIndexableSeoBundle = structuredClone(bundle);
        delete missingIndexableSeoBundle.seoJson[rank25];
        await expect(verifySeoArtifacts(missingIndexableSeoBundle))
            .rejects.toThrow(/seo\.json missing indexable release route "\/news\/releases\/13\.3\.1"/);

        const noindexIndexableBundle = structuredClone(bundle);
        noindexIndexableBundle.seoJson[rank25].robots = 'noindex, follow';
        await expect(verifySeoArtifacts(noindexIndexableBundle))
            .rejects.toThrow(/seo\.json indexable release route "\/news\/releases\/13\.3\.1" must allow indexing/);

        const historicalInSitemapBundle = {
            ...bundle,
            sitemapCoreXml: bundle.sitemapCoreXml.replace('</urlset>', `  <url><loc>${bundle.baseUrl}${rank26}</loc></url>\n</urlset>`)
        };
        await expect(verifySeoArtifacts(historicalInSitemapBundle))
            .rejects.toThrow(/sitemap-core\.xml must not contain historical release route "\/news\/releases\/13\.3\.0"/);

        const metadataOnlyInSitemap = {
            ...bundle,
            sitemapCoreXml: bundle.sitemapCoreXml.replace('</urlset>', `  <url><loc>${bundle.baseUrl}${metadataOnly}</loc></url>\n</urlset>`)
        };
        await expect(verifySeoArtifacts(metadataOnlyInSitemap))
            .rejects.toThrow(/sitemap-core\.xml must not contain historical release route "\/news\/releases\/99\.0\.0"/);

        const missingHistoricalNoindexBundle = structuredClone(bundle);
        delete missingHistoricalNoindexBundle.seoJson[rank26].robots;
        await expect(verifySeoArtifacts(missingHistoricalNoindexBundle))
            .rejects.toThrow(/historical release route "\/news\/releases\/13\.3\.0" must set robots/);

        const missingHistoricalSeoBundle = structuredClone(bundle);
        delete missingHistoricalSeoBundle.seoJson[rank26];
        await expect(verifySeoArtifacts(missingHistoricalSeoBundle))
            .rejects.toThrow(/seo\.json missing historical release route "\/news\/releases\/13\.3\.0"/);
    });

    test('rejects placeholder release titles in llms.txt and missing or generic deep seo.json entries', async () => {
        const placeholderReleaseBundle = {
            ...buildValidBundle(),
            llmsTxt: '- [v13.4.0 (2026-11-09): Update](https://neomjs.com/raw/news/releases/13.4.0.md)'
        };
        await expect(verifySeoArtifacts(placeholderReleaseBundle)).rejects.toThrow(/placeholder ": Update"/);

        const missingSeoEntryBundle = buildValidBundle();
        delete missingSeoEntryBundle.seoJson['/learn/benefits/Introduction'];
        await expect(verifySeoArtifacts(missingSeoEntryBundle)).rejects.toThrow(/missing metadata entry.*\/learn\/benefits\/Introduction/);

        const emptyDescriptionBundle = buildValidBundle();
        emptyDescriptionBundle.seoJson['/learn/benefits/Introduction'].description = '   ';
        await expect(verifySeoArtifacts(emptyDescriptionBundle)).rejects.toThrow(/non-empty description/);

        const bareTitleOnDeepRouteBundle = buildValidBundle();
        bareTitleOnDeepRouteBundle.seoJson['/learn/benefits/Introduction'].title = 'Neo.mjs';
        await expect(verifySeoArtifacts(bareTitleOnDeepRouteBundle)).rejects.toThrow(/bare "Neo\.mjs" title/);
    });

    test('rejects broken /raw/*.md links across learn, release notes, and corpus targets', async () => {
        const brokenLearnBundle = {
            ...buildValidBundle(),
            llmsFullTxt: '# [Missing](https://neomjs.com/raw/learn/guides/DoesNotExist.md)'
        };
        await expect(verifySeoArtifacts(brokenLearnBundle)).rejects.toThrow(/DoesNotExist\.md/);

        const brokenReleaseBundle = {
            ...buildValidBundle(),
            llmsTxt: '- [v99.0.0: Future Release](https://neomjs.com/raw/news/releases/99.0.0.md)'
        };
        await expect(verifySeoArtifacts(brokenReleaseBundle)).rejects.toThrow(/99\.0\.0\.md/);

        const brokenTicketBundle = {
            ...buildValidBundle(),
            llmsAllTxt: '- [Ticket #999999](https://neomjs.com/raw/news/tickets/999999.md)'
        };
        await expect(verifySeoArtifacts(brokenTicketBundle)).rejects.toThrow(/999999\.md/);

        const brokenPullBundle = {
            ...buildValidBundle(),
            llmsAllTxt: '- [PR #888888](https://neomjs.com/raw/news/pulls/888888.md)'
        };
        await expect(verifySeoArtifacts(brokenPullBundle)).rejects.toThrow(/888888\.md/);

        const brokenDiscussionBundle = {
            ...buildValidBundle(),
            llmsAllTxt: '- [Discussion #777777](https://neomjs.com/raw/news/discussions/777777.md)'
        };
        await expect(verifySeoArtifacts(brokenDiscussionBundle)).rejects.toThrow(/777777\.md/);
    });

    test('enforces News hub presence and noindex invariants (#20919)', async () => {
        const ticketsHubInCoreBundle = buildValidBundle();
        ticketsHubInCoreBundle.sitemapCoreXml = [
            '<urlset>',
            '  <url><loc>https://neomjs.com/</loc><lastmod>2026-10-21</lastmod></url>',
            '  <url><loc>https://neomjs.com/news/tickets</loc></url>',
            '</urlset>'
        ].join('\n');
        await expect(verifySeoArtifacts(ticketsHubInCoreBundle)).rejects.toThrow(/noindex News hub route.*\/news\/tickets/);

        const unflaggedPullsHubInSeoBundle = buildValidBundle();
        unflaggedPullsHubInSeoBundle.seoJson['/news/pulls'] = {
            title      : 'GitHub Pull Request Archive — Neo.mjs',
            description: 'Searchable archive of Neo.mjs GitHub pull requests.'
        };
        await expect(verifySeoArtifacts(unflaggedPullsHubInSeoBundle)).rejects.toThrow(/route "\/news\/pulls" must set robots to "noindex, follow"/);

        await fs.outputFile(path.join(rootDir, 'apps/portal/view/news/TabContainer.mjs'), '// News TabContainer');
        await expect(verifySeoArtifacts(buildValidBundle())).rejects.toThrow(/sitemap-core\.xml is missing indexable News hub route "\/news\/blog"/);
    });

    test('validates optional robotsTxt directives while remaining backward-compatible when omitted (#20999)', async () => {
        expect(CONTENT_SIGNAL_DIRECTIVE).toBe('Content-Signal: search=yes, ai-input=yes');

        const validRobotsTxt = [
            'User-agent: *',
            'Allow: /',
            CONTENT_SIGNAL_DIRECTIVE,
            '',
            'Sitemap: https://neomjs.com/sitemap.xml'
        ].join('\n');

        await expect(verifySeoArtifacts(buildValidBundle())).resolves.toBeUndefined();
        await expect(verifySeoArtifacts({
            ...buildValidBundle(),
            robotsTxt: validRobotsTxt
        })).resolves.toBeUndefined();

        await expect(verifySeoArtifacts({
            ...buildValidBundle(),
            robotsTxt: '   '
        })).rejects.toThrow(/robots\.txt must be a non-empty string/);

        await expect(verifySeoArtifacts({
            ...buildValidBundle(),
            robotsTxt: validRobotsTxt.replace('User-agent: *\n', '')
        })).rejects.toThrow(/User-agent: \*/);

        await expect(verifySeoArtifacts({
            ...buildValidBundle(),
            robotsTxt: `${validRobotsTxt}\nDisallow: /`
        })).rejects.toThrow(/Disallow: \//);

        await expect(verifySeoArtifacts({
            ...buildValidBundle(),
            robotsTxt: validRobotsTxt.replace('Allow: /', 'Allow: /docs')
        })).rejects.toThrow(/Allow: \//);

        await expect(verifySeoArtifacts({
            ...buildValidBundle(),
            robotsTxt: validRobotsTxt.replace(`${CONTENT_SIGNAL_DIRECTIVE}\n`, '')
        })).rejects.toThrow(/Content-Signal: search=yes, ai-input=yes/);

        await expect(verifySeoArtifacts({
            ...buildValidBundle(),
            robotsTxt: validRobotsTxt.replace(
                CONTENT_SIGNAL_DIRECTIVE,
                'Content-Signal: search=yes, ai-input=yes, ai-train=yes'
            )
        })).rejects.toThrow(/robots\.txt must declare "Content-Signal: search=yes, ai-input=yes"\./);

        await expect(verifySeoArtifacts({
            ...buildValidBundle(),
            robotsTxt: validRobotsTxt.replace('https://neomjs.com/sitemap.xml', 'https://example.com/sitemap.xml')
        })).rejects.toThrow(/Sitemap: https:\/\/neomjs\.com\/sitemap\.xml/);
    });

    test('exports pure SEO text validators returning accumulated error arrays (#20999)', () => {
        expect(extractLocUrls('<urlset><url><loc> https://neomjs.com/ </loc></url></urlset>'))
            .toEqual(['https://neomjs.com/']);

        expect(validateRobotsTxt([
            'User-agent: *',
            'Allow: /',
            'Content-Signal: search=yes, ai-input=yes',
            'Sitemap: http://127.0.0.1:4173/sitemap.xml'
        ].join('\n'), {
            baseUrl       : 'http://127.0.0.1:4173',
            expectedOrigin: 'https://neomjs.com'
        })).toEqual([]);

        expect(validateRobotsTxt([
            'Disallow: /',
            'Content-Signal: search=yes, ai-input=yes, ai-train=yes'
        ].join('\n'))).toEqual([
            'robots.txt must declare "User-agent: *".',
            'robots.txt must not block the root with "Disallow: /".',
            'robots.txt must declare "Allow: /".',
            'robots.txt must declare "Content-Signal: search=yes, ai-input=yes".',
            'robots.txt must declare "Sitemap: https://neomjs.com/sitemap.xml".'
        ]);

        expect(validateSitemapIndexXml([
            '<sitemapindex>',
            '  <sitemap><loc>https://neomjs.com/sitemap-core.xml</loc></sitemap>',
            '  <sitemap><loc>https://neomjs.com/sitemap-core.xml</loc></sitemap>',
            '  <sitemap><loc>https://neomjs.com/sitemap-archive.xml</loc></sitemap>',
            '</sitemapindex>'
        ].join('\n'))).toEqual([
            'sitemap.xml contains duplicate <loc> entry "https://neomjs.com/sitemap-core.xml".',
            'sitemap.xml must not reference noindex archive sitemap "https://neomjs.com/sitemap-archive.xml".',
            'sitemap.xml is missing discussions child sitemap <loc> "https://neomjs.com/sitemap-discussions.xml".'
        ]);

        expect(validateUrlsetXml('<urlset></urlset>', 'sitemap-discussions.xml', {requireNonEmpty: true}))
            .toEqual(['sitemap-discussions.xml must contain at least one <loc> entry.']);
        expect(validateUrlsetXml('<urlset></urlset>', 'sitemap-discussions.xml', {requireNonEmpty: false}))
            .toEqual([]);

        expect(LLMS_TXT_MAX_BYTES).toBe(100_000);
        expect(validateLlmsTxtContent(
            '# Neo.mjs\n- [Disc](https://neomjs.com/news/discussions/19733)\n## GitHub Discussions\n',
            {maxBytes: 20, requireAtlasLinks: true}
        )).toEqual([
            expect.stringMatching(/^llms\.txt exceeds curated ceiling \(\d+ >= 20 bytes\)\.$/),
            'llms.txt must not contain ticket, pull-request, or discussion archive URLs.',
            'llms.txt must not contain archive section "## GitHub Discussions".',
            'llms.txt must reference "/llms-full.txt".',
            'llms.txt must reference "/llms-all.txt".'
        ]);
    });

    test('rejects excluded testbeds, missing standalone .html seo.json entries, and duplicate standalone titles (#21169)', async () => {
        for (const blockedPath of ['/examples/dashboard/crossWindowWitness/index.html', '/apps/ai/neural-link/index.html']) {
            const testbedBundle = {
                ...buildValidBundle(),
                sitemapCoreXml: [
                    '<urlset>',
                    '  <url><loc>https://neomjs.com/</loc><lastmod>2026-10-21</lastmod></url>',
                    `  <url><loc>https://neomjs.com${blockedPath}</loc></url>`,
                    '</urlset>'
                ].join('\n')
            };
            await expect(verifySeoArtifacts(testbedBundle)).rejects.toThrow(/non-indexable standalone path/);
        }

        const missingStandaloneSeoBundle = buildValidBundle();
        delete missingStandaloneSeoBundle.seoJson['/examples/grid/bigData/index.html'];
        await expect(verifySeoArtifacts(missingStandaloneSeoBundle)).rejects.toThrow(/missing metadata entry.*\/examples\/grid\/bigData\/index\.html/);

        const duplicateTitleBundle = buildValidBundle();
        duplicateTitleBundle.seoJson['/examples/tree/index.html'] = {
            title      : duplicateTitleBundle.seoJson['/examples/grid/bigData/index.html'].title,
            description: 'Duplicate standalone title fixture.',
            lastmod    : '2026-11-10',
            schemaType : 'WebPage'
        };
        duplicateTitleBundle.sitemapCoreXml = duplicateTitleBundle.sitemapCoreXml.replace(
            '</urlset>',
            '  <url><loc>https://neomjs.com/examples/tree/index.html</loc><lastmod>2026-11-10</lastmod></url>\n</urlset>'
        );
        await expect(verifySeoArtifacts(duplicateTitleBundle)).rejects.toThrow(/share duplicate title/);

        const duplicateSourceTitleBundle = buildValidBundle();
        await fs.outputFile(
            path.join(rootDir, 'examples/button/base/index.html'),
            '<!DOCTYPE html><html><head><title>Neo Button</title></head></html>'
        );
        await fs.outputFile(
            path.join(rootDir, 'examples/grid/valueBanding/index.html'),
            '<!DOCTYPE html><html><head><title>Neo Button</title></head></html>'
        );
        duplicateSourceTitleBundle.seoJson['/examples/button/base/index.html'] = {
            title      : 'Button — Web Worker JavaScript UI Demo | Neo.mjs',
            description: 'Button base demo in Neo.mjs.',
            lastmod    : '2026-11-10',
            schemaType : 'WebPage'
        };
        duplicateSourceTitleBundle.seoJson['/examples/grid/valueBanding/index.html'] = {
            title      : 'Button — Web Worker Data Grid Demo | Neo.mjs',
            description: 'Grid value banding demo in Neo.mjs.',
            lastmod    : '2026-11-10',
            schemaType : 'WebPage'
        };
        duplicateSourceTitleBundle.sitemapCoreXml = duplicateSourceTitleBundle.sitemapCoreXml.replace(
            '</urlset>',
            [
                '  <url><loc>https://neomjs.com/examples/button/base/index.html</loc><lastmod>2026-11-10</lastmod></url>',
                '  <url><loc>https://neomjs.com/examples/grid/valueBanding/index.html</loc><lastmod>2026-11-10</lastmod></url>',
                '</urlset>'
            ].join('\n')
        );
        await expect(verifySeoArtifacts(duplicateSourceTitleBundle)).rejects.toThrow(/share duplicate source HTML <title> "Neo Button"/);
    });

    test('flags stray corpus-derived sitemap*.xml and llms*.txt files under apps/portal (#21808)', async () => {
        expect(await findDisallowedCorpusLessPortalFiles(rootDir)).toEqual([]);

        await fs.outputFile(path.join(rootDir, 'apps/portal/robots.txt'), 'User-agent: *\nAllow: /\n');
        await fs.outputFile(path.join(rootDir, 'apps/portal/sitemap.xml'), '<urlset></urlset>');
        await fs.outputFile(path.join(rootDir, 'apps/portal/llms.txt'), '# Neo.mjs');

        expect(await findDisallowedCorpusLessPortalFiles(rootDir)).toEqual([
            'apps/portal/llms.txt',
            'apps/portal/sitemap.xml'
        ]);
    });

    test('validates apps/portal/index.html neo-organism JSON-LD and rejects #/ hash-fragment URLs (#21815)', async () => {
        const portalHtml = await fs.readFile(path.join(REPO_ROOT, 'apps/portal/index.html'), 'utf-8');

        expect(validatePortalIndexJsonLd(portalHtml)).toEqual([]);

        const scriptMatch = portalHtml.match(
            /<script\b[^>]*type=["']application\/ld\+json["'][^>]*data-schema-name=["']neo-organism["'][^>]*>([\s\S]*?)<\/script>/i
        );
        expect(scriptMatch).not.toBeNull();

        const schemaGraph    = JSON.parse(scriptMatch[1])['@graph'];
        const neuralLinkNode = schemaGraph.find(node => node['@id'] === 'https://neomjs.com/#neural-link');

        expect(neuralLinkNode?.url).toBe('https://neomjs.com/learn/agentos/NeuralLink');

        expect(validatePortalIndexJsonLd(
            '<script type="application/ld+json">{"url":"https://neomjs.com/#/learn/agentos/NeuralLink"}</script>'
        )).toEqual([
            'apps/portal/index.html JSON-LD must not contain "#/" hash-fragment URL "https://neomjs.com/#/learn/agentos/NeuralLink".'
        ]);

        expect(validatePortalIndexJsonLd([
            '<script type = "application/ld+json">{"url":"https://neomjs.com/#/learn/agentos/NeuralLink"}</script>',
            '<script type=application/ld+json>{"url":"https://neomjs.com/#/examples/grid"}</script>'
        ].join('\n'))).toEqual([
            'apps/portal/index.html JSON-LD must not contain "#/" hash-fragment URL "https://neomjs.com/#/learn/agentos/NeuralLink".',
            'apps/portal/index.html JSON-LD must not contain "#/" hash-fragment URL "https://neomjs.com/#/examples/grid".'
        ]);

        expect(validatePortalIndexJsonLd([
            '<script type="application/json" data-type="application/ld+json">{"url":"https://neomjs.com/#/learn/agentos/NeuralLink"}</script>',
            '<!-- <script type="application/ld+json">{"url":"https://neomjs.com/#/learn/agentos/NeuralLink"}</script> -->'
        ].join('\n'))).toEqual([]);

        expect(validatePortalIndexJsonLd('<script type="application/ld+json">{broken</script>')).toEqual([
            expect.stringMatching(/^apps\/portal\/index\.html contains invalid application\/ld\+json JSON:/)
        ]);

        await fs.outputFile(
            path.join(rootDir, 'apps/portal/index.html'),
            '<!DOCTYPE html><html><head><script type="application/ld+json">{"url":"https://neomjs.com/#/examples/grid"}</script></head></html>'
        );
        await expect(verifySeoArtifacts(buildValidBundle())).rejects.toThrow(/must not contain "#\/" hash-fragment URL/);
    });

    test('rejects unlisted markdown orphans under learn/ while allowing blog and internal substrate records (#21848)', async () => {
        expect(await findUnlistedLearnMarkdownFiles({root: REPO_ROOT})).toEqual([]);

        await fs.outputFile(path.join(rootDir, 'learn/README.md'), '# Learn Index');
        await fs.outputFile(path.join(rootDir, 'learn/agentos/AGENTS_ATLAS.md'), '# Atlas');
        await fs.outputFile(path.join(rootDir, 'learn/agentos/measurements/probe.md'), '# Measurement');
        await expect(verifySeoArtifacts(buildValidBundle())).resolves.toBeUndefined();

        await fs.outputFile(path.join(rootDir, 'learn/agentos/tooling/UnlistedOrphan.md'), '# Unlisted Orphan');
        await expect(verifySeoArtifacts(buildValidBundle())).rejects.toThrow(
            /Unlisted markdown orphan\(s\) under learn\/ absent from learn\/tree\.json: learn\/agentos\/tooling\/UnlistedOrphan\.md/
        );
    });
});
