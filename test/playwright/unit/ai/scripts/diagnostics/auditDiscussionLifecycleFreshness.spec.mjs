import {test, expect} from '@playwright/test';
import {formatReport} from '../../../../../../ai/scripts/diagnostics/audit-discussion-lifecycle.mjs';

/**
 * @summary The freshness caveat this guard emits BEFORE any finding.
 *
 * The audit reads a synced snapshot, not live GitHub, and used to say nothing about it: close six
 * Discussions on GitHub, re-run, and it still reported all six — a stale verdict wearing the shape
 * of a current finding. A maintainer re-closes six already-closed Discussions, concludes the tool
 * is wrong, and stops trusting it, which is worse than not having the tool.
 *
 * Three states and no fourth: fresh, stale past a stated bound, and UNKNOWN. Unknown must never
 * collapse into fresh — a default of "fresh" lets an unreadable history silently certify every
 * verdict beneath it.
 *
 * "No fourth" is a property of the DISCRIMINATOR, not of the state list. The producer signals unknown
 * with `ageHours: null` on every path, and nulls `ingestedAt` on only one of them; a formatter keying
 * on `ingestedAt` therefore reads the second unknown as fresh. Three states in the producer plus the
 * wrong field in the consumer is still four outcomes.
 */
const report = (snapshot, options = {}) => formatReport(
    {candidates: [{kind: 'graduated-open', number: 10137, title: 'a candidate'}], scanned: 1, snapshot},
    options
);

test.describe('audit-discussion-lifecycle — the snapshot states its own age', () => {
    test('a stale snapshot says so, names the bound, and warns that a closed Discussion still reads open', () => {
        const output = report({ageHours: 37.4, ingestedAt: '2026-08-02T20:41:06Z', reason: null, source: 'git'},
            {maxSnapshotAgeHours: 6});

        expect(output).toContain('STALE SNAPSHOT');
        expect(output).toContain('2026-08-02T20:41:06Z');
        expect(output).toContain('37.4h ago');
        expect(output).toContain('bound 6h');
        expect(output, 'the reader must be told the failure mode, not just the number')
            .toContain('a Discussion closed since then still reports as open')
    });

    test('an UNKNOWN age is reported as unknown — it never collapses into fresh', () => {
        // The whole point of the three-state discipline. An absent measurement must not certify
        // the findings beneath it.
        //
        // Each case carries the shape its PRODUCER actually returns. The unparsable branch returns the
        // raw string WITH `ageHours: null`, and pinning both cases to `ingestedAt: null` was what made
        // this assertion unable to fail: the one shape that broke was the one the fixture could not
        // express. Found in review by @neo-opus-vega.
        const producerShapes = [
            {ageHours: null, ingestedAt: null,                reason: 'no commit touches the snapshot directory'},
            {ageHours: null, ingestedAt: 'Mon Aug 4 not-a-date', reason: 'unparsable commit timestamp'}
        ];

        for (const shape of producerShapes) {
            const output = report({...shape, source: 'git'});

            expect(output).toContain('SNAPSHOT AGE UNKNOWN');
            expect(output).toContain(shape.reason);
            expect(output).toContain('must be confirmed against GitHub');
            expect(output, 'an unknown age must never read as a fresh one').not.toContain('snapshot refreshed');
            expect(output, '"nullh ago" is the tell that the formatter took the fresh branch')
                .not.toContain('nullh')
        }
    });

    test('an unparsable timestamp is surfaced in the caveat, not swallowed', () => {
        // The raw string is what whoever debugs the git output actually needs. Dropping it would make
        // the unknown honest and useless at the same time.
        const output = report({
            ageHours: null, ingestedAt: 'Mon Aug 4 not-a-date', source: 'git',
            reason  : 'unparsable commit timestamp'
        });

        expect(output).toContain('SNAPSHOT AGE UNKNOWN');
        expect(output).toContain('Mon Aug 4 not-a-date')
    });

    test('an unreachable git history is UNKNOWN, not fresh — the instrument cannot certify itself', () => {
        const output = report({
            ageHours: null, ingestedAt: null, source: 'unavailable',
            reason  : 'snapshot age could not be determined (spawn git ENOENT)'
        });

        expect(output).toContain('SNAPSHOT AGE UNKNOWN');
        expect(output).toContain('spawn git ENOENT')
    });

    test('a fresh snapshot states its age without the stale warning', () => {
        // Positive control: without it, "always warn" passes every assertion above.
        const output = report({ageHours: 1.2, ingestedAt: '2026-08-04T19:30:00Z', reason: null, source: 'git'},
            {maxSnapshotAgeHours: 6});

        expect(output).toContain('snapshot refreshed');
        expect(output).toContain('1.2h ago');
        expect(output).not.toContain('STALE SNAPSHOT');
        expect(output).not.toContain('SNAPSHOT AGE UNKNOWN')
    });

    test('the boundary is a strict overrun — exactly at the bound is still fresh', () => {
        const at = report({ageHours: 6, ingestedAt: '2026-08-04T14:00:00Z', reason: null, source: 'git'},
                  {maxSnapshotAgeHours: 6}),
              over  = report({ageHours: 6.1, ingestedAt: '2026-08-04T14:00:00Z', reason: null, source: 'git'},
                  {maxSnapshotAgeHours: 6});

        expect(at).not.toContain('STALE SNAPSHOT');
        expect(over).toContain('STALE SNAPSHOT')
    });

    test('a report with NO snapshot key degrades to unknown rather than asserting freshness', () => {
        // A caller that never measured must not be silently upgraded to "current".
        const output = formatReport({candidates: [], scanned: 0});

        expect(output).toContain('SNAPSHOT AGE UNKNOWN');
        expect(output).toContain('not measured')
    });

    test('the freshness line precedes every finding — a reader who hits the list first has already acted', () => {
        const output = report({ageHours: 37.4, ingestedAt: '2026-08-02T20:41:06Z', reason: null, source: 'git'},
            {maxSnapshotAgeHours: 6});

        const freshnessAt = output.indexOf('STALE SNAPSHOT'),
              findingAt   = output.indexOf('10137');

        expect(freshnessAt).toBeGreaterThanOrEqual(0);
        expect(findingAt, 'the candidate must actually appear, or the ordering assertion is vacuous')
            .toBeGreaterThanOrEqual(0);
        expect(freshnessAt, 'the caveat must come BEFORE the findings it qualifies').toBeLessThan(findingAt)
    });

    test('--json is unaffected: the machine surface carries the snapshot verbatim, uninterpreted', () => {
        const snapshot = {ageHours: 37.4, ingestedAt: '2026-08-02T20:41:06Z', reason: null, source: 'git'},
              parsed   = JSON.parse(report(snapshot, {json: true}));

        expect(parsed.snapshot).toEqual(snapshot)
    })
});
