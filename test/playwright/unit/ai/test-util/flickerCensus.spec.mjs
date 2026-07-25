import {test, expect} from '@playwright/test'
import {execFileSync} from 'node:child_process'
import fs             from 'node:fs'
import os             from 'node:os'
import path           from 'node:path'
import {
    censusVideoFlicker,
    detectFlickerFrames
} from '../../../../../test/playwright/util/flickerCensus.mjs'

/**
 * @summary Contract suite for the flicker census, in its two layers: the PURE detector gets
 * in-memory fixtures (no ffmpeg in the loop — one threshold/pairing implementation, tested
 * directly), and the media adapter gets one mp4 round-trip to pin the decode path.
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

test.describe('flickerCensus — the isolation matrix instrument (#15947)', () => {
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

    test('pure detector: every spike is preserved with timestamp + magnitude, unpaired included', async () => {
        const census = await detectFlickerFrames({
            frames: grayFrames({frames: 60, blanks: [20, 40, 41]}),
            width : W, height: H, fps: FPS
        });

        // 3 injected boundaries produce dip+return spike pairs — all of them ride the record,
        // with seconds and magnitudes attached. Fusion (2 events) must not hide any of them.
        expect(census.spikes.length).toBeGreaterThanOrEqual(4);

        for (const spike of census.spikes) {
            expect(typeof spike.sec).toBe('number');
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

    test('media adapter: the mp4 decode path feeds the same detector (one round-trip pin)', async () => {
        const dir     = fs.mkdtempSync(path.join(os.tmpdir(), 'flicker-census-')),
              rawPath = path.join(dir, 'fixture.gray'),
              mp4Path = path.join(dir, 'fixture.mp4');

        fs.writeFileSync(rawPath, Buffer.concat(grayFrames({frames: 60, blanks: [20, 40, 41]})));
        execFileSync('ffmpeg', [
            '-y', '-loglevel', 'error',
            '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${W}x${H}`, '-r', String(FPS),
            '-i', rawPath, '-pix_fmt', 'yuv420p', mp4Path
        ]);

        const census = await censusVideoFlicker({videoPath: mp4Path, scale: `${W}:${H}`});

        expect(census.events).toHaveLength(2);
        expect(census.fps).toBeCloseTo(FPS, 0)
    });
});
