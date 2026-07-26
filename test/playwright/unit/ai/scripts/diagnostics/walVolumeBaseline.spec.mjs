import {test, expect} from '@playwright/test';
import fs             from 'node:fs/promises';
import os             from 'node:os';
import path           from 'node:path';
import {
    decideWalPosture,
    readWalSegments,
    reduceWalWindow
} from '../../../../../../ai/scripts/diagnostics/walVolumeBaseline.mjs';

// Pure reducers imported directly — no config singleton, no filesystem, no clock. `nowMs` is injected
// precisely so the window arithmetic is testable without `new Date()`, which would make every assertion
// clock-brittle.
//
// The control that matters most here is the EMPTY-WINDOW refusal. This module exists because a real
// measurement reported "0 files in 7 days" on a plane written to minutes earlier — the host's `find` was
// `bfs`, which rejected `-newermt` and emitted its error into a pipe, leaving exit code 0. A fabricated
// zero argues for the CHEAPER posture, so it is the most dangerous possible failure and gets asserted
// as a refusal rather than trusted as data.

const DAY = 86400000,
      MB  = 1024 * 1024,
      NOW = 1_800_000_000_000;   // fixed clock; any positive value works

/** Builds a segment `daysAgo` old with `mb` megabytes. */
const segment = (name, daysAgo, mb) => ({name, bytes: Math.round(mb * MB), mtimeMs: NOW - daysAgo * DAY});

const baselineOf = (segments, windowDays = 7) => reduceWalWindow({segments, windowDays, nowMs: NOW});

// The reducers above are pure. `readWalSegments` is I/O, and its two failure modes can only be
// controlled with a real tree — so this one describe builds a throwaway fixture. Both failures it
// guards were found by an independent measurement DISAGREEING with the scan, never by the scan itself.
test.describe('readWalSegments — the walker, against a real fixture', () => {
    let dir;

    test.beforeAll(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wal-baseline-'));
        await fs.mkdir(path.join(dir, 'messages'));
        await fs.writeFile(path.join(dir, 'wal-2026-07-26.jsonl'), 'a'.repeat(1000));
        await fs.writeFile(path.join(dir, 'messages', 'message-wal-2026-07-26.jsonl'), 'b'.repeat(2000));
        await fs.mkdir(path.join(dir, 'messages', 'archived'));
        await fs.writeFile(path.join(dir, 'messages', 'archived', 'old.jsonl'), 'c'.repeat(500));
    });

    test.afterAll(async () => { await fs.rm(dir, {recursive: true, force: true}) });

    test('⭐ counts NESTED segments — a top-level-only scan dropped 41% of the real corpus', () => {
        // The exact bug: the message WAL lives in `messages/` (`NEO_MESSAGE_WAL_DIR` places it there),
        // so `readdir` without recursion silently missed 65 of 159 segments on the reference plane. The
        // undercount pushes volume DOWN, which argues for the cheaper posture — the wrong direction.
        return readWalSegments(dir).then(segments => {
            expect(segments).toHaveLength(3);
            expect(segments.map(s => s.name).sort()).toEqual([
                'messages/archived/old.jsonl',
                'messages/message-wal-2026-07-26.jsonl',
                'wal-2026-07-26.jsonl'
            ]);
            // Sizes come from the files, so an undercount cannot hide in the byte total either.
            expect(segments.reduce((sum, s) => sum + s.bytes, 0)).toBe(3500);
        });
    })

    test('follows a SYMLINKED wal root — the multi-clone topology reaches the plane through one', async () => {
        // A seat's `.neo-ai-data/memory-wal` is a symlink to the canonical clone's plane. A scan that
        // classified it via Dirent instead of `stat` would see neither file nor directory and report
        // an empty plane — the fabricated zero again, by a different route.
        const linkParent = await fs.mkdtemp(path.join(os.tmpdir(), 'wal-link-')),
              link       = path.join(linkParent, 'memory-wal');

        try {
            await fs.symlink(dir, link, 'dir');
            expect(await readWalSegments(link)).toHaveLength(3);
        } finally {
            await fs.rm(linkParent, {recursive: true, force: true});
        }
    })
});

test.describe('reduceWalWindow — an empty observation refuses instead of reporting zero', () => {
    test('⭐ zero segments IN WINDOW refuses, and the reason names the instrument, not the data', () => {
        // The exact shape of the real incident: a populated plane whose recent-window scan came back
        // empty. Reporting `meanMbPerDay: 0` here would drive the posture to fork-then-replay off a
        // measurement that never happened.
        const result = baselineOf([segment('wal-old.jsonl', 400, 50)]);

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('unreliable measurement');
        expect(result.reason).toContain('not as zero write volume');
        expect(result).not.toHaveProperty('meanMbPerDay');
        // It still reports what it DID see, so the reader can tell "wrong window" from "wrong path".
        expect(result.reason).toContain('scanned 1 total');
    })

    test('an entirely empty directory refuses too — absence of files is never 0 MB/day', () => {
        const result = baselineOf([]);

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('unreliable measurement');
    })

    test('refuses malformed inputs rather than coercing them', () => {
        expect(reduceWalWindow({segments: 'nope', windowDays: 7, nowMs: NOW}).reason).toContain('must be an array');
        expect(baselineOf([segment('a', 1, 1)], 0).reason).toContain('windowDays');
        expect(baselineOf([segment('a', 1, 1)], Number.NaN).reason).toContain('windowDays');
        expect(reduceWalWindow({segments: [], windowDays: 7, nowMs: 0}).reason).toContain('nowMs');
    })
});

test.describe('reduceWalWindow — the measurement', () => {
    test('sums only in-window segments and reports mean per day', () => {
        const result = baselineOf([
            segment('wal-1.jsonl', 1, 7),
            segment('wal-2.jsonl', 3, 7),
            segment('wal-stale.jsonl', 30, 100)   // outside the 7d window; must not be counted
        ]);

        expect(result.ok).toBe(true);
        expect(result.fileCount).toBe(2);
        expect(result.scannedCount).toBe(3);
        expect(result.meanMbPerDay).toBeCloseTo(2, 5);   // 14MB over 7d
    })

    test('⭐ reports the PEAK day separately — a mean hides the day that sizes the posture', () => {
        // The real observation had a most-recent day at 3.2x the 7-day mean. A posture sized on the
        // mean would be sized against a quiet week.
        const result = baselineOf([
            segment('wal-quiet-a.jsonl', 5, 1),
            segment('wal-quiet-b.jsonl', 4, 1),
            segment('wal-busy-1.jsonl', 1, 6),
            segment('wal-busy-2.jsonl', 1, 4)     // same day ⇒ aggregates to 10MB
        ]);

        expect(result.peakDayMb).toBeCloseTo(10, 5);
        expect(result.meanMbPerDay).toBeCloseTo(12 / 7, 5);
        // The gap is the point: peak is ~5.8x the mean here.
        expect(result.peakDayMb).toBeGreaterThan(result.meanMbPerDay * 5);
    })
});

test.describe('decideWalPosture — the constant is deferred, never invented', () => {
    const busyBaseline = baselineOf([segment('wal-a.jsonl', 1, 3), segment('wal-b.jsonl', 3, 3)]);

    test('⭐ REFUSES without an explicit replayBudgetMb, and says why it has no default', () => {
        // The uncalibrated-constant trap. A plausible default here would encode one week's observation
        // as a calibrated bound — the exact move that was withdrawn after peers falsified it elsewhere
        // this cycle. The budget's only honest source is a measured replay throughput.
        const result = decideWalPosture({baseline: busyBaseline, pilotDays: 14});

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('no default on purpose');
        expect(result.reason).toContain('measured replay throughput');
    })

    test('fork-then-replay when the PEAK-projected corpus fits the budget', () => {
        const result = decideWalPosture({baseline: busyBaseline, pilotDays: 14, replayBudgetMb: 100});

        expect(result.ok).toBe(true);
        expect(result.posture).toBe('fork-then-replay');
        expect(result.projectedMb).toBeCloseTo(42, 5);           // peak day 3MB x 14d
        expect(result.headroomMb).toBeCloseTo(58, 5);
        expect(result.rationale).toContain('second write path buys nothing');
    })

    test('dual-journal when it does not — and the boundary is decided by the peak, not the mean', () => {
        // Mean-projected would be 12MB (under budget); peak-projected is 42MB (over). The stricter
        // projection must win, because under-projecting picks a posture that cannot replay.
        const result = decideWalPosture({baseline: busyBaseline, pilotDays: 14, replayBudgetMb: 20});

        expect(result.posture).toBe('dual-journal');
        expect(result.projectedFromMeanMb).toBeCloseTo(12, 5);
        expect(result.projectedFromMeanMb).toBeLessThan(20);     // the mean alone would have said "fits"
        expect(result.projectedMb).toBeGreaterThan(20);
        expect(result.rationale).toContain('cannot absorb');
    })

    test('a refused baseline cannot yield a posture — the refusal propagates', () => {
        const result = decideWalPosture({baseline: baselineOf([]), pilotDays: 14, replayBudgetMb: 100});

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('not a successful measurement');
    })

    test('refuses a non-positive pilotDays', () => {
        expect(decideWalPosture({baseline: busyBaseline, pilotDays: 0, replayBudgetMb: 10}).reason).toContain('pilotDays');
    })
});
