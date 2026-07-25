#!/usr/bin/env node
/**
 * @module test/playwright/util/flickerCensus
 * @summary Position-independent flicker census, in two layers per the matrix owner's ruling:
 * a PURE detector over decoded consecutive gray frames (no media machinery inside), and a media
 * adapter that decodes `.mov`/`.webm`/`.mp4` through ffmpeg and feeds it. One threshold/pairing
 * implementation, consumed by the CLI, the spec, and the isolation matrix alike.
 *
 * Why delta energy and not color masks: capture pipelines soften saturated UI accents (a
 * 255,90,0 dot reads as ~200-230 red after screencapture), so color thresholds lie; delta has no
 * color to soften. Why median-relative and not absolute: a dark-themed app and a bright desktop
 * live in different energy classes, so the spike bar derives from the clip's own median
 * (`> max(absFloor, median × relFactor)`); absolute bars lie across content classes.
 *
 * Reporting contract: EVERY boundary spike is preserved with frame, timestamp, and magnitude.
 * Event fusion (the ~0.1s human read) is a VIEW over the spike list, never a filter on it — an
 * unpaired spike is a fact, not noise.
 *
 * Usage:
 *   node test/playwright/util/flickerCensus.mjs <video-file> [--scale 640x360]
 */
import {spawn, spawnSync} from 'node:child_process';

const DEFAULT_SCALE = '640:360',
      ABS_FLOOR     = 25,
      REL_FACTOR    = 6,
      // Spikes this close together (in frames) fuse into one event — a flash's dip and its
      // return are usually adjacent frames, and at ~54fps a 5-frame window is ~0.1s, which is
      // how a human viewer reads "one flicker" rather than two.
      PAIR_GAP_MAX  = 5;

/**
 * The pure detector: decoded consecutive gray frames in, the full spike record out.
 * @param {Object} options
 * @param {Buffer[]|AsyncIterable<Buffer>|Iterable<Buffer>} options.frames gray frames, width×height bytes each
 * @param {Number} options.width
 * @param {Number} options.height
 * @param {Number} options.fps source cadence — timestamps derive from it
 * @param {Number} [options.absFloor=25] spike bar: absolute floor (mean-abs delta)
 * @param {Number} [options.relFactor=6] spike bar: multiple of the clip's median delta
 * @param {Number} [options.pairGapMax=5] spikes within this many frames fuse into one event VIEW
 * @returns {{events: Array, spikes: Array<{frame: Number, sec: Number, delta: Number}>, medianDelta: Number, threshold: Number, absFloor: Number, relFactor: Number, frames: Number, fps: Number}}
 */
export async function detectFlickerFrames({frames, width, height, fps, absFloor = ABS_FLOOR, relFactor = REL_FACTOR, pairGapMax = PAIR_GAP_MAX}) {
    const frameSize = width * height,
          deltas    = [];

    let prev = null;

    for await (const frame of frames) {
        if (frame.length !== frameSize) {
            throw new Error(`detectFlickerFrames: frame size ${frame.length} ≠ ${width}×${height}`)
        }

        if (prev) {
            let sum = 0;

            // Every 7th byte: a 1/7 sample of the gray plane is a stable energy proxy
            for (let i = 0; i < frameSize; i += 7) {
                sum += Math.abs(frame[i] - prev[i])
            }

            deltas.push(sum / (frameSize / 7))
        }

        prev = frame
    }

    const sorted    = [...deltas].sort((a, b) => a - b),
          median    = sorted[Math.floor(sorted.length / 2)] ?? 0,
          threshold = Math.max(absFloor, median * relFactor),
          spikes    = [];

    deltas.forEach((delta, index) => {
        // Spike at frame (index + 1): delta i compares frame i to frame i+1. Magnitude and
        // timestamp ride every spike — an unpaired spike is a fact, not noise.
        if (delta > threshold) {
            spikes.push({frame: index + 1, sec: Number(((index + 1) / fps).toFixed(2)), delta: Number(delta.toFixed(1))})
        }
    });

    // The ~0.1s human read: a VIEW over the spike list, never a filter on it.
    const events = [];

    for (const spike of spikes) {
        const last = events[events.length - 1];

        if (last && spike.frame - last.endFrame <= pairGapMax) {
            last.endFrame = spike.frame;
            last.endSec   = spike.sec
        } else {
            events.push({startFrame: spike.frame, endFrame: spike.frame, startSec: spike.sec, endSec: spike.sec})
        }
    }

    return {events, spikes, medianDelta: Number(median.toFixed(2)), threshold, absFloor, relFactor, frames: deltas.length + 1, fps}
}

/**
 * Reads a video file's fps via ffprobe (falls back to 60 when unprobeable — times degrade, the
 * spike structure does not).
 * @param {String} videoPath
 * @returns {Number}
 */
export function probeFps(videoPath) {
    const out = spawnSync('ffprobe', [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=avg_frame_rate', '-of', 'csv=p=0', videoPath
    ], {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024});

    const [num, den] = (out.stdout || '0/1').trim().split('/').map(Number);

    return num > 0 && den > 0 ? num / den : 60
}

/**
 * The media adapter: decodes a video file through ffmpeg and feeds the pure detector. Streams
 * frame-at-a-time (one previous frame retained inside the detector), so take-length captures
 * fit memory — a maxBuffer one-shot would not.
 * @param {Object} options
 * @param {String} options.videoPath
 * @param {String} [options.scale='640:360'] downsample before analysis (speed; boundaries survive)
 * @returns {Promise<Object>} the detector's result ({events, spikes, medianDelta, threshold, absFloor, relFactor, frames, fps})
 */
export async function censusVideoFlicker({videoPath, scale = DEFAULT_SCALE, ...detectorOptions}) {
    const [w, h]    = scale.split(/[:x]/).map(Number),
          frameSize = w * h,
          fps       = probeFps(videoPath);

    async function* decode() {
        const ff = spawn('ffmpeg', [
            '-loglevel', 'error', '-i', videoPath,
            '-vf', `scale=${w}:${h},format=gray`, '-f', 'rawvideo', '-'
        ]);

        let carry = Buffer.alloc(0);

        for await (const chunk of ff.stdout) {
            carry = carry.length === 0 ? chunk : Buffer.concat([carry, chunk]);

            while (carry.length >= frameSize) {
                yield carry.subarray(0, frameSize);
                carry = carry.subarray(frameSize)
            }
        }

        await new Promise((resolve, reject) => {
            ff.on('error', reject);
            ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))
        })
    }

    return detectFlickerFrames({frames: decode(), width: w, height: h, fps, ...detectorOptions})
}

if (process.argv[1] && process.argv[1].endsWith('flickerCensus.mjs')) {
    const [videoPath] = process.argv.slice(2).filter(arg => !arg.startsWith('--'));

    if (!videoPath) {
        console.error('Usage: node test/playwright/util/flickerCensus.mjs <video-file> [--scale 640x360]');
        process.exit(1)
    }

    censusVideoFlicker({videoPath}).then(({events, spikes, medianDelta, threshold, frames, fps}) => {
        console.log(`frames=${frames} fps=${fps} medianDelta=${medianDelta} threshold=${threshold} spikes=${spikes.length} events=${events.length}`);
        for (const spike of spikes) {
            console.log(`  spike ${spike.sec}s (frame ${spike.frame}, delta ${spike.delta})`)
        }
        for (const event of events) {
            console.log(`  event ${event.startSec}s–${event.endSec}s (frames ${event.startFrame}–${event.endFrame})`)
        }
    }).catch(error => {
        console.error(error.message);
        process.exit(1)
    })
}
