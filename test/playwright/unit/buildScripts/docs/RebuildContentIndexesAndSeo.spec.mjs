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

    test('runs local content index builders before SEO generation and writes both SEO artifacts', async () => {
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
            sitemapPath             : '/repo/apps/portal/sitemap.xml',
            llmsPath                : '/repo/apps/portal/llms.txt',
            createReleaseIndexFn    : record('releases'),
            createPullRequestIndexFn: record('pulls'),
            createDiscussionIndexFn : record('discussions'),
            createTicketIndexFn     : record('tickets'),
            getSitemapXmlFn         : record('sitemap'),
            getLlmsTxtFn            : record('llms'),
            writeFileSync           : (filePath, content) => writes.push({filePath, content}),
            log                     : () => {}
        });

        expect(calls.map(call => call.name)).toEqual([
            'releases',
            'pulls',
            'discussions',
            'tickets',
            'sitemap',
            'llms'
        ]);
        expect(calls.find(call => call.name === 'releases').args[0]).toEqual({releaseNotesRoot});
        expect(calls.filter(call => ['pulls', 'discussions', 'tickets'].includes(call.name)).map(call => call.args[0]))
            .toEqual([{corpusRoot}, {corpusRoot}, {corpusRoot}]);
        expect(calls.find(call => call.name === 'sitemap').args[0]).toEqual({
            baseUrl            : 'https://example.test',
            corpusRoot,
            existingSitemapPath: '/repo/apps/portal/sitemap.xml',
            releaseNotesRoot
        });
        expect(calls.find(call => call.name === 'llms').args[0]).toEqual({
            baseUrl: 'https://example.test',
            corpusRoot,
            releaseNotesRoot
        });
        expect(writes).toEqual([
            {filePath: '/repo/apps/portal/sitemap.xml', content: 'sitemap-result'},
            {filePath: '/repo/apps/portal/llms.txt', content: 'llms-result'}
        ]);
        expect(result).toEqual({
            baseUrl    : 'https://example.test',
            llmsPath   : '/repo/apps/portal/llms.txt',
            sitemapPath: '/repo/apps/portal/sitemap.xml'
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
            getSitemapXmlFn         : async () => '<xml />',
            getLlmsTxtFn            : async () => 'llms',
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
            getSitemapXmlFn         : record('sitemap'),
            getLlmsTxtFn            : record('llms'),
            writeFileSync           : () => calls.push('write'),
            log                     : () => {}
        })).rejects.toThrow('--corpus-root');

        expect(calls).toEqual([]);
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
            getSitemapXmlFn         : async () => '<xml />',
            getLlmsTxtFn            : async () => 'llms',
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
});
