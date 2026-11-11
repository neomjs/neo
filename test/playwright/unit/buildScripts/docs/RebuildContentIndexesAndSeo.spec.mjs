import {test, expect} from '@playwright/test';
import fs             from 'fs/promises';
import os             from 'os';
import path           from 'path';

import {
    rebuildContentIndexesAndSeo
} from '../../../../../buildScripts/docs/rebuildContentIndexesAndSeo.mjs';

test.describe('rebuildContentIndexesAndSeo (#13260)', () => {
    let corpusRoot, releaseNotesRoot, tempDir;

    test.beforeEach(async () => {
        tempDir          = await fs.mkdtemp(path.join(os.tmpdir(), 'rebuild-content-'));
        corpusRoot       = path.join(tempDir, 'corpus');
        releaseNotesRoot = path.join(tempDir, 'release-notes');

        await fs.mkdir(corpusRoot);
        await fs.mkdir(releaseNotesRoot)
    });

    test.afterEach(async () => {
        await fs.rm(tempDir, {force: true, recursive: true})
    });

    test('runs local content index builders before SEO generation and writes all segmented SEO/LLM artifacts', async () => {
        const
            calls  = [],
            writes = [];

        const record = name => async (...args) => {
            calls.push({name, args});
            return `${name}-result`;
        };

        const result = await rebuildContentIndexesAndSeo({
            root                    : '/repo',
            corpusRoot,
            releaseNotesRoot,
            baseUrl                 : 'https://example.test',
            seoJsonPath             : '/repo/apps/portal/resources/data/seo.json',
            sitemapPath             : '/repo/apps/portal/sitemap.xml',
            llmsPath                : '/repo/apps/portal/llms.txt',
            createReleaseIndexFn    : record('releases'),
            createPullRequestIndexFn: record('pulls'),
            createDiscussionIndexFn : record('discussions'),
            createTicketIndexFn     : record('tickets'),
            getSeoJsonFn            : async (...args) => {
                calls.push({name: 'seo-json', args});
                return {'/home': {title: 'Neo.mjs'}};
            },
            getSitemapXmlFn         : record('sitemap'),
            getSitemapIndexXmlFn    : record('sitemap-index'),
            getLlmsTxtFn            : record('llms'),
            getLlmsFullTxtFn        : record('llms-full'),
            writeFileSync           : (filePath, content) => writes.push({filePath, content}),
            log                     : () => {}
        });

        expect(calls.map(call => call.name)).toEqual([
            'releases',
            'pulls',
            'discussions',
            'tickets',
            'seo-json',
            'sitemap',
            'sitemap',
            'sitemap-index',
            'llms',
            'llms-full',
            'llms'
        ]);
        expect(calls.find(call => call.name === 'releases').args[0]).toEqual({releaseNotesRoot});
        expect(calls.filter(call => ['pulls', 'discussions', 'tickets'].includes(call.name)).map(call => call.args[0]))
            .toEqual([{corpusRoot}, {corpusRoot}, {corpusRoot}]);
        expect(calls.find(call => call.name === 'seo-json').args[0]).toEqual({
            releaseNotesRoot,
            root       : '/repo',
            seoJsonPath: '/repo/apps/portal/resources/data/seo.json'
        });

        const sitemapCalls = calls.filter(call => call.name === 'sitemap');
        expect(sitemapCalls[0].args[0]).toEqual({
            baseUrl            : 'https://example.test',
            corpusRoot,
            existingSitemapPath: '/repo/apps/portal/sitemap-core.xml',
            includeArchives    : false,
            releaseNotesRoot,
            root               : '/repo'
        });
        expect(sitemapCalls[1].args[0]).toEqual({
            baseUrl            : 'https://example.test',
            corpusRoot,
            existingSitemapPath: '/repo/apps/portal/sitemap-archive.xml',
            includeArchives    : true,
            onlyArchives       : true,
            releaseNotesRoot,
            root               : '/repo'
        });
        expect(calls.find(call => call.name === 'sitemap-index').args[0]).toEqual({
            baseUrl : 'https://example.test',
            sitemaps: [
                {path: 'sitemap-core.xml',    xml: 'sitemap-result'},
                {path: 'sitemap-archive.xml', xml: 'sitemap-result'}
            ]
        });

        const llmsCalls = calls.filter(call => call.name === 'llms');
        expect(llmsCalls[0].args[0]).toEqual({
            baseUrl        : 'https://example.test',
            corpusRoot,
            includeArchives: false,
            releaseNotesRoot,
            root           : '/repo'
        });
        expect(llmsCalls[1].args[0]).toEqual({
            baseUrl        : 'https://example.test',
            corpusRoot,
            includeArchives: true,
            releaseNotesRoot,
            root           : '/repo'
        });
        expect(calls.find(call => call.name === 'llms-full').args[0]).toEqual({
            baseUrl: 'https://example.test',
            root   : '/repo'
        });

        expect(writes).toEqual([
            {filePath: '/repo/apps/portal/resources/data/seo.json', content: `${JSON.stringify({'/home': {title: 'Neo.mjs'}}, null, 4)}\n`},
            {filePath: '/repo/apps/portal/sitemap-core.xml',        content: 'sitemap-result'},
            {filePath: '/repo/apps/portal/sitemap-archive.xml',     content: 'sitemap-result'},
            {filePath: '/repo/apps/portal/sitemap.xml',             content: 'sitemap-index-result'},
            {filePath: '/repo/apps/portal/llms.txt',                content: 'llms-result'},
            {filePath: '/repo/apps/portal/llms-full.txt',           content: 'llms-full-result'},
            {filePath: '/repo/apps/portal/llms-all.txt',            content: 'llms-result'}
        ]);
        expect(result).toEqual({
            baseUrl           : 'https://example.test',
            llmsAllPath       : '/repo/apps/portal/llms-all.txt',
            llmsFullPath      : '/repo/apps/portal/llms-full.txt',
            llmsPath          : '/repo/apps/portal/llms.txt',
            seoJsonPath       : '/repo/apps/portal/resources/data/seo.json',
            sitemapArchivePath: '/repo/apps/portal/sitemap-archive.xml',
            sitemapCorePath   : '/repo/apps/portal/sitemap-core.xml',
            sitemapPath       : '/repo/apps/portal/sitemap.xml'
        });
    });

    test('can explicitly include the remote GitHub label index for release and CI callers', async () => {
        const calls = [];

        const record = name => async () => {
            calls.push(name);
        };

        await rebuildContentIndexesAndSeo({
            corpusRoot,
            releaseNotesRoot,
            includeLabelIndex       : true,
            createLabelIndexFn      : record('labels'),
            createReleaseIndexFn    : record('releases'),
            createPullRequestIndexFn: record('pulls'),
            createDiscussionIndexFn : record('discussions'),
            createTicketIndexFn     : record('tickets'),
            getSeoJsonFn            : async () => ({}),
            getSitemapXmlFn         : async () => '<xml />',
            getSitemapIndexXmlFn    : async () => '<sitemapindex />',
            getLlmsTxtFn            : async () => 'llms',
            getLlmsFullTxtFn        : async () => 'llms-full',
            writeFileSync           : () => {},
            log                     : () => {}
        });

        expect(calls).toEqual(['labels', 'releases', 'pulls', 'discussions', 'tickets']);
    });

    test('fails naming --corpus-root before any builder runs when no corpus root is declared (#19166)', async () => {
        const calls = [];

        const record = name => async () => {
            calls.push(name);
        };

        await expect(rebuildContentIndexesAndSeo({
            releaseNotesRoot,
            includeLabelIndex       : true,
            createLabelIndexFn      : record('labels'),
            createReleaseIndexFn    : record('releases'),
            createPullRequestIndexFn: record('pulls'),
            createDiscussionIndexFn : record('discussions'),
            createTicketIndexFn     : record('tickets'),
            getSeoJsonFn            : record('seo-json'),
            getSitemapXmlFn         : record('sitemap'),
            getSitemapIndexXmlFn    : record('sitemap-index'),
            getLlmsTxtFn            : record('llms'),
            getLlmsFullTxtFn        : record('llms-full'),
            writeFileSync           : () => calls.push('write'),
            log                     : () => {}
        })).rejects.toThrow('--corpus-root');

        expect(calls).toEqual([]);
    });

    test('rejects a regular file as either root before any builder or write, and a directory passes (#19166)', async () => {
        const file = path.join(tempDir, 'package.json');

        await fs.writeFile(file, '{}');

        const run = async roots => {
            const calls = [];

            const record = name => async () => {
                calls.push(name);
                return '';
            };

            const result = await rebuildContentIndexesAndSeo({
                ...roots,
                includeLabelIndex       : true,
                createLabelIndexFn      : record('labels'),
                createReleaseIndexFn    : record('releases'),
                createPullRequestIndexFn: record('pulls'),
                createDiscussionIndexFn : record('discussions'),
                createTicketIndexFn     : record('tickets'),
                getSeoJsonFn            : record('seo-json'),
                getSitemapXmlFn         : record('sitemap'),
                getSitemapIndexXmlFn    : record('sitemap-index'),
                getLlmsTxtFn            : record('llms'),
                getLlmsFullTxtFn        : record('llms-full'),
                writeFileSync           : () => calls.push('write'),
                log                     : () => {}
            }).then(() => null, error => error.message);

            return {calls, result}
        };

        expect(await run({corpusRoot: file, releaseNotesRoot})).toEqual({
            calls : [],
            result: expect.stringMatching(/--corpus-root .*package\.json is not a directory/)
        });
        expect(await run({corpusRoot, releaseNotesRoot: file})).toEqual({
            calls : [],
            result: expect.stringMatching(/--release-notes .*package\.json is not a directory/)
        });
        expect(await run({corpusRoot, releaseNotesRoot})).toEqual({
            calls : [
                'labels',
                'releases',
                'pulls',
                'discussions',
                'tickets',
                'seo-json',
                'sitemap',
                'sitemap',
                'sitemap-index',
                'llms',
                'llms-full',
                'llms',
                'write',
                'write',
                'write',
                'write',
                'write',
                'write',
                'write'
            ],
            result: null
        });
    });

    test('reads the release notes from the engine\'s .github/RELEASE_NOTES unless a root is declared (#19166)', async () => {
        const
            engineNotes = path.join(tempDir, '.github', 'RELEASE_NOTES'),
            received    = [];

        await fs.mkdir(engineNotes, {recursive: true});

        await rebuildContentIndexesAndSeo({
            root                    : tempDir,
            corpusRoot,
            createReleaseIndexFn    : async options => received.push(options),
            createPullRequestIndexFn: async () => {},
            createDiscussionIndexFn : async () => {},
            createTicketIndexFn     : async () => {},
            getSeoJsonFn            : async () => ({}),
            getSitemapXmlFn         : async () => '<xml />',
            getSitemapIndexXmlFn    : async () => '<sitemapindex />',
            getLlmsTxtFn            : async () => 'llms',
            getLlmsFullTxtFn        : async () => 'llms-full',
            writeFileSync           : () => {},
            log                     : () => {}
        });

        expect(received).toEqual([{releaseNotesRoot: engineNotes}]);
    });

    test('imports nothing from ai/** — the corpus re-chunk belongs to the emitter, not this projection', async () => {
        // The ordinal-100 re-chunk moved to `SyncService#emitGeneratedContentAndDerive` so the corpus
        // WRITER leaves the layout canonical. This arm pins the boundary property at the module level,
        // complementing the repo-wide `check-engine-brain-boundary` guard: a reintroduced `ai/` import
        // fails here inside the unit suite, before the lint-staged/CI guard ever runs.
        const source = await fs.readFile(
            path.resolve(process.cwd(), 'buildScripts/docs/rebuildContentIndexesAndSeo.mjs'), 'utf8'
        );

        expect(source).not.toMatch(/from\s+'[^']*\bai\//);
        expect(source).not.toMatch(/import\('[^']*\bai\//);

        // This arm used to also pin the OTHER side of that boundary — that the emitter still carries
        // the re-chunk pass, ordered before its own derive call — by reading
        // `ai/services/github-workflow/SyncService.mjs`. That file left for `neomjs/neo-agent-brain`
        // in the split, so the assertion is not merely red here, it is unstateable: this repository
        // cannot read it, and a spec that reaches across the split would fail for the wrong reason.
        //
        // Restored deliberately without it rather than with it commented out. The half above is a
        // property of a file that still lives here; the emitter's ordering is the Brain repository's
        // to pin, and claiming it from this side would recreate the coupling the split removed.
    });

    test('fails closed when a derive step rejects before generated artifacts are written', async () => {
        const writes = [];

        await expect(rebuildContentIndexesAndSeo({
            corpusRoot,
            releaseNotesRoot,
            createLabelIndexFn      : async () => {},
            createReleaseIndexFn    : async () => {},
            createPullRequestIndexFn: async () => { throw new Error('pull index failed'); },
            createDiscussionIndexFn : async () => { throw new Error('must not run'); },
            createTicketIndexFn     : async () => { throw new Error('must not run'); },
            getSitemapXmlFn         : async () => '<xml />',
            getLlmsTxtFn            : async () => 'llms',
            writeFileSync           : (filePath, content) => writes.push({filePath, content}),
            log                     : () => {}
        })).rejects.toThrow('pull index failed');

        expect(writes).toEqual([]);
    });

    test('buffers all 7 SEO/LLM writes and writes nothing when verifySeoArtifactsFn rejects', async () => {
        const writes = [];

        await expect(rebuildContentIndexesAndSeo({
            corpusRoot,
            releaseNotesRoot,
            createReleaseIndexFn    : async () => {},
            createPullRequestIndexFn: async () => {},
            createDiscussionIndexFn : async () => {},
            createTicketIndexFn     : async () => {},
            getSeoJsonFn            : async () => ({'/home': {title: 'Neo.mjs', description: 'Home'}}),
            getSitemapXmlFn         : async () => '<urlset />',
            getSitemapIndexXmlFn    : async () => '<sitemapindex />',
            getLlmsTxtFn            : async () => 'llms',
            getLlmsFullTxtFn        : async () => 'llms-full',
            verifySeoArtifactsFn    : async () => { throw new Error('cross-artifact drift detected'); },
            writeFileSync           : (filePath, content) => writes.push({filePath, content}),
            log                     : () => {}
        })).rejects.toThrow('cross-artifact drift detected');

        expect(writes).toEqual([]);
    });

    test('generates and verifies a full real-checkout SEO/LLM bundle without touching tracked Portal artifacts', async () => {
        const outDir       = path.join(tempDir, 'out');
        const seoJsonPath  = path.join(outDir, 'seo.json');
        const releasesPath = path.join(outDir, 'releases.json');
        const sitemapPath  = path.join(outDir, 'sitemap.xml');
        const llmsPath     = path.join(outDir, 'llms.txt');

        await fs.mkdir(outDir, {recursive: true});
        await fs.copyFile(path.resolve(process.cwd(), 'apps/portal/resources/data/seo.json'), seoJsonPath);
        await fs.mkdir(path.join(corpusRoot, 'issues/chunk-1'), {recursive: true});
        await fs.mkdir(path.join(corpusRoot, 'pulls/chunk-1'), {recursive: true});
        await fs.mkdir(path.join(corpusRoot, 'discussions/chunk-1'), {recursive: true});
        await fs.writeFile(path.join(corpusRoot, 'issues/chunk-1/issue-20774.md'), '# Ticket');
        await fs.writeFile(path.join(corpusRoot, 'pulls/chunk-1/pr-20758.md'), '# Pull Request');
        await fs.writeFile(path.join(corpusRoot, 'discussions/chunk-1/discussion-19733.md'), '# Discussion');

        const result = await rebuildContentIndexesAndSeo({
            corpusRoot,
            root                    : process.cwd(),
            releasesPath,
            seoJsonPath,
            sitemapPath,
            llmsPath,
            createPullRequestIndexFn: async () => {},
            createDiscussionIndexFn : async () => {},
            createTicketIndexFn     : async () => {},
            log                     : () => {}
        });

        const [llmsTxt, sitemapCoreXml, sitemapArchiveXml] = await Promise.all([
            fs.readFile(result.llmsPath, 'utf8'),
            fs.readFile(result.sitemapCorePath, 'utf8'),
            fs.readFile(result.sitemapArchivePath, 'utf8')
        ]);

        expect(llmsTxt).toContain('Neo.mjs v13.4.0 Release Notes');
        expect(llmsTxt).not.toContain(': Update](');
        expect(llmsTxt).not.toContain('/childapp/');
        expect(sitemapCoreXml).not.toContain('/childapp/');
        expect(sitemapArchiveXml).toContain('<loc>https://neomjs.com/news/tickets/20774</loc>');
    });
});
