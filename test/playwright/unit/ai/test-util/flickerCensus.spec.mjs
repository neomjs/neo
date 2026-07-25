import {test, expect}       from '@playwright/test'
import {execFileSync}       from 'node:child_process'
import fs                   from 'node:fs'
import os                   from 'node:os'
import path                 from 'node:path'
import {censusVideoFlicker} from '../../../../../test/playwright/util/flickerCensus.mjs'

/**
 * @summary Contract suite for the flicker census — the instrument must count one-frame flashes
 * without misses and without inventing them. Fixtures are synthesized in-process (raw gray
 * planes written by the spec, encoded with the same h264/mp4 shape a capture produces), so the
 * ground truth is exact and nothing depends on a committed video.
 */

const W = 640, H = 360, FPS = 53.8;

/**
 * Builds a raw gray video: a smooth moving gradient (small, constant per-frame delta) with
 * full-black frames at the given positions. Returns the encoded mp4 path.
 */
function buildFixture({frames = 60, blanks = [], dir}) {
    const raw = Buffer.alloc(frames * W * H);

    for (let f = 0; f < frames; f++) {
        // Smooth sinusoidal sweep (per-frame delta ≈ 3, no wrap discontinuity): a sawtooth's
        // wrap IS a flash, and this instrument exists to catch exactly those.
        const value = blanks.includes(f) ? 0 : Math.round(70 + 30 * Math.sin(f / 10));

        raw.fill(value, f * W * H, (f + 1) * W * H)
    }

    const rawPath = path.join(dir, 'fixture.gray'),
          mp4Path = path.join(dir, 'fixture.mp4');

    fs.writeFileSync(rawPath, raw);
    execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error',
        '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${W}x${H}`, '-r', String(FPS),
        '-i', rawPath, '-pix_fmt', 'yuv420p', mp4Path
    ]);

    return mp4Path
}

test.describe('flickerCensus — the isolation matrix instrument (#15947)', () => {
    let dir;

    test.beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flicker-census-'))
    });

    test('counts injected one-frame blanks with zero misses and no false events', async () => {
        // One single blank (frame 20) and one double blank (frames 40+41). The double fuses
        // into ONE event — a 0.1s read is "one flicker", matching the take-review grain.
        const videoPath = buildFixture({frames: 60, blanks: [20, 40, 41], dir}),
              census    = await censusVideoFlicker({videoPath, scale: `${W}:${H}`});

        expect(census.events).toHaveLength(2);
        expect(census.events[0].startFrame).toBeLessThanOrEqual(21);
        expect(census.events[0].endFrame).toBeGreaterThanOrEqual(20);
        expect(census.events[1].startFrame).toBeLessThanOrEqual(41);
        expect(census.events[1].endFrame).toBeGreaterThanOrEqual(41)
    });

    test('a motion-heavy clip with no flashes produces zero events', async () => {
        const videoPath = buildFixture({frames: 90, blanks: [], dir}),
              census    = await censusVideoFlicker({videoPath, scale: `${W}:${H}`});

        expect(census.events).toHaveLength(0)
    });

    test('the spike bar is median-relative: a bright-motion clip is not misread as flashing', async () => {
        // A high-frequency checkerboard alternation: every frame differs strongly from the last,
        // so the MEDIAN delta is huge and no individual frame can stand out. An absolute-only
        // bar would call every frame a flash; the relative bar must not.
        const frames = 60,
              raw    = Buffer.alloc(frames * W * H);

        for (let f = 0; f < frames; f++) {
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    raw[f * W * H + y * W + x] = ((x + y + f) % 2) * 255
                }
            }
        }

        const rawPath = path.join(dir, 'checker.gray'),
              mp4Path = path.join(dir, 'checker.mp4');

        fs.writeFileSync(rawPath, raw);
        execFileSync('ffmpeg', [
            '-y', '-loglevel', 'error',
            '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${W}x${H}`, '-r', String(FPS),
            '-i', rawPath, '-pix_fmt', 'yuv420p', mp4Path
        ]);

        const census = await censusVideoFlicker({videoPath: mp4Path, scale: `${W}:${H}`});

        expect(census.medianDelta).toBeGreaterThan(0);
        expect(census.threshold).toBeGreaterThan(census.absFloor ?? 25);
        expect(census.events).toHaveLength(0)
    });
});
