import {test, expect} from '@playwright/test';

import {
    collectFailures,
    formatDigest,
    isRed
} from '../../../../../../ai/scripts/lifecycle/nightlyE2eDigest.mjs';

// A Playwright json report with one failing spec nested under a suite + one passing sibling.
const redReport = {
    suites: [{
        title : 'root',
        file  : 'test/playwright/e2e/foo.spec.mjs',
        specs : [{title: 'top-level passes', line: 10, ok: true, tests: [{results: [{status: 'passed'}]}]}],
        suites: [{
            title: 'nested',
            file : 'test/playwright/e2e/foo.spec.mjs',
            specs: [{
                title: 'drives the thing',
                file : 'test/playwright/e2e/foo.spec.mjs',
                line : 42,
                ok   : false,
                tests: [{results: [{status: 'failed', errors: [{message: 'Error: expected running, got gated\n  at foo.spec.mjs:42:7'}]}]}]
            }]
        }]
    }]
};

test.describe('nightlyE2eDigest (#14685 — pure parse/format core)', () => {
    test('collectFailures walks nested suites and returns actionable pointers (title, file:line, FIRST error line)', () => {
        const failures = collectFailures(redReport);

        expect(failures).toHaveLength(1);
        expect(failures[0]).toEqual({
            title     : 'drives the thing',
            location  : 'test/playwright/e2e/foo.spec.mjs:42',
            firstError: 'Error: expected running, got gated'   // first non-empty line only, no stack
        });
    });

    test('collectFailures returns [] for an all-green report — nothing to point at', () => {
        const green = {suites: [{specs: [{title: 'ok', line: 1, ok: true, tests: [{results: [{status: 'passed'}]}]}]}]};
        expect(collectFailures(green)).toEqual([]);
    });

    test('collectFailures is fail-open on a malformed/empty report (no suites, null)', () => {
        expect(collectFailures(null)).toEqual([]);
        expect(collectFailures({})).toEqual([]);
        expect(collectFailures({suites: []})).toEqual([]);
    });

    test('collectFailures truncates a very long first-error line so the digest stays scannable', () => {
        const long   = `Error: ${'x'.repeat(400)}`,
              report = {suites: [{specs: [{title: 't', file: 'a.mjs', line: 1, ok: false, tests: [{results: [{status: 'failed', error: {message: long}}]}]}]}]},
              row    = collectFailures(report)[0];

        expect(row.firstError.endsWith('…')).toBe(true);
        expect(row.firstError.length).toBeLessThanOrEqual(241);
    });

    test('isRed is true on a failing spec, true on an infra red (ran:false), false only when all clean-green', () => {
        expect(isRed([{config: 'c', failures: [{}], ran: true}])).toBe(true);
        expect(isRed([{config: 'c', failures: [], ran: false}])).toBe(true);   // infra/boot red, never swallowed
        expect(isRed([{config: 'c', failures: [], ran: true}])).toBe(false);
        expect(isRed([])).toBe(false);
    });

    test('formatDigest names the config, spec pointer, error, and run-log path; skips clean-green configs', () => {
        const outcomes = [
            {config: 'test/playwright/playwright.config.e2e.mjs', failures: collectFailures(redReport), ran: true, note: ''},
            {config: 'test/playwright/playwright.config.other.mjs', failures: [], ran: true, note: ''}   // clean-green → omitted
        ];
        const digest = formatDigest(outcomes, '.neo-ai-data/nightly-e2e/logs/run-x.log');

        expect(digest).toContain('surfaced RED');
        expect(digest).toContain('**`test/playwright/playwright.config.e2e.mjs`** — 1 failing');
        expect(digest).toContain('`test/playwright/e2e/foo.spec.mjs:42` — drives the thing: Error: expected running, got gated');
        expect(digest).toContain('Run log: `.neo-ai-data/nightly-e2e/logs/run-x.log`');
        expect(digest).not.toContain('config.other.mjs');   // clean-green config produces no line
    });

    test('formatDigest surfaces an infra red (no failing specs, but ran:false + note)', () => {
        const digest = formatDigest([{config: 'c.mjs', failures: [], ran: false, note: 'runner exited 1 with no report (infra/boot failure)'}], 'log');
        expect(digest).toContain('**`c.mjs`** — 0 failing · runner exited 1 with no report (infra/boot failure)');
    });
});
