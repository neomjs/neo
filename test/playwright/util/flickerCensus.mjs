#!/usr/bin/env node
/**
 * @module test/playwright/util/flickerCensus
 * @summary Position-independent flicker census for any video file: a flash is a boundary, and
 * boundaries show up as mean-abs frame-delta spikes regardless of WHERE on screen they happen —
 * no window geometry, no color keying. Built for the flicker-class isolation matrix (a number
 * per candidate fix, not an eyeball) and for take-night acceptance on raw `.mov`/`.webm` captures.
 *
 * Why delta energy and not color masks: capture pipelines soften saturated UI accents (a
 * 255,90,0 dot reads as ~200-230 red after screencapture), so color thresholds lie; delta has no
 * color to soften. Why median-relative and not absolute: a dark-themed app and a bright desktop
 * live in different energy classes, so the spike bar derives from the clip's own median
 * (`> max(absFloor, median × relFactor)`); absolute bars lie across content classes.
 *
 * Streams ffmpeg's rawvideo output and keeps ONE previous frame, so arbitrary clip lengths fit
 * memory (a one-off maxBuffer would not).
 *
 * Usage:
 *   node test/playwright/util/flickerCensus.mjs <video-file> [--scale 640x360] [--json]
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
 * Censuses a video file for flicker events.
 * @param {Object} options
 * @param {String} options.videoPath
 * @param {String} [options.scale='640:360'] downsample before analysis (speed; boundaries survive)
 * @param {Number} [options.absFloor=25] spike bar: absolute floor (mean-abs delta)
 * @param {Number} [options.relFactor=6] spike bar: multiple of the clip's median delta
 * @param {Number} [options.pairGapMax=2] spikes within this many frames fuse into one event
 * @returns {Promise<{events: Array<{startFrame: Number, endFrame: Number, startSec: Number, endSec: Number}>, spikes: Number[], medianDelta: Number, threshold: Number, frames: Number, fps: Number}>}
 */
export async function censusVideoFlicker({videoPath, scale = DEFAULT_SCALE, absFloor = ABS_FLOOR, relFactor = REL_FACTOR, pairGapMax = PAIR_GAP_MAX}) {
    const [w, h]    = scale.split(/[:x]/).map(Number),
          frameSize = w * h,
          fps       = probeFps(videoPath),
          deltas    = [];

    await new Promise((resolve, reject) => {
        const ff = spawn('ffmpeg', [
            '-loglevel', 'error', '-i', videoPath,
            '-vf', `scale=${w}:${h},format=gray`, '-f', 'rawvideo', '-'
        ]);

        let carry = Buffer.alloc(0),
            prev  = null;

        ff.stdout.on('data', chunk => {
            carry = carry.length === 0 ? chunk : Buffer.concat([carry, chunk]);

            while (carry.length >= frameSize) {
                const frame = carry.subarray(0, frameSize);

                carry = carry.subarray(frameSize);

                if (prev) {
                    let sum = 0;

                    // Every 7th byte: a 1/7 sample of the gray plane is a stable energy proxy
                    for (let i = 0; i < frameSize; i += 7) {
                        sum += Math.abs(frame[i] - prev[i])
                    }

                    deltas.push(sum / (frameSize / 7))
                }

                prev = Buffer.from(frame)
            }
        });

        ff.on('error', reject);
        ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
    });

    const sorted    = [...deltas].sort((a, b) => a - b),
          median    = sorted[Math.floor(sorted.length / 2)] ?? 0,
          threshold = Math.max(absFloor, median * relFactor),
          spikes    = [];

    deltas.forEach((delta, index) => {
        if (delta > threshold) spikes.push(index + 1) // +1: delta i compares frame i to frame i+1
    });

    const events = [];

    for (const spike of spikes) {
        const last = events[events.length - 1];

        if (last && spike - last.endFrame <= pairGapMax) {
            last.endFrame = spike
        } else {
            events.push({startFrame: spike, endFrame: spike})
        }
    }

    for (const event of events) {
        event.startSec = Number((event.startFrame / fps).toFixed(2));
        event.endSec   = Number((event.endFrame   / fps).toFixed(2))
    }

    return {events, spikes, medianDelta: Number(median.toFixed(2)), threshold, absFloor, relFactor, frames: deltas.length + 1, fps: Number(fps.toFixed(2))}
}

if (process.argv[1] && process.argv[1].endsWith('flickerCensus.mjs')) {
    const [videoPath] = process.argv.slice(2).filter(arg => !arg.startsWith('--'));

    if (!videoPath) {
        console.error('Usage: node test/playwright/util/flickerCensus.mjs <video-file> [--scale 640x360]');
        process.exit(1)
    }

    censusVideoFlicker({videoPath}).then(({events, spikes, medianDelta, threshold, frames, fps}) => {
        console.log(`frames=${frames} fps=${fps} medianDelta=${medianDelta} threshold=${threshold} spikes=${spikes.length} events=${events.length}`);
        for (const event of events) {
            console.log(`  event ${event.startSec}s–${event.endSec}s (frames ${event.startFrame}–${event.endFrame})`)
        }
    }).catch(error => {
        console.error(error.message);
        process.exit(1)
    })
}
