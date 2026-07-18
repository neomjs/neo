import {expect, test} from '@playwright/test';
import {
    REPORT_SCHEMA_VERSION,
    assertShadowFirewall,
    formatHumanSummary,
    measurement,
    normalizeActorKind,
    parseArgs,
    runShadowProbe
} from '../../../../../../ai/scripts/maintenance/communityActivityShadowProbeCore.mjs';

const OPTIONS = {
    owner      : 'neomjs',
    pageSize   : 100,
    repo       : 'neo',
    runs       : 2,
    windowEnd  : '2026-07-18T00:00:00.000Z',
    windowStart: '2026-06-18T00:00:00.000Z'
};

const EXTERNAL = {login: 'outside-contributor', type: 'User'};
const PEER     = {login: 'neo-gpt', type: 'User'};
const BOT      = {login: 'dependabot[bot]', type: 'Bot'};

function classifyTrust(login, {collaborators=[]}={}) {
    if (login === 'neo-gpt') return 'peer-trusted';
    if (collaborators.includes(login)) return 'repo-trusted';
    return login ? 'external' : 'unclassified';
}

function page(resourceKind, rows, overrides={}) {
    return {
        apiSurface         : 'graphql',
        hasNextPage        : false,
        latencyMs          : 7,
        pageOrdinal        : 1,
        providerCost       : 1,
        resourceKind,
        responseFingerprint: `receipt-${resourceKind}-${rows.length}`,
        rows,
        ...overrides
    };
}

function baseSnapshot({extraRows=[], popularityRows=[], collaboratorStatus='complete', gaps=[]}={}) {
    return {
        collaboratorCensus: {
            collaborators: collaboratorStatus === 'complete' ? ['repo-writer'] : [],
            gaps         : collaboratorStatus === 'complete' ? [] : [{reasonCode: 'collaborator-permission-denied'}],
            status       : collaboratorStatus
        },
        completedAt: '2026-07-18T00:01:00.000Z',
        families   : {
            discussions: {
                exhausted: true,
                gaps     : [],
                pages    : [page('discussion-comments', [
                    {
                        actor          : EXTERNAL,
                        createdAt      : '2026-07-04T10:00:00Z',
                        eventType      : 'discussion-comment',
                        id             : 'dc-1',
                        mutationKind   : 'create',
                        responseBearing: true
                    },
                    {
                        actor            : EXTERNAL,
                        deletedAt        : '2026-07-05T10:00:00Z',
                        eventType        : 'discussion-reply',
                        explicitTombstone: true,
                        id               : 'dr-1',
                        mutationKind     : 'tombstone',
                        responseBearing  : false
                    }
                ])]
            },
            issues: {
                exhausted: true,
                gaps,
                pages    : [page('issues', [
                    {
                        actor          : EXTERNAL,
                        createdAt      : '2026-07-01T10:00:00Z',
                        eventType      : 'issue-root',
                        id             : 'issue-1',
                        mutationKind   : 'create',
                        responseBearing: true
                    },
                    {
                        actor          : EXTERNAL,
                        createdAt      : '2026-07-01T10:00:00Z',
                        eventType      : 'issue-root',
                        id             : 'issue-1',
                        mutationKind   : 'create',
                        responseBearing: true
                    },
                    {
                        actor          : BOT,
                        eventType      : 'issue-comment',
                        id             : 'ic-1',
                        mutationKind   : 'revision',
                        responseBearing: true,
                        updatedAt      : '2026-07-02T10:00:00Z'
                    },
                    ...popularityRows,
                    ...extraRows
                ])]
            },
            pullRequests: {
                exhausted: true,
                gaps     : [],
                pages    : [page('pull-request-reviews', [
                    {
                        actor          : PEER,
                        createdAt      : '2026-07-03T10:00:00Z',
                        eventType      : 'pull-request-root',
                        id             : 'pr-1',
                        mutationKind   : 'create',
                        responseBearing: true
                    },
                    {
                        actor          : {login: 'repo-writer', type: 'User'},
                        createdAt      : '2026-07-03T11:00:00Z',
                        eventType      : 'pull-request-review',
                        id             : 'review-1',
                        mutationKind   : 'create',
                        responseBearing: true
                    }
                ])]
            }
        },
        startedAt: '2026-07-18T00:00:00.000Z'
    };
}

function makeClock() {
    const times = [
        '2026-07-18T00:00:00.000Z',
        '2026-07-18T00:02:00.000Z',
        '2026-07-18T00:04:00.000Z',
        '2026-07-18T00:05:00.000Z'
    ];

    return () => times.shift() || '2026-07-18T00:05:00.000Z';
}

async function runWithSnapshots(snapshots) {
    let index = 0;

    return runShadowProbe(OPTIONS, {
        classifyTrust,
        now   : makeClock(),
        reader: async () => structuredClone(snapshots[Math.min(index++, snapshots.length - 1)])
    });
}

test.describe('communityActivityShadowProbeCore — explicit coordinates', () => {
    test('parseArgs emits reproducible half-open coordinates and requires two runs', () => {
        const help = parseArgs(['--help']);

        expect(help.helpText).toContain('Read-only GitHub community-activity shadow measurement');
        expect(help.helpText).toContain('--window-start <iso>');
        expect(help.helpText).toContain('--runs <count>');

        const parsed = parseArgs([
            '--owner', 'neomjs',
            '--repo', 'neo',
            '--window-start', '2026-06-18T00:00:00Z',
            '--window-end', '2026-07-18T00:00:00Z',
            '--page-size', '50',
            '--runs', '3',
            '--output', '.neo-ai-data/custom.json'
        ]);

        expect(parsed).toMatchObject({owner: 'neomjs', repo: 'neo', pageSize: 50, runs: 3});
        expect(parsed.windowStart).toBe('2026-06-18T00:00:00.000Z');
        expect(parsed.windowEnd).toBe('2026-07-18T00:00:00.000Z');
        expect(() => parseArgs([
            '--owner', 'neomjs', '--repo', 'neo',
            '--window-start', '2026-07-18T00:00:00Z',
            '--window-end', '2026-06-18T00:00:00Z'
        ])).toThrow('half-open');
        expect(() => parseArgs([
            '--owner', 'neomjs', '--repo', 'neo',
            '--window-start', '2026-06-18T00:00:00Z',
            '--window-end', '2026-07-18T00:00:00Z',
            '--runs', '1'
        ])).toThrow('>= 2');
    });

    test('normalizes provider actor kinds without treating them as trust', () => {
        expect(['User', 'Bot', 'Organization', 'Mannequin', 'EnterpriseUser', null].map(normalizeActorKind))
            .toEqual(['user', 'bot', 'organization', 'mannequin', 'enterpriseUser', 'unknown']);
    });

    test('unknown measurements are explicit and zero denominators never become zero ratios', async () => {
        expect(measurement('unknown', null, 'ratio', {reasonCode: 'not-observed'})).toEqual({
            denominator: null,
            numerator  : null,
            reasonCode : 'not-observed',
            status     : 'unknown',
            unit       : 'ratio',
            value      : null
        });

        const {report}    = await runWithSnapshots([baseSnapshot(), baseSnapshot()]);
        const emptyFamily = report.families.find(item => item.family === 'issues');
        expect(emptyFamily.rates.updateRate.denominator).toBeGreaterThan(0);
        expect(report.futureMetricSlots.timeToRespondMs.status).toBe('unknown');
    });
});

test.describe('communityActivityShadowProbeCore — report contract', () => {
    test('emits all three families, separate actor/trust cohorts, mutation evidence, and a human summary', async () => {
        const {exitCode, report} = await runWithSnapshots([baseSnapshot(), baseSnapshot()]);

        expect(exitCode).toBe(0);
        expect(report.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
        expect(report.families.map(item => item.family)).toEqual(['issues', 'pullRequests', 'discussions']);
        expect(report.families.find(item => item.family === 'issues')).toMatchObject({
            acquisition     : {exhausted: true, pages: 1, rawRows: 3},
            mutationEvidence: {createRows: 1, revisionRows: 1},
            observations    : {candidateRows: 2, duplicateRows: 1}
        });

        const pullRequests = report.families.find(item => item.family === 'pullRequests');
        expect(pullRequests.classifications.actorKinds.user).toBe(2);
        expect(pullRequests.classifications.trustTiers['peer-trusted']).toBe(1);
        expect(pullRequests.classifications.trustTiers['repo-trusted']).toBe(1);
        expect(pullRequests.attention.eligibleRows).toBe(0);
        expect(report.families.find(item => item.family === 'discussions').mutationEvidence.explicitTombstoneRows).toBe(1);
        expect(report.summary.text).toContain('LOWER BOUND');
        expect(formatHumanSummary(report)).toContain('no thresholds authorized');
    });

    test('counts provider entities independently from their occurrence rows', async () => {
        const shared = {
            actor           : EXTERNAL,
            eventType       : 'issue-comment',
            providerEntityId: 'provider-comment-1',
            responseBearing : true
        };
        const snapshot = baseSnapshot({extraRows: [
            {...shared, activityAt: '2026-07-10T10:00:00Z', id: 'provider-comment-1:created', mutationKind: 'create'},
            {...shared, activityAt: '2026-07-11T10:00:00Z', id: 'provider-comment-1:updated', mutationKind: 'revision'}
        ]});
        const {report} = await runWithSnapshots([snapshot, snapshot]);
        const issues   = report.families.find(item => item.family === 'issues');

        expect(issues.observations.candidateRows).toBe(4);
        expect(issues.observations.uniqueEntities).toBe(3);
    });

    test('keeps clean exhausted acquisition lower-bound without calling it degraded', async () => {
        const snapshot = baseSnapshot({gaps: [{code: 'historical_revisions_unavailable', scope: 'issue-comments'}]});
        const {report} = await runWithSnapshots([snapshot, snapshot]);

        expect(report.coverage).toMatchObject({
            degraded               : false,
            exhausted              : true,
            globalCompletenessClaim: false,
            lowerBound             : true,
            unseenHistoryPossible  : true
        });
        expect(report.coverage.lowerBoundReasons).toContain('historical_revisions_unavailable');
    });

    test('degraded collaborator authority fails external attention closed and names the gap', async () => {
        const snapshot = baseSnapshot({collaboratorStatus: 'degraded'});
        const {report} = await runWithSnapshots([snapshot, snapshot]);

        expect(report.coverage.degraded).toBe(true);
        expect(report.coverage.gaps).toContainEqual({family: 'collaborators', reasonCode: 'collaborator-permission-denied'});
        expect(report.totals.attentionEligibleRows).toBe(0);
        expect(report.families.find(item => item.family === 'issues').classifications.trustTiers.unclassified).toBe(2);
    });

    test('records two real reader calls, stable query-plan identity, and exact variance without a tolerance', async () => {
        const second = baseSnapshot({extraRows: [{
            actor          : EXTERNAL,
            createdAt      : '2026-07-10T10:00:00Z',
            eventType      : 'issue-comment',
            id             : 'ic-new',
            mutationKind   : 'create',
            responseBearing: true
        }]});
        const {report} = await runWithSnapshots([baseSnapshot(), second]);

        expect(report.repeatability.evidenceStatus).toBe('two-run');
        expect(report.repeatability.comparable).toBe(true);
        expect(report.repeatability.runs).toHaveLength(2);
        expect(report.repeatability.runs[0].queryPlanHash).toBe(report.repeatability.runs[1].queryPlanHash);
        expect(report.repeatability.runs[0].sourceManifestHash).not.toBe(report.repeatability.runs[1].sourceManifestHash);
        expect(report.repeatability.variance.candidateRows).toBe(1);
        expect(report.policy.thresholds.paginationCap).toBeNull();
        expect(report.policy).not.toHaveProperty('varianceTolerance');
    });

    test('treats provider row-order jitter as the same candidate inventory', async () => {
        const first  = baseSnapshot();
        const second = structuredClone(first);

        for (const family of Object.values(second.families)) {
            for (const receipt of family.pages) {
                receipt.rows.reverse();
            }
        }

        const {report}     = await runWithSnapshots([first, second]);
        const [run1, run2] = report.repeatability.runs;

        expect(run1.candidateManifestHash).toBe(run2.candidateManifestHash);
        expect(report.repeatability.variance.candidateRows).toBe(0);
        expect(report.repeatability.variance.projectedMetadataBytes).toBe(0);
    });

    test('popularity telemetry changes raw receipts only, never candidates, storage, counts, wakes, or candidate identity', async () => {
        const baseline   = await runWithSnapshots([baseSnapshot(), baseSnapshot()]);
        const popularity = {actor: EXTERNAL, eventType: 'repository-star', id: 'star-1', mutationKind: 'create', responseBearing: false};
        const noisy      = await runWithSnapshots([
            baseSnapshot({popularityRows: [popularity]}),
            baseSnapshot({popularityRows: [popularity]})
        ]);

        expect(noisy.report.excludedTelemetry.rows).toBe(1);
        expect(noisy.report.totals.candidateRows).toBe(baseline.report.totals.candidateRows);
        expect(noisy.report.totals.projectedMetadataBytes).toBe(baseline.report.totals.projectedMetadataBytes);
        expect(noisy.report.totals.attentionEligibleRows).toBe(baseline.report.totals.attentionEligibleRows);
        expect(noisy.report.sourceManifest.candidateManifestHash).toBe(baseline.report.sourceManifest.candidateManifestHash);

        const noisyIssues = noisy.report.families.find(item => item.family === 'issues');
        const baseIssues  = baseline.report.families.find(item => item.family === 'issues');
        expect(noisyIssues.projectionInputs).toEqual(baseIssues.projectionInputs);
    });

    test('the authority firewall exposes zero production mutations and rejects policy smuggling', async () => {
        const {report} = await runWithSnapshots([baseSnapshot(), baseSnapshot()]);

        expect(report.authority).toEqual({
            mode               : 'shadow',
            notAuthority       : true,
            permittedWrites    : {reportFiles: 1},
            productionMutations: {
                admittedEvents     : 0,
                advancedCheckpoints: 0,
                createdTasks       : 0,
                deliveredWakes     : 0,
                projectedCounts    : 0
            }
        });
        expect(Object.values(report.policy.thresholds).every(value => value === null)).toBe(true);

        const tampered = structuredClone(report);
        tampered.policy.thresholds.wakeThreshold = 1;
        expect(() => assertShadowFirewall(tampered)).toThrow('cannot introduce policy');
    });
});
