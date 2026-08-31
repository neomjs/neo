import {test, expect} from '@playwright/test';

import {
    ALARM_MARKER,
    ALARM_TITLE_PREFIX,
    buildAlarmBody,
    buildAlarmTitle,
    buildBreachComment,
    buildRecoveryComment,
    computeStreak,
    evaluateBreach,
    isRecovered,
    buildRunsQuery,
    latestCommitDate,
    parseBranchName,
    parseFacetNames,
    parseThreshold,
    selectAlarmIssue
} from '../../../../buildScripts/dataSyncWatchdog.mjs';

const
    NOW = new Date('2026-07-26T12:00:00Z'),
    run = (conclusion, created_at, id=1) => ({conclusion, created_at, html_url: `https://example.test/runs/${id}`, id});

/**
 * Threshold-logic witnesses for the Data Sync staleness watchdog: streak reduction,
 * breach boundaries (consecutive-failures `>=`, success-age strictly-past), recovery shape,
 * standing-issue selection by body marker, and the alarm body's self-describing contract.
 * API-touching glue is deliberately thin and exercised via the workflow's dispatch dry run.
 */
test.describe('dataSyncWatchdog (#15948)', () => {
    test('computeStreak: all-success history reports zero failures and the latest success', () => {
        const {consecutiveFailures, lastSuccess, latest} = computeStreak({
            runs: [run('success', '2026-07-26T11:00:00Z', 3), run('success', '2026-07-26T10:00:00Z', 2)]
        });

        expect(consecutiveFailures).toBe(0);
        expect(latest.conclusion).toBe('success');
        expect(lastSuccess.created_at).toBe('2026-07-26T11:00:00Z')
    });

    test('computeStreak: counts only the newest failure run, stopping at the first success', () => {
        const {consecutiveFailures, lastSuccess} = computeStreak({
            runs: [
                run('failure', '2026-07-26T11:00:00Z', 5),
                run('failure', '2026-07-26T10:00:00Z', 4),
                run('failure', '2026-07-26T09:00:00Z', 3),
                run('success', '2026-07-26T08:00:00Z', 2),
                run('failure', '2026-07-26T07:00:00Z', 1)
            ]
        });

        expect(consecutiveFailures).toBe(3);
        expect(lastSuccess.id).toBe(2)
    });

    test('computeStreak: no visible success yields null (the outage-episode shape)', () => {
        const {consecutiveFailures, lastSuccess} = computeStreak({
            runs: [run('failure', '2026-07-26T11:00:00Z'), run('failure', '2026-07-26T10:00:00Z')]
        });

        expect(consecutiveFailures).toBe(2);
        expect(lastSuccess).toBe(null)
    });

    test('evaluateBreach: below both thresholds is healthy', () => {
        const {breached, reasons} = evaluateBreach({
            consecutiveFailures   : 2,
            lastSuccessAt         : '2026-07-26T11:30:00Z',
            now                   : NOW,
            maxConsecutiveFailures: 3,
            maxSuccessAgeHours    : 24
        });

        expect(breached).toBe(false);
        expect(reasons).toEqual([])
    });

    test('evaluateBreach: exactly-at-threshold consecutive failures breaches (`>=` boundary)', () => {
        const {breached, reasons} = evaluateBreach({
            consecutiveFailures   : 3,
            lastSuccessAt         : '2026-07-26T11:30:00Z',
            now                   : NOW,
            maxConsecutiveFailures: 3,
            maxSuccessAgeHours    : 24
        });

        expect(breached).toBe(true);
        expect(reasons[0]).toContain('3 consecutive failures')
    });

    test('evaluateBreach: success age breaches strictly PAST the limit (24h00m is not a breach)', () => {
        const healthy = evaluateBreach({
            consecutiveFailures   : 1,
            lastSuccessAt         : '2026-07-25T12:00:00Z', // exactly 24h
            now                   : NOW,
            maxConsecutiveFailures: 3,
            maxSuccessAgeHours    : 24
        });
        const stale = evaluateBreach({
            consecutiveFailures   : 1,
            lastSuccessAt         : '2026-07-25T11:00:00Z', // 25h
            now                   : NOW,
            maxConsecutiveFailures: 3,
            maxSuccessAgeHours    : 24
        });

        expect(healthy.breached).toBe(false);
        expect(stale.breached).toBe(true);
        expect(stale.reasons[0]).toContain('25.0h old')
    });

    test('evaluateBreach: no visible success is itself a breach reason (the 8-day episode class)', () => {
        const {breached, reasons} = evaluateBreach({
            consecutiveFailures   : 2,
            lastSuccessAt         : null,
            now                   : NOW,
            maxConsecutiveFailures: 3,
            maxSuccessAgeHours    : 24
        });

        expect(breached).toBe(true);
        expect(reasons[0]).toContain('no successful run visible')
    });

    test('isRecovered: success with no active breach; a breach on ANY axis blocks recovery', () => {
        expect(isRecovered({latestConclusion: 'success', breached: false})).toBe(true);
        expect(isRecovered({latestConclusion: 'success', breached: true})).toBe(false); // certified-silence guard, in-contract
        expect(isRecovered({latestConclusion: 'failure', breached: false})).toBe(false);
        expect(isRecovered({latestConclusion: null, breached: false})).toBe(false)
    });

    test('parseThreshold: absent falls back; valid strings parse; unparseable or non-positive fails LOUD', () => {
        expect(parseThreshold({name: 'X', raw: undefined, fallback: 48})).toBe(48);
        expect(parseThreshold({name: 'X', raw: '', fallback: 48})).toBe(48);
        expect(parseThreshold({name: 'X', raw: '12', fallback: 48})).toBe(12);
        // a silence-detector must never silently substitute a threshold nobody chose
        expect(() => parseThreshold({name: 'X', raw: 'fourty', fallback: 48})).toThrow(/positive number/);
        expect(() => parseThreshold({name: 'X', raw: '0', fallback: 48})).toThrow(/positive number/);
        expect(() => parseThreshold({name: 'X', raw: '-5', fallback: 48})).toThrow(/positive number/)
    });

    test('parseFacetNames: absent falls back; a comma/whitespace-only value fails LOUD (never a silent off-switch for the axis)', () => {
        expect(parseFacetNames({name: 'X', raw: undefined, fallback: ['issues']})).toEqual(['issues']);
        expect(parseFacetNames({name: 'X', raw: '', fallback: ['issues']})).toEqual(['issues']);
        expect(parseFacetNames({name: 'X', raw: 'issues,pulls', fallback: []})).toEqual(['issues', 'pulls']);
        expect(parseFacetNames({name: 'X', raw: ' issues , pulls ', fallback: []})).toEqual(['issues', 'pulls']);

        // The reachable defect: an unset-vars composition (`${{ vars.A }},${{ vars.B }}`)
        // renders a comma-only value, which must never silently empty the corpus axis.
        expect(() => parseFacetNames({name: 'X', raw: ' ', fallback: ['issues']})).toThrow(/zero facets/);
        expect(() => parseFacetNames({name: 'X', raw: ',', fallback: ['issues']})).toThrow(/zero facets/);
        expect(() => parseFacetNames({name: 'X', raw: ',,', fallback: ['issues']})).toThrow(/zero facets/)
    });

    test('buildRunsQuery is branch-SCOPED, and refuses to build an unscoped query (#15994)', () => {
        const q = buildRunsQuery({repository: 'neomjs/neo', workflow: 'data-sync-pipeline.yml', branch: 'dev'});

        expect(q).toContain('branch=dev');
        expect(q).toContain('/repos/neomjs/neo/actions/workflows/data-sync-pipeline.yml/runs?');

        // The defect this closes: an unscoped query. There is deliberately no branch default,
        // so omission cannot silently reintroduce the all-branches form.
        expect(() => buildRunsQuery({repository: 'neomjs/neo', workflow: 'w.yml'})).toThrow(/branch is required/);
        expect(() => buildRunsQuery({repository: 'neomjs/neo', workflow: 'w.yml', branch: '   '})).toThrow(/branch is required/);

        // A branch needing encoding stays a single query parameter.
        expect(buildRunsQuery({repository: 'r/n', workflow: 'w.yml', branch: 'feature/a b'}))
            .toContain('branch=feature%2Fa%20b');
    });

    test('parseBranchName falls back when absent, fails LOUD on whitespace-only (#15994)', () => {
        expect(parseBranchName({name: 'X', raw: undefined, fallback: 'dev'})).toBe('dev');
        expect(parseBranchName({name: 'X', raw: '', fallback: 'dev'})).toBe('dev');
        expect(parseBranchName({name: 'X', raw: ' main ', fallback: 'dev'})).toBe('main');

        // A silently-empty override would drop the filter and widen the axis back to EVERY branch.
        expect(() => parseBranchName({name: 'X', raw: '   ', fallback: 'dev'})).toThrow(/empty branch/);
    });

    test('computeStreak truncates on ANY success — which is why the query must be branch-scoped (#15994)', () => {
        // The exact live shape on 2026-07-26: four dev failures, then a FEATURE-BRANCH success
        // sitting among them. Unscoped, computeStreak stops there and reports 4 while dev was
        // ~98 deep, and hands lastSuccess a run from a branch nobody deploys.
        const mixed = [
            {conclusion: 'failure', head_branch: 'dev',                             created_at: '2026-07-26T12:08:22Z'},
            {conclusion: 'failure', head_branch: 'dev',                             created_at: '2026-07-26T10:06:00Z'},
            {conclusion: 'failure', head_branch: 'dev',                             created_at: '2026-07-26T07:39:00Z'},
            {conclusion: 'failure', head_branch: 'dev',                             created_at: '2026-07-26T04:31:00Z'},
            {conclusion: 'success', head_branch: 'agent/15744-data-sync-app-identity', created_at: '2026-07-26T00:17:01Z'},
            {conclusion: 'failure', head_branch: 'dev',                             created_at: '2026-07-26T00:04:00Z'}
        ];

        const polluted = computeStreak({runs: mixed});

        expect(polluted.consecutiveFailures).toBe(4);
        expect(polluted.lastSuccess.head_branch).not.toBe('dev');

        // Branch-scoped, the same reducer sees the truth: the feature-branch row is never in the list.
        const scoped = computeStreak({runs: mixed.filter(run => run.head_branch === 'dev')});

        expect(scoped.consecutiveFailures).toBe(5);
        expect(scoped.lastSuccess).toBe(null)
    });

    test('every branch label in the alarm body follows WATCHDOG_BRANCH, never a literal (#15994)', () => {
        const body = buildAlarmBody({
            consecutiveFailures: 4,
            lastSuccess        : run('success', '2026-07-26T00:17:01Z'),
            latestFailure      : null,
            reasons            : ['corpus facet `pulls` is 214.8h old (threshold 48h)'],
            corpusFacets       : [{facet: 'pulls', lastCommitAt: '2026-07-17T05:13:29Z', ageHours: 214.8, stale: true}],
            branch             : 'release/13.2'
        });

        // Streak line, corpus header AND the table column all name the measured branch. A literal
        // `dev` in any of them is a false statement the moment the branch is overridden.
        expect(body).toContain('consecutive failures on `release/13.2`');
        expect(body).toContain('**Corpus facets** (committed `release/13.2`');
        expect(body).toContain('| facet | last commit on `release/13.2` | age | status |');
        expect(body).not.toContain('`dev`');

        // Omitted branch still renders the default truthfully rather than "undefined".
        const defaulted = buildAlarmBody({
            consecutiveFailures: 1,
            lastSuccess        : run('success', '2026-07-26T00:17:01Z'),
            latestFailure      : null,
            reasons            : ['x'],
            corpusFacets       : [{facet: 'pulls', lastCommitAt: '2026-07-17T05:13:29Z', ageHours: 214.8, stale: true}]
        });

        expect(defaulted).toContain('committed `dev`');
        expect(defaulted).not.toContain('undefined')
    });

    test('selectAlarmIssue: body marker wins over title, PRs are excluded, marker beats prefix', () => {
        const marked   = {number: 10, title: 'renamed alarm', body: `x ${ALARM_MARKER} y`},
              prefixed = {number: 11, title: `${ALARM_TITLE_PREFIX} legacy`, body: 'no marker'},
              pr       = {number: 12, title: `${ALARM_TITLE_PREFIX} a PR`, body: ALARM_MARKER, pull_request: {}};

        expect(selectAlarmIssue([marked])).toEqual(marked);
        expect(selectAlarmIssue([prefixed])).toEqual(prefixed); // legacy fallback
        expect(selectAlarmIssue([pr])).toBe(null);
        expect(selectAlarmIssue([prefixed, marked])).toEqual(marked);
        expect(selectAlarmIssue([])).toBe(null)
    });

    test('buildAlarmBody: carries the idempotency marker, the streak facts, and no magic close keywords', () => {
        const body = buildAlarmBody({
            consecutiveFailures: 7,
            lastSuccess        : run('success', '2026-07-17T03:20:56Z', 99),
            latestFailure      : run('failure', '2026-07-25T22:03:27Z', 100),
            reasons            : ['7 consecutive failures (threshold 3)']
        });

        expect(body).toContain(ALARM_MARKER);
        expect(body).toContain('7 consecutive failures');
        expect(body).toContain('2026-07-17T03:20:56Z');
        expect(body).toContain('run 100');
        // an alarm issue must never auto-close anything by keyword
        expect(body).not.toMatch(/\b(Resolves|Closes|Fixes) #\d+/)
    });

    test('buildAlarmTitle: names the streak and the last-success date; the forced zero-streak case reads honestly', () => {
        expect(buildAlarmTitle({consecutiveFailures: 5, lastSuccess: run('success', '2026-07-17T03:20:56Z')}))
            .toBe(`${ALARM_TITLE_PREFIX} Data Sync Pipeline: 5 consecutive failures since 2026-07-17T03:20:56Z`);
        expect(buildAlarmTitle({consecutiveFailures: 30, lastSuccess: null}))
            .toContain('no recent success');
        expect(buildAlarmTitle({consecutiveFailures: 0, lastSuccess: run('success', '2026-07-26T00:17:01Z'), forced: true}))
            .toContain('forced breach evaluation')
    });

    test('buildBreachComment / buildRecoveryComment: carry the run links and the closing contract', () => {
        expect(buildBreachComment({consecutiveFailures: 4, latestFailure: run('failure', 'x', 42)}))
            .toContain('run 42');
        const recovery = buildRecoveryComment({recoveringRun: run('success', 'y', 43), consecutiveFailures: 4});

        expect(recovery).toContain('run 43');
        expect(recovery).toContain('after 4 consecutive failures');
        expect(recovery).toContain('re-opens on the next breach episode')
    });

    test('evaluateBreach: corpus axis — fresh, strict 48h boundary, stale, and missing-commit cases', () => {
        const base = {
            consecutiveFailures   : 0,
            lastSuccessAt         : '2026-07-26T11:30:00Z',
            now                   : NOW,
            maxConsecutiveFailures: 3,
            maxSuccessAgeHours    : 24,
            maxCorpusAgeHours     : 48
        };

        expect(evaluateBreach({...base, corpusLastCommitAt: '2026-07-25T12:30:00Z'}).breached).toBe(false); // 47.5h
        expect(evaluateBreach({...base, corpusLastCommitAt: '2026-07-24T12:00:00Z'}).breached).toBe(false); // exactly 48h
        const stale = evaluateBreach({...base, corpusLastCommitAt: '2026-07-17T07:13:29Z'});

        expect(stale.breached).toBe(true);
        expect(stale.reasons[0]).toContain('resources/content');
        expect(stale.reasons[0]).toContain('48h');

        const missing = evaluateBreach({...base, corpusLastCommitAt: null});

        expect(missing.breached).toBe(true);
        expect(missing.reasons[0]).toContain('no `resources/content/**` commit visible')
    });

    test('evaluateBreach: a green run axis does NOT mask a stale corpus (the certified-silence case)', () => {
        const {breached, reasons} = evaluateBreach({
            consecutiveFailures   : 0,
            lastSuccessAt         : '2026-07-26T00:17:01Z',
            now                   : NOW,
            corpusLastCommitAt    : '2026-07-17T07:13:29Z',
            maxConsecutiveFailures: 3,
            maxSuccessAgeHours    : 24,
            maxCorpusAgeHours     : 48
        });

        expect(breached).toBe(true);
        expect(reasons.length).toBe(1);
        expect(reasons[0]).toContain('resources/content')
    });

    test('buildAlarmTitle: corpus-only breach names the corpus, not a zero streak', () => {
        expect(buildAlarmTitle({
            consecutiveFailures: 0,
            lastSuccess        : run('success', '2026-07-26T00:17:01Z'),
            corpusLastCommitAt : '2026-07-17T07:13:29Z',
            corpusAgeHours     : 220.5
        })).toBe(`${ALARM_TITLE_PREFIX} Data Sync corpus stale: last \`resources/content/**\` commit 2026-07-17T07:13:29Z (220.5h)`)
    });

    test('buildAlarmBody: carries the corpus axis line with the committed-dev rationale', () => {
        const body = buildAlarmBody({
            consecutiveFailures: 0,
            lastSuccess        : run('success', '2026-07-26T00:17:01Z'),
            latestFailure      : null,
            reasons            : ['last `resources/content/**` commit is 220.5h old (threshold 48h)'],
            corpusLastCommitAt : '2026-07-17T07:13:29Z',
            corpusAgeHours     : 220.5
        });

        expect(body).toContain('**Corpus axis:**');
        expect(body).toContain('2026-07-17T07:13:29Z (220.5h old)');
        expect(body).toContain('committed `dev`')
    });

    test('latestCommitDate: newest-wins across a multi-path semantic corpus (archive-only repair is maintenance)', () => {
        const entry = date => ({commit: {committer: {date}}});

        // active landed yesterday, archive landed today — the archive repair counts
        expect(latestCommitDate([[entry('2026-07-25T05:13:29Z')], [entry('2026-07-26T04:00:00Z')]]))
            .toBe('2026-07-26T04:00:00Z');
        // the reverse order resolves identically — freshness is the max, not the first path
        expect(latestCommitDate([[entry('2026-07-26T04:00:00Z')], [entry('2026-07-17T05:13:29Z')]]))
            .toBe('2026-07-26T04:00:00Z');
        // no visible commit on ANY subpath is null — the missing-facet breach reason
        expect(latestCommitDate([[], []])).toBe(null);
        expect(latestCommitDate([[null], [undefined]])).toBe(null)
    });

    test('evaluateBreach: per-facet — a single stale facet breaches while the others are fresh', () => {
        const {breached, reasons} = evaluateBreach({
            consecutiveFailures: 0,
            lastSuccessAt      : '2026-07-26T11:30:00Z',
            now                : NOW,
            corpusFacets       : [
                {facet: 'issues', lastCommitAt: '2026-07-26T10:00:00Z', ageHours: 2.0},
                {facet: 'pulls', lastCommitAt: '2026-07-17T05:13:29Z', ageHours: 214.8},
                {facet: 'discussions', lastCommitAt: '2026-07-25T08:00:00Z', ageHours: 28.0}
            ],
            maxConsecutiveFailures: 3,
            maxSuccessAgeHours    : 24,
            maxCorpusAgeHours     : 48
        });

        expect(breached).toBe(true);
        expect(reasons.length).toBe(1);
        expect(reasons[0]).toContain('facet `pulls`');
        expect(reasons[0]).toContain('214.8h')
    });

    test('evaluateBreach: per-facet — a facet with no visible commit breaches as its own reason', () => {
        const {breached, reasons} = evaluateBreach({
            consecutiveFailures: 0,
            lastSuccessAt      : '2026-07-26T11:30:00Z',
            now                : NOW,
            corpusFacets       : [
                {facet: 'issues', lastCommitAt: '2026-07-26T10:00:00Z', ageHours: 2.0},
                {facet: 'discussions', lastCommitAt: null, ageHours: null}
            ],
            maxConsecutiveFailures: 3,
            maxSuccessAgeHours    : 24,
            maxCorpusAgeHours     : 48
        });

        expect(breached).toBe(true);
        expect(reasons[0]).toBe('no commit visible for corpus facet `discussions` on the default branch')
    });

    test('evaluateBreach: per-facet — all facets fresh is healthy (the post-landing recovery shape)', () => {
        const {breached, reasons} = evaluateBreach({
            consecutiveFailures: 0,
            lastSuccessAt      : '2026-07-26T11:30:00Z',
            now                : NOW,
            corpusFacets       : [
                {facet: 'issues', lastCommitAt: '2026-07-26T10:00:00Z', ageHours: 2.0},
                {facet: 'pulls', lastCommitAt: '2026-07-26T09:00:00Z', ageHours: 3.0},
                {facet: 'discussions', lastCommitAt: '2026-07-26T08:00:00Z', ageHours: 4.0}
            ],
            maxConsecutiveFailures: 3,
            maxSuccessAgeHours    : 24,
            maxCorpusAgeHours     : 48
        });

        expect(breached).toBe(false);
        expect(reasons).toEqual([])
    });

    test('buildAlarmTitle: a per-facet corpus breach names the stale facets, not the tree', () => {
        expect(buildAlarmTitle({
            consecutiveFailures: 0,
            lastSuccess        : run('success', '2026-07-26T00:17:01Z'),
            staleFacets        : [{facet: 'pulls', ageHours: 214.8}, {facet: 'discussions', ageHours: 214.8}]
        })).toBe(`${ALARM_TITLE_PREFIX} Data Sync corpus stale: facets \`pulls\`, \`discussions\` (oldest 214.8h)`)
    });

    test('buildAlarmBody: the per-facet table carries each facet with its own age and status', () => {
        const body = buildAlarmBody({
            consecutiveFailures: 0,
            lastSuccess        : run('success', '2026-07-26T00:17:01Z'),
            latestFailure      : null,
            reasons            : ['corpus facet `pulls` is 214.8h old (threshold 48h)'],
            corpusFacets       : [
                {facet: 'issues', lastCommitAt: '2026-07-26T10:00:00Z', ageHours: 2.0, stale: false},
                {facet: 'pulls', lastCommitAt: '2026-07-17T05:13:29Z', ageHours: 214.8, stale: true},
                {facet: 'discussions', lastCommitAt: null, ageHours: null, stale: true}
            ]
        });

        expect(body).toContain('**Corpus facets**');
        expect(body).toContain('| `issues` | 2026-07-26T10:00:00Z | 2.0h | ok |');
        expect(body).toContain('| `pulls` | 2026-07-17T05:13:29Z | 214.8h | **STALE** |');
        expect(body).toContain('| `discussions` | none visible | — | **STALE** |')
    });

    test('forced dispatch dry-run alarm body discloses its own provenance', () => {
        const body = buildAlarmBody({
            consecutiveFailures: 0,
            lastSuccess        : run('success', '2026-07-26T11:00:00Z'),
            latestFailure      : null,
            reasons            : ['forced via workflow_dispatch (dry-run acceptance path)'],
            forced             : true
        });

        expect(body).toContain('forced `workflow_dispatch` dry run')
    });
});
