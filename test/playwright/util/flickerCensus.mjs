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
 *
 * Time contract: `times` (source PTS seconds, one per frame) is the native-time path — spike
 * timestamps read from it, and event fusion applies the ~0.1s human read in ELAPSED source time.
 * Without `times`, timestamps derive from index/fps (valid only for true-CFR sources) and fusion
 * uses `pairGapMax` frames. A VFR source fed through the fps fallback reports fictitious time —
 * the media adapter exists to never let that happen silently.
 * @param {Object} options
 * @param {Buffer[]|AsyncIterable<Buffer>|Iterable<Buffer>} options.frames gray frames, width×height bytes each
 * @param {Number} options.width
 * @param {Number} options.height
 * @param {Number} options.fps source cadence — timestamps derive from it only when `times` is absent
 * @param {Number[]} [options.times] source PTS seconds per frame (native-time path)
 * @param {Number} [options.absFloor=25] spike bar: absolute floor (mean-abs delta)
 * @param {Number} [options.relFactor=6] spike bar: multiple of the clip's median delta
 * @param {Number} [options.pairGapSec=0.1] fusion window in elapsed source seconds (native-time path)
 * @param {Number} [options.pairGapMax=5] fusion window in frames (fps-fallback path only)
 * @returns {{events: Array, spikes: Array<{frame: Number, sec: Number, delta: Number}>, medianDelta: Number, threshold: Number, absFloor: Number, relFactor: Number, frames: Number, fps: Number, nativeTime: Boolean}}
 */
export async function detectFlickerFrames({frames, width, height, fps, times = null, absFloor = ABS_FLOOR, relFactor = REL_FACTOR, pairGapSec = 0.1, pairGapMax = PAIR_GAP_MAX}) {
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

    if (times && times.length !== deltas.length + 1) {
        throw new Error(`detectFlickerFrames: times length ${times.length} ≠ frame count ${deltas.length + 1}`)
    }

    const sorted    = [...deltas].sort((a, b) => a - b),
          median    = sorted[Math.floor(sorted.length / 2)] ?? 0,
          threshold = Math.max(absFloor, median * relFactor),
          secOf     = index => times ? times[index] : index / fps,
          spikes    = [];

    deltas.forEach((delta, index) => {
        // Spike at frame (index + 1): delta i compares frame i to frame i+1. Magnitude and
        // timestamp ride every spike — an unpaired spike is a fact, not noise.
        if (delta > threshold) {
            spikes.push({frame: index + 1, sec: Number(secOf(index + 1).toFixed(2)), delta: Number(delta.toFixed(1))})
        }
    });

    // The ~0.1s human read: a VIEW over the spike list, never a filter on it. Elapsed source
    // time when native time is present; frame distance only on the fps-fallback path.
    const events = [];

    for (const spike of spikes) {
        const last = events[events.length - 1],
              fuse = last && (times
                  ? spike.sec - last.startSec <= pairGapSec
                  : spike.frame - last.endFrame <= pairGapMax);

        if (fuse) {
            last.endFrame = spike.frame;
            last.endSec   = spike.sec
        } else {
            events.push({startFrame: spike.frame, endFrame: spike.frame, startSec: spike.sec, endSec: spike.sec})
        }
    }

    return {events, spikes, medianDelta: Number(median.toFixed(2)), threshold, absFloor, relFactor, frames: deltas.length + 1, fps, nativeTime: Boolean(times)}
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
 * The raw-file adapter: reads rawvideo gray straight from disk (the spec-fixture format). Needs
 * NO ffmpeg anywhere in the path — this is the CI-owned adapter contract.
 * @param {Object} options
 * @param {String} options.filePath raw gray video (width×height bytes per frame, back to back)
 * @param {Number} options.width
 * @param {Number} options.height
 * @param {Number} options.fps source cadence of the raw file
 * @param {Number[]} [options.times] source PTS seconds per frame (native-time path)
 * @returns {Promise<Object>} the detector's result
 */
export async function censusRawGrayFile({filePath, width, height, fps, times = null, ...detectorOptions}) {
    const fs = await import('node:fs');

    async function* read() {
        const frameSize = width * height,
              handle    = await fs.promises.open(filePath, 'r');

        try {
            let carry = Buffer.alloc(0);

            for await (const chunk of handle.createReadStream()) {
                carry = carry.length === 0 ? chunk : Buffer.concat([carry, chunk]);

                while (carry.length >= frameSize) {
                    yield carry.subarray(0, frameSize);
                    carry = carry.subarray(frameSize)
                }
            }
        } finally {
            await handle.close()
        }
    }

    return detectFlickerFrames({frames: read(), width, height, fps, times, ...detectorOptions})
}

/**
 * The ffmpeg media adapter: decodes a video file at NATIVE cadence (never synthesized) and feeds
 * the detector with real source PTS. `-fps_mode passthrough` forbids frame duplication/dropping
 * (ffmpeg's default would resample a VFR source to a constant rate and stretch time with it);
 * `showinfo` prints each decoded frame's pts_time to stderr in the same order the rawvideo stdout
 * carries the pixels, so timestamps come from the source, not from one average rate.
 * @param {Object} options
 * @param {String} options.videoPath
 * @param {String} [options.scale='640:360'] downsample before analysis (speed; boundaries survive)
 * @returns {Promise<Object>} the detector's result (nativeTime: true)
 */
export async function censusVideoFlicker({videoPath, scale = DEFAULT_SCALE, ...detectorOptions}) {
    const [w, h]    = scale.split(/[:x]/).map(Number),
          frameSize = w * h,
          times     = [];

    async function* decode() {
        // showinfo prints at info level; keep ffmpeg's own chatter out of the PTS parse by
        // matching only the pts_time field on that stream.
        const ff = spawn('ffmpeg', [
            '-hide_banner', '-loglevel', 'info', '-i', videoPath,
            '-fps_mode', 'passthrough',
            '-vf', `showinfo,scale=${w}:${h},format=gray`, '-f', 'rawvideo', '-'
        ]);

        let carry    = Buffer.alloc(0),
            errTail  = '',
            consumed = 0;

        ff.stderr.on('data', chunk => {
            errTail += chunk;

            // Parse COMPLETE lines once (offset-tracked, never re-matched): showinfo prints
            // per frame in decode order, so the Nth pts_time pairs the Nth stdout frame.
            let newlineAt;

            while ((newlineAt = errTail.indexOf('\n', consumed)) !== -1) {
                const pts = errTail.slice(consumed, newlineAt).match(/pts_time:([\d.]+)/);

                if (pts) times.push(Number(pts[1]));

                consumed = newlineAt + 1
            }

            if (errTail.length > 8192) {
                // Drop the fully-parsed prefix; an incomplete line straddling the boundary parses next chunk.
                errTail  = errTail.slice(consumed);
                consumed = 0
            }
        });

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

    // The detector reads `times` after the frame stream ends (spikes compute post-loop), so the
    // shared array must be complete by then — a shortfall means the PTS parse lost frames, and
    // the detector fails LOUD on the length check rather than silently degrading to fps time.
    return detectFlickerFrames({frames: decode(), width: w, height: h, fps: probeFps(videoPath),
        times, ...detectorOptions})
}

if (process.argv[1] && process.argv[1].endsWith('flickerCensus.mjs')) {
    const args      = process.argv.slice(2),
          scaleAt   = args.indexOf('--scale'),
          scale     = scaleAt !== -1 && args[scaleAt + 1] ? args[scaleAt + 1] : DEFAULT_SCALE,
          videoPath = args.find((arg, index) => !arg.startsWith('--') && (scaleAt === -1 || index !== scaleAt + 1));

    if (!videoPath) {
        console.error('Usage: node test/playwright/util/flickerCensus.mjs <video-file> [--scale 640x360]');
        process.exit(1)
    }

    censusVideoFlicker({videoPath, scale}).then(({events, spikes, medianDelta, threshold, frames, fps}) => {
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
