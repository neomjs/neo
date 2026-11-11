import {test, expect}    from '@playwright/test';
import fs                from 'fs-extra';
import os                from 'os';
import path              from 'path';
import verifySeoArtifacts from '../../../../../../buildScripts/docs/seo/verify.mjs';

/**
 * @summary Verifies pre-write cross-artifact validation across `seo.json`, `sitemap*.xml`, and `llms*.txt`.
 */
test.describe('buildScripts/docs/seo/verify.mjs', () => {
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
                '/home': {
                    title      : 'Neo.mjs',
                    description: 'Multi-threaded JavaScript application engine and Agent OS.'
                },
                '/learn/benefits/Introduction': {
                    title      : 'What Is Neo.mjs?',
                    description: 'Persistent AI maintainers and multi-threaded UI runtime.',
                    schemaType : 'TechArticle'
                },
                '/news/releases/13.4.0': {
                    title      : 'Neo.mjs v13.4.0 Release Notes',
                    description: 'Release notes and changelog for Neo.mjs v13.4.0.',
                    schemaType : 'TechArticle'
                }
            },
            sitemapCoreXml: [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                '  <url><loc>https://neomjs.com/home</loc></url>',
                '  <url><loc>https://neomjs.com/examples/grid/bigData/index.html</loc></url>',
                '  <url><loc>https://neomjs.com/learn/benefits/Introduction</loc></url>',
                '  <url><loc>https://neomjs.com/news/releases/13.4.0</loc></url>',
                '</urlset>'
            ].join('\n'),
            sitemapArchiveXml: [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                '  <url><loc>https://neomjs.com/news/tickets/7</loc></url>',
                '  <url><loc>https://neomjs.com/news/tickets/3</loc></url>',
                '  <url><loc>https://neomjs.com/news/pulls/9</loc></url>',
                '  <url><loc>https://neomjs.com/news/discussions/5</loc></url>',
                '</urlset>'
            ].join('\n'),
            sitemapIndexXml: [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                '  <sitemap><loc>https://neomjs.com/sitemap-core.xml</loc></sitemap>',
                '  <sitemap><loc>https://neomjs.com/sitemap-archive.xml</loc></sitemap>',
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
        await fs.outputFile(path.join(releaseNotesRoot, 'v13.4.0.md'), '# Neo.mjs v13.4.0 Release Notes');
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

    test('rejects missing child sitemaps and duplicate <loc> entries across sitemaps', async () => {
        const missingArchiveBundle = {
            ...buildValidBundle(),
            sitemapIndexXml: '<sitemapindex><sitemap><loc>https://neomjs.com/sitemap-core.xml</loc></sitemap></sitemapindex>'
        };
        await expect(verifySeoArtifacts(missingArchiveBundle)).rejects.toThrow(/missing archive child sitemap/);

        const duplicateCoreBundle = {
            ...buildValidBundle(),
            sitemapCoreXml: [
                '<urlset>',
                '  <url><loc>https://neomjs.com/home</loc></url>',
                '  <url><loc>https://neomjs.com/home</loc></url>',
                '</urlset>'
            ].join('\n')
        };
        await expect(verifySeoArtifacts(duplicateCoreBundle)).rejects.toThrow(/duplicate <loc> entry/);
    });

    test('rejects archive route leaks in sitemap-core.xml or llms.txt and non-archive leaks in sitemap-archive.xml', async () => {
        const coreLeakBundle = {
            ...buildValidBundle(),
            sitemapCoreXml: [
                '<urlset>',
                '  <url><loc>https://neomjs.com/home</loc></url>',
                '  <url><loc>https://neomjs.com/news/tickets/7</loc></url>',
                '</urlset>'
            ].join('\n')
        };
        await expect(verifySeoArtifacts(coreLeakBundle)).rejects.toThrow(/sitemap-core\.xml must not contain archive route/);

        const archiveLeakBundle = {
            ...buildValidBundle(),
            sitemapArchiveXml: [
                '<urlset>',
                '  <url><loc>https://neomjs.com/learn/benefits/Introduction</loc></url>',
                '</urlset>'
            ].join('\n')
        };
        await expect(verifySeoArtifacts(archiveLeakBundle)).rejects.toThrow(/overlaps with sitemap-core\.xml/);

        const nonArchiveOnlyBundle = {
            ...buildValidBundle(),
            sitemapArchiveXml: [
                '<urlset>',
                '  <url><loc>https://neomjs.com/about-us</loc></url>',
                '</urlset>'
            ].join('\n')
        };
        await expect(verifySeoArtifacts(nonArchiveOnlyBundle)).rejects.toThrow(/non-archive route/);

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
