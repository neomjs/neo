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
    selectAlarmIssue
} from '../../../../../buildScripts/dataSyncWatchdog.mjs';

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

    test('isRecovered: only a success conclusion counts', () => {
        expect(isRecovered({latestConclusion: 'success'})).toBe(true);
        expect(isRecovered({latestConclusion: 'failure'})).toBe(false);
        expect(isRecovered({latestConclusion: null})).toBe(false)
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
