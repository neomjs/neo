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
            reconcileActiveChunksFn : record('rechunk'),
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
            'rechunk',
            'rechunk',
            'rechunk',
            'releases',
            'pulls',
            'discussions',
            'tickets',
            'sitemap',
            'llms'
        ]);
        // The active-tier re-chunk runs for all three content types, before the index builders mirror them.
        expect(calls.filter(call => call.name === 'rechunk').map(call => call.args[1].type)).toEqual([
            'pulls',
            'issues',
            'discussions'
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
            reconcileActiveChunksFn : record('rechunk'),
            createReleaseIndexFn    : record('releases'),
            createPullRequestIndexFn: record('pulls'),
            createDiscussionIndexFn : record('discussions'),
            createTicketIndexFn     : record('tickets'),
            getSitemapXmlFn         : async () => '<xml />',
            getLlmsTxtFn            : async () => 'llms',
            writeFileSync           : () => {},
            log                     : () => {}
        });

        expect(calls).toEqual(['labels', 'rechunk', 'rechunk', 'rechunk', 'releases', 'pulls', 'discussions', 'tickets']);
    });

    test('fails closed when a derive step rejects before generated artifacts are written', async () => {
        const writes = [];

        await expect(rebuildContentIndexesAndSeo({
            createLabelIndexFn      : async () => {},
            reconcileActiveChunksFn : async () => {},
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
        const workflow = await fs.readFile(path.resolve(process.cwd(), '.github/workflows/data-sync-pipeline.yml'), 'utf8');

        expect(workflow).toContain('node ./buildScripts/docs/rebuildContentIndexesAndSeo.mjs --include-labels');
        expect(workflow).not.toContain('node ./buildScripts/docs/index/labels.mjs');
        expect(workflow).not.toContain('node ./buildScripts/docs/index/release.mjs');
        expect(workflow).not.toContain('node ./buildScripts/docs/index/pulls.mjs');
        expect(workflow).not.toContain('node ./buildScripts/docs/index/discussions.mjs');
        expect(workflow).not.toContain('node ./buildScripts/docs/index/tickets.mjs');
        expect(workflow).toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n        run: node ./buildScripts/docs/rebuildContentIndexesAndSeo.mjs --include-labels');
    });
});
