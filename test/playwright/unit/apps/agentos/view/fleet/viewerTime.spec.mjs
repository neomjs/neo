import {setup} from '../../../../../setup.mjs';

const appName = 'FleetViewerTimeTest';

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

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../../../../src/Neo.mjs';
import * as core          from '../../../../../../../src/core/_export.mjs';
import {formatViewerTime} from '../../../../../../../apps/agentos/view/fleet/viewerTime.mjs';

// Zone and locale are PINNED on every call. A test that relied on the runner's ambient zone would
// pass in CI (UTC) while proving nothing about the defect, which is specifically that a viewer OUTSIDE
// UTC reads the wrong number — the runner's own zone is the one case that cannot detect it.
const berlin = {locale: 'en-GB', timeZone: 'Europe/Berlin'};

test.describe('AgentOS fleet viewerTime — viewer-local presentation, UTC wire (#17302)', () => {
    test('a non-UTC viewer sees local wall-clock, and the ISO instant survives as the receipt', () => {
        // 22:30Z in August is 00:30 the NEXT day in Berlin (+2). This single case proves the zone is
        // applied AND that the local calendar day rolls with it — a formatter that merely re-labelled
        // UTC would render 22:30 and pass any assertion that only checked "some time came back".
        const view = formatViewerTime('2026-08-17T22:30:00.000Z', {...berlin, now: new Date('2026-08-18T00:35:00.000Z')});

        expect(view.text).toContain('00:30');
        expect(view.text).not.toContain('22:30');

        // the receipt half: the exact wire instant, unchanged and zone-free
        expect(view.title).toBe('2026-08-17T22:30:00.000Z')
    });

    test('same-day renders time-only; an older instant gains a date part', () => {
        const
            now      = new Date('2026-08-17T12:00:00.000Z'),
            sameDay  = formatViewerTime('2026-08-17T08:15:00.000Z', {...berlin, now}),
            olderDay = formatViewerTime('2026-08-14T08:15:00.000Z', {...berlin, now});

        // 08:15Z → 10:15 Berlin, same local day as `now` → time only, nothing else
        expect(sameDay.text).toBe('10:15');

        // three days back must NOT be a bare time: `10:15` alone on an old row is actively
        // misleading rather than merely terse, which is the whole reason for the ladder
        expect(olderDay.text).toContain('10:15');
        expect(olderDay.text).not.toBe('10:15');
        expect(olderDay.text).toMatch(/14/); // the day number, however the locale orders it
    });

    test('the same-day ladder keys on the VIEWER calendar, not the UTC one', () => {
        // 23:30Z on the 17th is 01:30 on the 18th in Berlin. Judged in UTC this is "yesterday" and
        // would wrongly acquire a date part; judged in the viewer's calendar it is today.
        const view = formatViewerTime('2026-08-17T23:30:00.000Z', {...berlin, now: new Date('2026-08-18T05:00:00.000Z')});

        expect(view.text).toBe('01:30')
    });

    test('an absent or unparseable instant returns null so the surface owns its own miss-copy', () => {
        for (const miss of [null, undefined, '', 'not-a-date', NaN]) {
            expect(formatViewerTime(miss, berlin)).toBeNull()
        }

        // The contract that keeps `—` in a dense stream row and `unknown time` in a prose pane:
        // the helper single-sources FORMAT and never the empty-state vocabulary.
        expect(formatViewerTime(null)?.text ?? '—').toBe('—');
        expect(formatViewerTime('nope')?.text ?? 'unknown time').toBe('unknown time')
    });

    test('an unusable timeZone degrades to the viewer default instead of taking the row down', () => {
        // `Intl.DateTimeFormat` throws on an unknown zone. A row is never worth a blank surface, so
        // the override falls back rather than propagating — asserted because the catch is easy to
        // delete during a refactor and nothing else would notice until a render died.
        expect(() => formatViewerTime('2026-08-17T08:15:00.000Z', {timeZone: 'Mars/Olympus'})).not.toThrow();

        const view = formatViewerTime('2026-08-17T08:15:00.000Z', {timeZone: 'Mars/Olympus'});

        expect(view).not.toBeNull();
        expect(view.title).toBe('2026-08-17T08:15:00.000Z')
    });

    test('Date and epoch-ms inputs are accepted alongside ISO strings', () => {
        const
            now  = new Date('2026-08-17T12:00:00.000Z'),
            iso  = formatViewerTime('2026-08-17T08:15:00.000Z', {...berlin, now}),
            date = formatViewerTime(new Date('2026-08-17T08:15:00.000Z'), {...berlin, now}),
            ms   = formatViewerTime(Date.parse('2026-08-17T08:15:00.000Z'), {...berlin, now});

        expect(date.text).toBe(iso.text);
        expect(ms.text).toBe(iso.text);
        expect(ms.title).toBe(iso.title)
    })
});
