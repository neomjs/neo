import {test, expect} from '@playwright/test';
import fs             from 'fs/promises';
import path           from 'path';

import {
    rebuildContentIndexesAndSeo
} from '../../../../../../buildScripts/docs/rebuildContentIndexesAndSeo.mjs';

test.describe('rebuildContentIndexesAndSeo (#13260)', () => {
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
        expect(calls.find(call => call.name === 'sitemap').args[0]).toEqual({
            baseUrl            : 'https://example.test',
            existingSitemapPath: '/repo/apps/portal/sitemap.xml'
        });
        expect(calls.find(call => call.name === 'llms').args[0]).toEqual({
            baseUrl: 'https://example.test'
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

        // And the pass did not simply vanish: the emitter carries it, ordered before its own derive
        // call, so every reader — this script included — projects an already-canonical corpus. If the
        // emitter ever drops the pass without a replacement, this fails before the drift can compound.
        const emitter = await fs.readFile(
            path.resolve(process.cwd(), 'ai/services/github-workflow/SyncService.mjs'), 'utf8'
        );

        const
            firstRechunk = emitter.indexOf('await reconcileActiveChunks('),
            deriveCall   = emitter.indexOf('await this.rebuildContentIndexesAndSeo()');

        expect(firstRechunk).toBeGreaterThan(-1);
        expect(deriveCall).toBeGreaterThan(firstRechunk);
        expect(emitter.match(/await reconcileActiveChunks\(/g)).toHaveLength(3);
    });

    test('fails closed when a derive step rejects before generated artifacts are written', async () => {
        const writes = [];

        await expect(rebuildContentIndexesAndSeo({
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

    test('data-sync pipeline delegates to the shared helper instead of duplicating the seven derive commands', async () => {
        const [workflow, publisher] = await Promise.all([
            fs.readFile(path.resolve(process.cwd(), '.github/workflows/data-sync-pipeline.yml'), 'utf8'),
            fs.readFile(path.resolve(process.cwd(), 'buildScripts/dataSyncPipeline.mjs'), 'utf8')
        ]);
        const delegatedPipeline = workflow + publisher;

        expect(workflow).toContain('node ./buildScripts/dataSyncPipeline.mjs');
        expect(publisher).toContain('./buildScripts/docs/rebuildContentIndexesAndSeo.mjs');
        expect(delegatedPipeline).not.toContain('node ./buildScripts/docs/index/labels.mjs');
        expect(delegatedPipeline).not.toContain('node ./buildScripts/docs/index/release.mjs');
        expect(delegatedPipeline).not.toContain('node ./buildScripts/docs/index/pulls.mjs');
        expect(delegatedPipeline).not.toContain('node ./buildScripts/docs/index/discussions.mjs');
        expect(delegatedPipeline).not.toContain('node ./buildScripts/docs/index/tickets.mjs');
        // The pipeline step receives SCOPED credentials and no ambient repository token. This
        // previously pinned `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` — one token for the publish
        // push AND for cross-repository intake reads, two different authorization contracts that the
        // default token satisfies neither of.
        //
        // The intake half went with the DevIndex stages, so one scoped credential
        // remains here. The property under test is unchanged: the step names what it is entitled to.
        expect(workflow).not.toContain('DATA_SYNC_INTAKE_TOKEN');
        expect(workflow).toContain('DATA_SYNC_PUBLISHER_TOKEN: ${{ steps.publisher-token.outputs.token }}');

        // The assertion that matters: the ambient repository token is gone from the run step, so a
        // future edit reinstating it would fail here rather than silently restoring the shared
        // credential this split exists to remove.
        expect(workflow).not.toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}');

        // The publish push runs through the checkout credential, so it must be the publisher —
        // the only identity permitted to bypass the ruleset.
        expect(workflow).toContain('token: ${{ steps.publisher-token.outputs.token }}');
    });
});
