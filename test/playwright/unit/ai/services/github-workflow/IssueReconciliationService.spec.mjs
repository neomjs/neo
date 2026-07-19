import {setup} from '../../../../setup.mjs';

const appName = 'IssueReconciliationServiceTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}                        from '@playwright/test';
import Neo                                   from '../../../../../../src/Neo.mjs';
import * as core                             from '../../../../../../src/core/_export.mjs';
import IssueReconciliationService            from '../../../../../../ai/services/github-workflow/IssueReconciliationService.mjs';
import {canonicalBatchDigest, validateBatch} from '../../../../../../ai/services/memory-core/communityBatchContract.mjs';

/**
 * @summary End-to-end wiring witness for the reconciliation service: fake GraphQL / admission /
 * registry drive one pass and prove the assembled batch is a valid v1 envelope with every axis
 * exhausted, the trust field flowing through, and the cursor advanced only via admission.
 */
test.describe('IssueReconciliationService.reconcile', () => {
    const comment = (id, assoc = 'CONTRIBUTOR') => ({id, createdAt: '2026-01-01T09:00:00Z', lastEditedAt: null, authorAssociation: assoc, author: {login: 'c', __typename: 'User'}}),
          event   = (id, typename) => ({__typename: typename, id, createdAt: '2026-01-01T10:00:00Z', actor: {login: 'm', __typename: 'User'}});

    // A GraphQL fake: one issue page; I_a overflows both its comment and timeline axes, I_b is empty.
    const graphqlService = {
        query: async (queryStr, vars) => {
            if (queryStr.includes('ReconcileIssues')) {
                return {repository: {issues: {
                    pageInfo: {hasNextPage: false, endCursor: 'ISSUES_END'},
                    nodes   : [
                        {
                            id           : 'I_a', createdAt: '2026-01-01T00:00:00Z', lastEditedAt: null, authorAssociation: 'OWNER',
                            author       : {login: 'human', __typename: 'User'},
                            comments     : {pageInfo: {hasNextPage: true, endCursor: '2'}, nodes: [comment('IC_a1'), comment('IC_a2')]},
                            timelineItems: {pageInfo: {hasNextPage: true, endCursor: 'T2'}, nodes: [event('CE_a1', 'ClosedEvent')]}
                        },
                        {
                            id           : 'I_b', createdAt: '2026-01-02T00:00:00Z', lastEditedAt: null, authorAssociation: 'NONE',
                            author       : {login: 'dependabot', __typename: 'Bot'},
                            comments     : {pageInfo: {hasNextPage: false, endCursor: null}, nodes: []},
                            timelineItems: {pageInfo: {hasNextPage: false, endCursor: null}, nodes: []}
                        }
                    ]
                }}}
            }
            if (queryStr.includes('ReconcileComments')) {
                return {node: {comments: {pageInfo: {hasNextPage: false, endCursor: '3'}, nodes: [comment('IC_a3')]}}}
            }
            if (queryStr.includes('ReconcileTimeline')) {
                return {node: {timelineItems: {pageInfo: {hasNextPage: false, endCursor: null}, nodes: [event('RE_a1', 'ReopenedEvent')]}}}
            }
            throw new Error(`unexpected query: ${vars}`)
        }
    };

    const registryActive = {getRegistration: () => ({lifecycleState: 'ACTIVE', registrationEpoch: 2})};

    const makeAdmission = (over = {}) => ({
        getCheckpoint   : () => null,
        listObservations: () => [],
        admitBatch      : function (batch) { this.admitted = batch; return {status: 'accepted', receipt: {receiptId: 'r1'}} },
        ...over
    });

    const runSpec = {sourceInstanceId: 'src-1', owner: 'neomjs', repo: 'neo', batchId: 'batch-1', observedAt: '2026-01-05T00:00:00Z'};

    test('drives every axis to exhaustion and admits a VALID v1 batch', async () => {
        const admissionService = makeAdmission(),
              receipt          = await IssueReconciliationService.reconcile({...runSpec, admissionService, graphqlService, registryService: registryActive}),
              batch            = admissionService.admitted;

        expect(receipt.status).toBe('accepted');
        expect(validateBatch(batch), 'the admitted batch is contract-valid').toEqual({valid: true, errors: []});

        const kind = k => batch.observations.filter(o => o.occurrenceKind === k).length;

        expect(kind('issue.opened'), 'one root per issue').toBe(2);
        expect(kind('issue.comment'), 'all 3 comments across 2 comment pages').toBe(3);
        expect(kind('issue.closed')).toBe(1);
        expect(kind('issue.reopened'), 'timeline overflow walked').toBe(1);
        expect(batch.registrationEpoch, 'epoch carried from registration').toBe(2)
    });

    test('the source-relative trust field flows through end-to-end', async () => {
        const admissionService = makeAdmission();

        await IssueReconciliationService.reconcile({...runSpec, admissionService, graphqlService, registryService: registryActive});

        const roots = admissionService.admitted.observations.filter(o => o.occurrenceKind === 'issue.opened');

        expect(roots.find(o => o.providerEntityId === 'I_a').sourceAssociation).toBe('OWNER');
        expect(roots.find(o => o.providerEntityId === 'I_b').sourceAssociation).toBe('NONE')
    });

    test('an admission CONFLICT is returned, not thrown — the cursor never advances behind a failed receipt', async () => {
        const admissionService = makeAdmission({admitBatch: () => ({status: 'conflict', reason: 'STALE_BASIS'})}),
              receipt          = await IssueReconciliationService.reconcile({...runSpec, admissionService, graphqlService, registryService: registryActive});

        expect(receipt).toEqual({status: 'conflict', reason: 'STALE_BASIS'})
    });

    test('a source that is not ACTIVE is refused before any acquisition', async () => {
        const registryService = {getRegistration: () => ({lifecycleState: 'REVOKED', registrationEpoch: 3})};

        await expect(IssueReconciliationService.reconcile({...runSpec, admissionService: makeAdmission(), graphqlService, registryService}))
            .rejects.toThrow('ISSUE_RECONCILIATION_SOURCE_NOT_ACTIVE')
    });

    test('deterministic assembly — the same base + same provider truth reproduces a digest-identical batch (retry idempotency)', async () => {
        const runOnce = async () => {
            const admissionService = makeAdmission();
            await IssueReconciliationService.reconcile({...runSpec, admissionService, graphqlService, registryService: registryActive});
            return admissionService.admitted
        };

        expect(canonicalBatchDigest(await runOnce()), 'same base + same truth → same digest → admission dedupes').toBe(canonicalBatchDigest(await runOnce()))
    });

    test('RA1 mutation-safe — pass 2 consumes the pass-1 checkpoint and RE-EMITS a new comment on a KNOWN root (no resume-skip)', async () => {
        // A stateful admission that actually persists the checkpoint + observations, so pass 2 reads
        // pass 1's real checkpoint — the vacuous fresh-service-twice shape could never falsify this.
        let   checkpoint = null;
        const admitted   = [],
              statefulAdmission = {
                  getCheckpoint   : () => checkpoint,
                  listObservations: () => admitted,
                  admitBatch(batch) {
                      this.lastBatch = batch;
                      checkpoint = {checkpointVersion: (checkpoint?.checkpointVersion ?? 0) + 1, inventoryHash: batch.nextInventoryHash, providerState: batch.nextProviderState};
                      admitted.push(...batch.observations);
                      return {status: 'accepted', receipt: {receiptId: 'r'}}
                  }
              };

        // A mutable provider that HONORS the after-cursor: the SAME root I1 gains a comment between
        // the two passes, and a request that RESUMES past `END` returns nothing (exactly the real
        // GraphQL behavior). This is what makes the witness falsify the resume-skip: if the service
        // resumed from pass-1's `END` cursor, pass 2 would fetch after `END` → empty → miss C1.
        let   i1Comments = [];
        const issuePage  = comments => ({repository: {issues: {pageInfo: {hasNextPage: false, endCursor: 'END'}, nodes: [
            {id: 'I1', createdAt: '2026-01-01T00:00:00Z', lastEditedAt: null, authorAssociation: 'OWNER', author: {login: 'human', __typename: 'User'},
             comments: {pageInfo: {hasNextPage: false, endCursor: null}, nodes: comments}, timelineItems: {pageInfo: {hasNextPage: false, endCursor: null}, nodes: []}}
        ]}}});
        const mutableGraphql = {
            query: async (queryStr, vars) => queryStr.includes('ReconcileIssues')
                ? (vars.after ? {repository: {issues: {pageInfo: {hasNextPage: false, endCursor: 'END'}, nodes: []}}} : issuePage(i1Comments))
                : {node: {comments: {pageInfo: {hasNextPage: false}, nodes: []}, timelineItems: {pageInfo: {hasNextPage: false}, nodes: []}}}
        };

        const run = () => IssueReconciliationService.reconcile({...runSpec, admissionService: statefulAdmission, graphqlService: mutableGraphql, registryService: registryActive});

        await run(); // pass 1 — I1 opened, no comments
        expect(statefulAdmission.lastBatch.observations.some(o => o.occurrenceKind === 'issue.comment')).toBe(false);

        i1Comments = [{id: 'C1', createdAt: '2026-01-02T00:00:00Z', lastEditedAt: null, authorAssociation: 'CONTRIBUTOR', author: {login: 'replier', __typename: 'User'}}];

        await run(); // pass 2 — consumes the checkpoint, RE-ENUMERATES I1, catches C1
        const pass2 = statefulAdmission.lastBatch;

        expect(pass2.observations.some(o => o.providerEntityId === 'C1' && o.occurrenceKind === 'issue.comment'), 'the new comment on a known root is caught').toBe(true);
        expect(pass2.coverage.complete).toBe(true);
        expect(pass2.coverage.gaps ?? [], 'I1 is still present — no fabricated inventory-access gap').toEqual([]);
        expect(pass2.observations.some(o => o.absence === 'deleted'), 'nothing deleted').toBe(false)
    });

    test('RA3 delete-evidence seam — an evidenced vanish becomes an admitted deletion; an unevidenced vanish stays an inventory gap', async () => {
        const admissionService = makeAdmission({
            listObservations: () => [
                {occurrenceKind: 'issue.opened', providerEntityId: 'I_gone'},
                {occurrenceKind: 'issue.opened', providerEntityId: 'I_hidden'}
            ]
        });
        const emptyGraphql            = {query: async queryStr => queryStr.includes('ReconcileIssues') ? {repository: {issues: {pageInfo: {hasNextPage: false, endCursor: 'E'}, nodes: []}}} : {node: {}}},
              acquireDeletionEvidence = async vanished => vanished.includes('I_gone') ? {I_gone: {tombstoneId: 't-gone', deletedAt: '2026-01-04T00:00:00Z'}} : {};

        await IssueReconciliationService.reconcile({...runSpec, admissionService, graphqlService: emptyGraphql, registryService: registryActive, acquireDeletionEvidence});
        const batch = admissionService.admitted;

        expect(batch.observations.find(o => o.providerEntityId === 'I_gone')?.absence, 'evidenced vanish → admitted deletion').toBe('deleted');
        expect(batch.observations.some(o => o.providerEntityId === 'I_hidden'), 'unevidenced vanish is NOT a deletion').toBe(false);
        expect(batch.coverage.gaps).toEqual(expect.arrayContaining([{axis: 'inventory-access', providerEntityId: 'I_hidden'}]))
    });

    test('AC9 collaborator change — a shifted association reaches the observation, distinguishing the run', async () => {
        const promoted = {
            query: async queryStr => queryStr.includes('ReconcileIssues')
                ? {repository: {issues: {pageInfo: {hasNextPage: false, endCursor: 'E'}, nodes: [
                    {id: 'I_a', createdAt: '2026-01-01T00:00:00Z', lastEditedAt: null, authorAssociation: 'MEMBER', author: {login: 'human', __typename: 'User'}, comments: {pageInfo: {hasNextPage: false}, nodes: []}, timelineItems: {pageInfo: {hasNextPage: false}, nodes: []}}
                ]}}}
                : {node: {}}
        };
        const admissionService = makeAdmission();

        await IssueReconciliationService.reconcile({...runSpec, admissionService, graphqlService: promoted, registryService: registryActive});

        expect(admissionService.admitted.observations.find(o => o.providerEntityId === 'I_a').sourceAssociation, 'the new association is carried, not the old').toBe('MEMBER')
    });

    test('prior inventory that vanishes without evidence degrades coverage — never a deletion', async () => {
        const admissionService = makeAdmission({
            listObservations: () => [{occurrenceKind: 'issue.opened', providerEntityId: 'I_vanished'}]
        });

        await IssueReconciliationService.reconcile({...runSpec, admissionService, graphqlService, registryService: registryActive});

        const batch = admissionService.admitted;

        expect(batch.observations.some(o => o.providerEntityId === 'I_vanished'), 'no fabricated deletion').toBe(false);
        expect(batch.coverage.complete, 'access loss lowers completeness').toBe(false);
        expect(batch.coverage.gaps).toEqual(expect.arrayContaining([{axis: 'inventory-access', providerEntityId: 'I_vanished'}]))
    });
});
