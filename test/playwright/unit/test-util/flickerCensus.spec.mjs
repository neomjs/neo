import {test, expect}            from '@playwright/test'
import {execFileSync, spawnSync} from 'node:child_process'
import fs                        from 'node:fs'
import os                        from 'node:os'
import path                      from 'node:path'
import {
    censusRawGrayFile,
    censusVideoFlicker,
    detectFlickerFrames
} from '../../../../test/playwright/util/flickerCensus.mjs'

/**
 * @summary Contract suite for the flicker census, in its two layers: the PURE detector gets
 * in-memory fixtures (no ffmpeg in the loop — one threshold/pairing implementation, tested
 * directly), the raw-gray adapter gets the no-ffmpeg CI-owned round-trip, and the ffmpeg adapter
 * is pinned only where ffmpeg exists.
 */

const W = 640, H = 360, FPS = 53.8;

/** Builds gray frames in memory: a smooth sinusoidal sweep with full-black frames injected. */
function grayFrames({frames = 60, blanks = []}) {
    const out = [];

    for (let f = 0; f < frames; f++) {
        // Smooth sweep (per-frame delta ≈ 3, no wrap discontinuity): a sawtooth's wrap IS a
        // flash, and this instrument exists to catch exactly those.
        const value = blanks.includes(f) ? 0 : Math.round(70 + 30 * Math.sin(f / 10));

        out.push(Buffer.alloc(W * H, value))
    }

    return out
}

const ffmpegAvailable = spawnSync('ffmpeg', ['-version'], {encoding: 'utf8'}).status === 0;

test.describe('flickerCensus — the isolation matrix instrument (#15947)', () => {
    let dir;

    test.beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flicker-census-'))
    });

    test.afterAll(() => {
        fs.rmSync(dir, {force: true, recursive: true})
    });

    test('pure detector: counts injected one-frame blanks, fuses a double into one event', async () => {
        const census = await detectFlickerFrames({
            frames: grayFrames({frames: 60, blanks: [20, 40, 41]}),
            width : W, height: H, fps: FPS
        });

        expect(census.events).toHaveLength(2);
        expect(census.events[0].startFrame).toBeLessThanOrEqual(21);
        expect(census.events[0].endFrame).toBeGreaterThanOrEqual(20);
        expect(census.events[1].startFrame).toBeLessThanOrEqual(41);
        expect(census.events[1].endFrame).toBeGreaterThanOrEqual(41)
    });

    test('pure detector: the COMPLETE spike list rides the record, terminal unpaired included', async () => {
        // Three injected boundaries: a single (dip+return), a double (dip+dip+return across
        // three deltas), and a TERMINAL blank at the last frame — a dip with no return, which
        // must surface unpaired rather than vanish.
        const blanks = [20, 40, 41, 59],
              census = await detectFlickerFrames({
                  frames: grayFrames({frames: 60, blanks}),
                  width : W, height: H, fps: FPS
              });

        expect(census.spikes.map(spike => spike.frame)).toEqual([20, 21, 40, 42, 59]);
        expect(census.events).toHaveLength(3); // the terminal spike is its own event, never hidden
        expect(census.events[2].startFrame).toBe(59);

        for (const spike of census.spikes) {
            expect(spike.delta).toBeGreaterThan(census.threshold);
            expect(spike.sec).toBeCloseTo(spike.frame / FPS, 1)
        }
    });

    test('pure detector: a motion-heavy clip with no flashes produces zero events', async () => {
        const census = await detectFlickerFrames({
            frames: grayFrames({frames: 90, blanks: []}),
            width : W, height: H, fps: FPS
        });

        expect(census.events).toHaveLength(0);
        expect(census.spikes).toHaveLength(0)
    });

    test('pure detector: the spike bar is median-relative under high-frequency motion', async () => {
        // A checkerboard alternation: every frame differs strongly from the last, so the MEDIAN
        // delta is huge and no frame stands out. An absolute-only bar calls every frame a flash.
        const frames = [];

        for (let f = 0; f < 60; f++) {
            const frame = Buffer.alloc(W * H);

            for (let i = 0; i < W * H; i++) {
                const x = i % W, y = Math.floor(i / W);

                frame[i] = ((x + y + f) % 2) * 255
            }

            frames.push(frame)
        }

        const census = await detectFlickerFrames({frames, width: W, height: H, fps: FPS});

        expect(census.medianDelta).toBeGreaterThan(0);
        expect(census.threshold).toBeGreaterThan(census.absFloor);
        expect(census.events).toHaveLength(0)
    });

    test('pure detector: the three-spike chain reports the SAME count on native and CFR paths', async () => {
        // The fusion contract is the ADJACENT gap, never the event's start. Blanks at 0/4/8
        // produce boundary spikes at frames 1,4,5,8,9 — all adjacent gaps inside the window —
        // so both paths chain them into ONE event. A start-anchored native window would read
        // the fourth spike (0.24s from the event's 0.03s start, past the 0.1s window) as a
        // second event while CFR still reports one.
        const frames = grayFrames({frames: 60, blanks: [0, 4, 8]}),
              cfr    = await detectFlickerFrames({frames, width: W, height: H, fps: FPS}),
              native = await detectFlickerFrames({
                  frames, width: W, height: H, fps: FPS,
                  times: frames.map((_, i) => i * 0.03)
              });

        expect(cfr.events).toHaveLength(1);
        expect(native.events).toHaveLength(1);
        expect(native.events[0].startFrame).toBeLessThanOrEqual(1);
        expect(native.events[0].endFrame).toBeGreaterThanOrEqual(9)
    });

    test('pure detector: native PTS drives timestamps and the fusion window, never index/fps', async () => {
        // VFR timing: dense 0.01s spacing, with a 0.4s source gap between frame 11 and 12.
        // The dip+return pairs fuse on their own time; the 0.4s gap must keep the pairs apart —
        // frame distance would read the two blanks as neighbors, source time says they are not.
        const blanks = [10, 13, 30, 36],
              frames = grayFrames({frames: 60, blanks}),
              times  = frames.map((_, i) => i <= 11 ? i * 0.01 : 0.4 + (i - 12) * 0.01),
              census = await detectFlickerFrames({frames, width: W, height: H, fps: FPS, times});

        expect(census.nativeTime).toBe(true);

        // Spike at frame 13 reads its SOURCE time (0.42s) — index/fps would claim 0.24s.
        expect(census.spikes.find(spike => spike.frame === 13).sec).toBeCloseTo(0.42, 1);
        // Fusion by elapsed source time: (10,11) fuse, (13,14) fuse, the 0.4s gap keeps them
        // apart, and (30,31)+(36,37) chain into one event on their own close times.
        expect(census.events).toHaveLength(3);
        expect(census.events[0].startSec).toBeCloseTo(0.1, 1);
        expect(census.events[1].startSec).toBeCloseTo(0.42, 1);
        expect(census.events[2].startFrame).toBe(30);
        expect(census.events[2].endFrame).toBe(37)
    });

    test('raw-gray adapter: the no-ffmpeg round-trip feeds the same detector', async () => {
        const rawPath = path.join(dir, 'fixture.gray');

        fs.writeFileSync(rawPath, Buffer.concat(grayFrames({frames: 60, blanks: [20, 40, 41]})));

        const census = await censusRawGrayFile({filePath: rawPath, width: W, height: H, fps: FPS});

        expect(census.events).toHaveLength(2);
        expect(census.spikes.map(spike => spike.frame)).toEqual([20, 21, 40, 42])
    });

    test('ffmpeg adapter: native cadence and source PTS survive a VFR source', async() => {
        test.skip(!ffmpegAvailable, 'ffmpeg not on this runner');

        const rawPath = path.join(dir, 'vfr.gray'),
              mp4Path = path.join(dir, 'vfr.mp4'),
              frames  = grayFrames({frames: 13, blanks: [4, 9]});

        fs.writeFileSync(rawPath, Buffer.concat(frames));

        // True VFR container: 13 frames spaced ~0.5s apart (≈6s of footage at irregular source
        // time). Passthrough must preserve the 13 and their PTS — never a resampled count, never
        // index/average time.
        execFileSync('ffmpeg', [
            '-y', '-loglevel', 'error',
            '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${W}x${H}`, '-r', String(FPS),
            '-i', rawPath, '-vf', 'setpts=N*26.9', '-fps_mode', 'vfr', mp4Path
        ]);

        const census = await censusVideoFlicker({videoPath: mp4Path, scale: `${W}:${H}`});

        expect(census.frames).toBe(13);
        expect(census.nativeTime).toBe(true);

        // The blank at frame 9 spikes near its SOURCE time (~4.5s) — index/fps would claim 0.17s.
        const spike9 = census.spikes.find(spike => spike.frame === 9);

        expect(Math.abs(spike9.sec - 4.5)).toBeLessThan(0.35)
    });
});
