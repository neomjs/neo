import {test, expect} from '@playwright/test';
import {
    countInferenceRequests,
    MIN_INGESTED_TENANTS,
    projectSnapshotForAcceptance,
    validateDeploymentAcceptance
} from '../../../../../../ai/scripts/lifecycle/validateDeploymentAcceptance.mjs';

/**
 * @summary Coverage for the deployment acceptance gate.
 *
 * The load-bearing case is the FIRST one: the gate is fed the actual measured values from the
 * affected plane and must reject **for the right symptom**. A gate nobody has watched go red
 * certifies nothing, and the incident this exists for accumulated nine reasoned-but-unverified
 * mechanisms precisely because no candidate was ever run against that plane first.
 *
 * Two controls stop it degenerating. The healthy case: without it, a gate that always rejects passes
 * the first test and is worthless. And the empty-arrival-window-with-live-in-flight case: without it,
 * the gate charges S1 against a provider that is merely busy — which is the exact misreading it was
 * written after, and it would block a good deploy rather than merely fail to catch a bad one.
 */
test.describe('ai/scripts/lifecycle — deployment acceptance gate', () => {
    // Verbatim from a read-only probe of the affected plane, INCLUDING its in-flight rows.
    //
    // The in-flight rows are the correction. An earlier version of this fixture omitted them and the
    // spec asserted an S1 rejection — but the real plane had three live requests mid-flight, so S1's
    // symptom was NOT present there. The plane exhibits S2 only, and the S1 reading it was originally
    // credited with was an artifact of a log window that opened after those requests arrived.
    const measuredAffectedPlane = {
        provider: {
            cpuPercent     : 400.27,
            cpuLimitPercent: 400,
            // Its own log across a 19-minute window: health polls only, no ARRIVALS.
            logText        : '[GIN] GET "/api/tags"\n[GIN] GET "/api/ps"\n[GIN] HEAD "/"\n[GIN] GET "/api/tags"\n',
            // ...but three requests dispatched BEFORE that window were still running.
            inFlight       : [
                {startedAt: '2026-08-11T19:27:11.098Z', service: 'knowledge-base', operationStage: 'kb-tenant-ingestion-embedding'},
                {startedAt: '2026-08-11T19:27:48.190Z', service: 'memory-core',    operationStage: 'embedding-canary'},
                {startedAt: '2026-08-11T19:32:49.481Z', service: 'knowledge-base', operationStage: 'embedding-canary'}
            ]
        },
        tenantRepos: [
            {identityHash: 'e1daf1ca9706', lastIngestedRev: null, consecutiveFailures: 39},
            {identityHash: '0485923578f7', lastIngestedRev: null, consecutiveFailures: 39}
        ],
        sweepRunning: true,
        sweepPid    : null
    };

    test('REJECTS the measured affected plane for S2 — and NOT for S1, which was never present', () => {
        const {accepted, blockers} = validateDeploymentAcceptance(measuredAffectedPlane);

        expect(accepted, 'a plane whose tenants have never ingested must not be accepted').toBe(false);

        // Asserting the CONTENT, not just the count: a gate that rejects for the wrong reason would
        // pass a bare `toBe(false)` while certifying nothing about either symptom.
        expect(blockers.join(' | ')).toMatch(/S2:.*NEVER ingested/);
        expect(blockers.join(' | ')).toMatch(/running:true with no pid/);

        // The load-bearing negative. Pinned at 400.27% with an empty arrival census, this plane still
        // must NOT be charged with S1, because three requests were genuinely in flight. Asserting the
        // absence is what stops the gate from re-committing the misreading it was built after.
        expect(blockers.join(' | '), 'live in-flight work must exonerate S1').not.toMatch(/S1:/);
    });

    test('ACCEPTS a healthy plane — the non-vacuity control', () => {
        const {accepted, blockers} = validateDeploymentAcceptance({
            provider: {
                cpuPercent     : 12.4,
                cpuLimitPercent: 400,
                logText        : '[GIN] POST "/api/embed"\n[GIN] GET "/api/tags"\n'
            },
            tenantRepos: [
                {identityHash: 'a', lastIngestedRev: 'abc123'},
                {identityHash: 'b', lastIngestedRev: 'def456'}
            ],
            sweepRunning: true,
            sweepPid    : 4711
        });

        expect(blockers, 'a healthy plane must produce no blockers').toEqual([]);
        expect(accepted).toBe(true);
    });

    test('a pinned provider with an EMPTY arrival window but LIVE in-flight work is accepted', () => {
        // @neo-opus-vega caught this gate committing the exact error it was written after: rejecting on
        // an empty arrival census. An arrival log answers "did a request ARRIVE in my window", never
        // "is the provider OCCUPIED" — a long request arrives once then goes silent.
        //
        // Measured on a real plane: three requests dispatched 19:27/19:27/19:32 were still in flight
        // at 19:49, while the log window opened at 19:30. Empty census, busy provider. Rejecting on the
        // census alone would certify the symptom PRESENT on a working plane and block a good deploy.
        const {accepted, blockers} = validateDeploymentAcceptance({
            provider: {
                cpuPercent     : 399.5,
                cpuLimitPercent: 400,
                logText        : '[GIN] GET "/api/tags"\n[GIN] GET "/api/ps"\n',   // zero arrivals
                inFlight       : [
                    {startedAt: '2026-08-11T19:27:11.098Z', service: 'knowledge-base'},
                    {startedAt: '2026-08-11T19:27:48.190Z', service: 'memory-core'},
                    {startedAt: '2026-08-11T19:32:49.481Z', service: 'knowledge-base'}
                ]
            },
            tenantRepos : [{lastIngestedRev: 'a'}, {lastIngestedRev: 'b'}],
            sweepRunning: false,
            sweepPid    : null
        });

        expect(blockers.join(' | '), 'in-flight work must exonerate an empty arrival census').not.toMatch(/S1:/);
        expect(accepted).toBe(true);
    });

    test('pinned with an empty window AND nothing in flight is still the symptom', () => {
        // The discriminator must stay able to fire, or the fix above would have disabled S1 entirely.
        const {accepted, blockers} = validateDeploymentAcceptance({
            provider: {
                cpuPercent     : 400.27,
                cpuLimitPercent: 400,
                logText        : '[GIN] GET "/api/tags"\n',
                inFlight       : []
            },
            tenantRepos : [{lastIngestedRev: 'a'}, {lastIngestedRev: 'b'}],
            sweepRunning: false,
            sweepPid    : null
        });

        expect(accepted).toBe(false);
        expect(blockers.join(' | ')).toMatch(/ZERO in-flight rows/);
    });

    test('a BUSY provider at the ceiling is accepted when inference is actually arriving', () => {
        // The discriminator that keeps this gate honest. A cgroup-capped container reports the same
        // number busy or wedged, so pinning alone must never reject — otherwise the gate blocks every
        // deploy during a legitimate ingestion run, which is worse than not gating at all.
        const {accepted} = validateDeploymentAcceptance({
            provider: {
                cpuPercent     : 399.8,
                cpuLimitPercent: 400,
                logText        : '[GIN] POST "/api/embed"\n[GIN] POST "/api/embed"\n',
                inFlight       : []
            },
            tenantRepos: [
                {identityHash: 'a', lastIngestedRev: 'abc123'},
                {identityHash: 'b', lastIngestedRev: 'def456'}
            ],
            sweepRunning: false,
            sweepPid    : null
        });

        expect(accepted, 'pinned + serving is busy, not wedged').toBe(true);
    });

    test('fails CLOSED on every unmeasured input rather than certifying', () => {
        const {accepted, blockers} = validateDeploymentAcceptance({});

        expect(accepted).toBe(false);
        expect(blockers.join(' | ')).toMatch(/provider facts were not fetched/);
        expect(blockers.join(' | ')).toMatch(/tenant repo rows were not fetched/);

        // The third input group. @neo-opus-vega caught this arm's name promising more than it asserted:
        // it covered two of three groups while the sweep facts failed OPEN, so a gate advertising a
        // fail-closed contract had a hole with two guards in front of it.
        expect(blockers.join(' | ')).toMatch(/sync task state was not fetched/);

        // And `false` must stay a real measurement — an idle sweep is not an unfetched one. Without
        // this, closing the fail-open would have blocked every plane whose sweep is simply not running.
        expect(validateDeploymentAcceptance({
            provider    : {cpuPercent: 10, cpuLimitPercent: 400, logText: '[GIN] POST "/api/embed"', inFlight: []},
            tenantRepos : [{lastIngestedRev: 'a'}, {lastIngestedRev: 'b'}],
            sweepRunning: false,
            sweepPid    : null
        }).accepted, 'an idle sweep is measured, not missing').toBe(true);

        // Pinned with an unfetched log is the trap: the only fact that could exonerate the provider is
        // the missing one, so it must reject rather than pass on absence.
        expect(validateDeploymentAcceptance({
            provider   : {cpuPercent: 400, cpuLimitPercent: 400},
            tenantRepos: [{lastIngestedRev: 'a'}, {lastIngestedRev: 'b'}]
        }).blockers.join(' | ')).toMatch(/request log or in-flight rows were not fetched/);
    });

    test('a NULL request log is never read as zero inference', () => {
        // "Not measured" and "measured as none" are different facts, and conflating them is how an
        // absent instrument gets read as a finding about the world.
        expect(countInferenceRequests(null)).toBeNull();
        expect(countInferenceRequests('')).toBeNull();
        expect(countInferenceRequests('[GIN] GET "/api/tags"')).toBe(0);
        expect(countInferenceRequests('[GIN] POST "/api/embed"\n[GIN] POST "/api/chat"')).toBe(2);
    });

    test('the snapshot projector maps every field the gate depends on', () => {
        // The mapping is the part schema drift breaks silently: a renamed field yields `undefined`,
        // which the gate correctly treats as unfetched and fails closed on — so drift shows up as a
        // permanently-red gate rather than a wrong verdict. Pinning it here makes the break loud.
        const projected = projectSnapshotForAcceptance({
            services: [
                {serviceKey: 'chroma', stats: {cpuPercent: 1}},
                {
                    serviceKey      : 'local-model',
                    stats           : {cpuPercent: 400.27},
                    logs            : {text: '[GIN] GET "/api/tags"'},
                    providerActivity: {inFlight: [{startedAt: '2026-08-11T19:27:11.098Z'}]}
                }
            ],
            tenantRepoSync: {
                task: {running: true, pid: null, lastCompletion: {repos: [{lastIngestedRev: null}]}}
            }
        });

        expect(projected.provider.cpuPercent).toBe(400.27);
        expect(projected.provider.logText).toBe('[GIN] GET "/api/tags"');
        expect(projected.provider.inFlight).toHaveLength(1);
        expect(projected.tenantRepos).toHaveLength(1);
        expect(projected.sweepRunning).toBe(true);
        expect(projected.sweepPid).toBeNull();

        // `logs` was a bare string on older schemas. Accepting both matters because guessing wrong
        // turns an unfetched log into an empty one — the difference between failing closed and
        // certifying the symptom on a plane that is merely busy.
        expect(projectSnapshotForAcceptance({
            services: [{serviceKey: 'local-model', logs: 'raw string form'}]
        }).provider.logText).toBe('raw string form');

        // A provider service that is absent must not project as a present-but-idle one.
        expect(projectSnapshotForAcceptance({services: []}).provider).toBeUndefined();
    });

    test('one ingested tenant is not multi-tenant', () => {
        // The symptom is multi-TENANT ingestion. A single working repo has satisfied every partial
        // fix attempted so far, so the threshold must be explicit rather than "at least one".
        expect(MIN_INGESTED_TENANTS).toBeGreaterThan(1);

        const {accepted, blockers} = validateDeploymentAcceptance({
            provider   : {cpuPercent: 10, cpuLimitPercent: 400, logText: '[GIN] POST "/api/embed"'},
            tenantRepos: [
                {identityHash: 'a', lastIngestedRev: 'abc123'},
                {identityHash: 'b', lastIngestedRev: null}
            ],
            sweepRunning: false,
            sweepPid    : null
        });

        expect(accepted).toBe(false);
        expect(blockers.join(' | ')).toMatch(/only 1 of 2 tenant repos/);
    });
});
