import {test, expect}     from '@playwright/test';
import fs                 from 'fs-extra';
import os                 from 'os';
import path               from 'path';
import verifySeoArtifacts from '../../../../../../buildScripts/docs/seo/verify.mjs';

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
                    robots     : 'noindex, follow',
                    schemaType : 'TechArticle'
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
                '  <url><loc>https://neomjs.com/examples/grid/bigData/index.html</loc></url>',
                '  <url><loc>https://neomjs.com/learn/benefits/Introduction</loc><lastmod>2026-11-10</lastmod></url>',
                '  <url><loc>https://neomjs.com/news/blog/json-ld-xss</loc><lastmod>2026-11-12</lastmod></url>',
                '  <url><loc>https://neomjs.com/news/releases/13.4.0</loc><lastmod>2026-11-09</lastmod></url>',
                '  <url><loc>https://neomjs.com/news/releases/12.1.0</loc><lastmod>2026-05-01</lastmod></url>',
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

    test('rejects noindex/hidden/redirect/historical-release leaks, missing <lastmod>, and missing blog.json seo.json entries', async () => {
        const missingLastmodInCoreBundle = {
            ...buildValidBundle(),
            sitemapCoreXml: [
                '<urlset>',
                '  <url><loc>https://neomjs.com/</loc></url>',
                '</urlset>'
            ].join('\n')
        };
        await expect(verifySeoArtifacts(missingLastmodInCoreBundle)).rejects.toThrow(/missing <lastmod> despite seo\.json lastmod/);

        const invalidLastmodFormatBundle = buildValidBundle();
        invalidLastmodFormatBundle.seoJson['/'].lastmod = '10/21/2026';
        await expect(verifySeoArtifacts(invalidLastmodFormatBundle)).rejects.toThrow(/invalid lastmod/);

        const noindexInCoreBundle = {
            ...buildValidBundle(),
            sitemapCoreXml: [
                '<urlset>',
                '  <url><loc>https://neomjs.com/</loc><lastmod>2026-10-21</lastmod></url>',
                '  <url><loc>https://neomjs.com/learn/agentos/decisions/0020-stub</loc><lastmod>2026-10-19</lastmod></url>',
                '</urlset>'
            ].join('\n')
        };
        await expect(verifySeoArtifacts(noindexInCoreBundle)).rejects.toThrow(/must not advertise noindex route/);

        const missingRedirectNoindexInSeoBundle = buildValidBundle();
        delete missingRedirectNoindexInSeoBundle.seoJson['/learn/agentos/decisions/0020-stub'].robots;
        await expect(verifySeoArtifacts(missingRedirectNoindexInSeoBundle)).rejects.toThrow(/hidden or redirect learn route.*noindex, follow/);

        const oldReleaseInCoreBundle = buildValidBundle();
        delete oldReleaseInCoreBundle.seoJson['/news/releases/11.0.0'].robots;
        oldReleaseInCoreBundle.sitemapCoreXml = [
            '<urlset>',
            '  <url><loc>https://neomjs.com/</loc><lastmod>2026-10-21</lastmod></url>',
            '  <url><loc>https://neomjs.com/news/releases/13.4.0</loc><lastmod>2026-11-09</lastmod></url>',
            '  <url><loc>https://neomjs.com/news/releases/11.0.0</loc><lastmod>2025-11-01</lastmod></url>',
            '</urlset>'
        ].join('\n');
        await expect(verifySeoArtifacts(oldReleaseInCoreBundle)).rejects.toThrow(/historical release route "\/news\/releases\/11\.0\.0"/);

        const missingOldReleaseNoindexBundle = buildValidBundle();
        delete missingOldReleaseNoindexBundle.seoJson['/news/releases/11.0.0'].robots;
        await expect(verifySeoArtifacts(missingOldReleaseNoindexBundle)).rejects.toThrow(/historical release route "\/news\/releases\/11\.0\.0" must set robots/);

        const missingBlogSeoBundle = buildValidBundle();
        delete missingBlogSeoBundle.seoJson['/news/blog/json-ld-xss'];
        missingBlogSeoBundle.sitemapCoreXml = [
            '<urlset>',
            '  <url><loc>https://neomjs.com/</loc><lastmod>2026-10-21</lastmod></url>',
            '</urlset>'
        ].join('\n');
        await expect(verifySeoArtifacts(missingBlogSeoBundle)).rejects.toThrow(/missing blog post metadata entry for "\/news\/blog\/json-ld-xss"/);
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
});
