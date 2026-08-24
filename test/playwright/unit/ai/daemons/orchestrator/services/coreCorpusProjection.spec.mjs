import {setup} from '../../../../../setup.mjs';

setup({appConfig: {name: 'CoreCorpusProjectionServiceTest'}});

import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'node:os';
import path           from 'node:path';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    isCoreCorpusProjectionPath,
    runCoreCorpusProjectionCycle
} from '../../../../../../../ai/daemons/orchestrator/services/coreCorpusProjection.mjs';
import {readCorpusProjectionReceipt} from '../../../../../../../ai/services/graph/corpusProjectionReceiptStore.mjs';

const HEAD_A = 'a'.repeat(40);
const HEAD_B = 'b'.repeat(40);

function createConfig(root) {
    return {
        enabled                    : true,
        sourceRepository           : 'https://github.com/neomjs/neo.git',
        sourceRef                  : 'refs/heads/dev',
        mirrorRoot                 : path.join(root, 'mirror'),
        materializedRoot           : path.join(root, 'materialized'),
        receiptPath                : path.join(root, 'projection.json'),
        readConcurrency            : 2,
        fullRematerializeIntervalMs: Number.MAX_SAFE_INTEGER
    }
}

function createGitMirror({head = HEAD_A, pathsByRevision = {}, filesByRevision = {}, diff = {addedOrChanged: [], deleted: []}} = {}) {
    let cloned = false;

    return {
        setHead(value) {
            head = value
        },
        setDiff(value) {
            diff = value
        },
        async cloneIfMissing() {
            const first = !cloned;
            cloned = true;
            return {cloned: first, mirrorPath: '/fixture/mirror.git'}
        },
        async fetch() {
            return {newRevisions: []}
        },
        async resolveHead() {
            return head
        },
        async isAncestor() {
            return true
        },
        async listRevisionPaths({revision}) {
            return [...(pathsByRevision[revision] || [])]
        },
        async diffRevisions() {
            return {...diff}
        },
        async readRevisionFile({revision, sourcePath}) {
            const content = filesByRevision[revision]?.[sourcePath];
            if (content === undefined) throw new Error(`missing fixture ${revision}:${sourcePath}`);
            return content
        }
    }
}

function createIngestor(calls, failures = {}) {
    const run = facet => async options => {
        calls.push({facet, options});
        if (failures[facet]) throw failures[facet]
    };

    return {
        ingestIssueStates        : run('issues'),
        ingestPullRequestFeedback: run('pulls'),
        ingestDiscussionStates   : run('discussions')
    }
}

test.describe('coreCorpusProjection — source-neutral writer (#17627)', () => {
    test('recognizes only the three corpus facets plus their index inputs', () => {
        for (const sourcePath of [
            'resources/content/_index.json',
            'resources/content/issues/chunk-1/issue-1.md',
            'resources/content/archive/pulls/v13/pr-1.md',
            'resources/content/discussions/discussion-1.md'
        ]) {
            expect(isCoreCorpusProjectionPath(sourcePath), sourcePath).toBe(true)
        }

        expect(isCoreCorpusProjectionPath('resources/content/release-notes/v13.2.0.md')).toBe(false);
        expect(isCoreCorpusProjectionPath('ai/configBase.mjs')).toBe(false)
    });

    test('cold start fully materializes one exact source revision before committing every facet', async () => {
        const root   = fs.mkdtempSync(path.join(os.tmpdir(), 'core-corpus-cold-')),
              config = createConfig(root),
              paths  = [
                  'resources/content/_index.json',
                  'resources/content/issues/issue-1.md',
                  'resources/content/pulls/pr-2.md',
                  'resources/content/discussions/discussion-3.md',
                  'README.md'
              ],
              files = Object.fromEntries(paths.filter(isCoreCorpusProjectionPath).map(sourcePath => [sourcePath, `content:${sourcePath}`])),
              gitMirror = createGitMirror({
                  pathsByRevision: {[HEAD_A]: paths},
                  filesByRevision: {[HEAD_A]: files}
              }),
              calls = [];

        try {
            const outcome = await runCoreCorpusProjectionCycle({
                config,
                gitMirror,
                issueIngestor: createIngestor(calls),
                now          : Date.parse('2026-08-24T00:00:00.000Z')
            });

            expect(outcome).toMatchObject({
                status         : 'completed',
                headRevision   : HEAD_A,
                materialization: {full: true, deleted: []}
            });
            expect(calls.map(call => call.facet)).toEqual(['issues', 'pulls', 'discussions']);
            expect(calls.every(call => call.options.strict === true && call.options.contentRoot === config.materializedRoot)).toBe(true);
            expect(fs.readFileSync(path.join(config.materializedRoot, 'issues/issue-1.md'), 'utf8'))
                .toBe('content:resources/content/issues/issue-1.md');

            const receipt = await readCorpusProjectionReceipt(config.receiptPath);
            expect(receipt.materializedCorpusRevision).toBe(HEAD_A);
            expect(receipt.lastFullMaterializationAt).toBe('2026-08-24T00:00:00.000Z');
            expect(receipt.projectedRevisionByFacet).toEqual({
                issues     : HEAD_A,
                pulls      : HEAD_A,
                discussions: HEAD_A
            })
        } finally {
            fs.removeSync(root)
        }
    });

    test('a later linear head applies exact add/delete/archive-move reconciliation without a full rebuild', async () => {
        const root      = fs.mkdtempSync(path.join(os.tmpdir(), 'core-corpus-incremental-')),
              config    = createConfig(root),
              active    = 'resources/content/issues/issue-4.md',
              archived  = 'resources/content/archive/issues/v13/issue-4.md',
              gitMirror = createGitMirror({
                  pathsByRevision: {[HEAD_A]: [active]},
                  filesByRevision: {
                      [HEAD_A]: {[active]: 'state: OPEN'},
                      [HEAD_B]: {[archived]: 'state: CLOSED'}
                  }
              }),
              calls = [];

        try {
            await runCoreCorpusProjectionCycle({
                config,
                gitMirror,
                issueIngestor: createIngestor(calls),
                now          : Date.parse('2026-08-24T00:00:00.000Z')
            });

            gitMirror.setHead(HEAD_B);
            gitMirror.setDiff({addedOrChanged: [archived], deleted: [active]});

            const outcome = await runCoreCorpusProjectionCycle({
                config,
                gitMirror,
                issueIngestor: createIngestor(calls),
                now          : Date.parse('2026-08-24T00:01:00.000Z')
            });

            expect(outcome.materialization).toEqual({
                full          : false,
                addedOrChanged: [archived],
                deleted       : [active]
            });
            expect(fs.pathExistsSync(path.join(config.materializedRoot, 'issues/issue-4.md'))).toBe(false);
            expect(fs.readFileSync(path.join(config.materializedRoot, 'archive/issues/v13/issue-4.md'), 'utf8')).toBe('state: CLOSED');
            expect(outcome.receipt.projectedRevisionByFacet).toEqual({
                issues     : HEAD_B,
                pulls      : HEAD_B,
                discussions: HEAD_B
            })
        } finally {
            fs.removeSync(root)
        }
    });

    test('one failed facet holds its cursor while independent siblings still commit', async () => {
        const root         = fs.mkdtempSync(path.join(os.tmpdir(), 'core-corpus-failure-')),
              config       = createConfig(root),
              issueFailure = Object.assign(new Error('injected issue failure'), {code: 'ISSUE_PROJECTION_FAILED'}),
              calls        = [],
              gitMirror    = createGitMirror({pathsByRevision: {[HEAD_A]: []}});

        try {
            let failure;
            try {
                await runCoreCorpusProjectionCycle({
                    config,
                    gitMirror,
                    issueIngestor: createIngestor(calls, {issues: issueFailure}),
                    now          : Date.parse('2026-08-24T00:00:00.000Z')
                })
            } catch (error) {
                failure = error
            }

            expect(failure).toMatchObject({
                code    : 'CORE_CORPUS_PROJECTION_INCOMPLETE',
                failures: [{facet: 'issues', errorCode: 'ISSUE_PROJECTION_FAILED'}]
            });
            expect(calls.map(call => call.facet)).toEqual(['issues', 'pulls', 'discussions']);

            const receipt = await readCorpusProjectionReceipt(config.receiptPath);
            expect(receipt.projectedRevisionByFacet).toEqual({
                issues     : null,
                pulls      : HEAD_A,
                discussions: HEAD_A
            });
            expect(receipt.projectionStateByFacet.issues).toMatchObject({
                status   : 'failed',
                errorCode: 'ISSUE_PROJECTION_FAILED'
            })
        } finally {
            fs.removeSync(root)
        }
    });

    test('missing source identity refuses before the mirror can run', async () => {
        const root   = fs.mkdtempSync(path.join(os.tmpdir(), 'core-corpus-identity-')),
              config = {...createConfig(root), sourceRepository: ''};

        try {
            await expect(runCoreCorpusProjectionCycle({
                config,
                gitMirror: {cloneIfMissing: async () => { throw new Error('mirror must stay untouched') }}
            })).rejects.toMatchObject({code: 'CORE_CORPUS_SOURCE_IDENTITY_MISSING'})
        } finally {
            fs.removeSync(root)
        }
    })
});
