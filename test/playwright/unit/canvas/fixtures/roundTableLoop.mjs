import {setup}   from '../../../setup.mjs';
import Neo       from '../../../../../src/Neo.mjs';
import * as core from '../../../../../src/core/_export.mjs';

setup();

const [scheduler, scenario] = process.argv.slice(2), pending = new Map();
let   nextId                = 0, now = 1000;

/** @summary Owns one pending callback, including the valid handle zero. @param {Function} callback @returns {Number} */
const schedule = callback => {
    const id = nextId++;
    pending.set(id, callback);
    return id
};
if (scheduler === 'raf') {
    globalThis.requestAnimationFrame = schedule;
    globalThis.cancelAnimationFrame = id => pending.delete(id)
}

// hasRaf is selected on import. Let ordinary Neo readiness finish before replacing Node timers.
const {default: renderer} = await import('../../../../../src/canvas/RoundTable.mjs');
await renderer.ready();
globalThis.setTimeout = schedule;
globalThis.clearTimeout = id => pending.delete(id);
Object.defineProperty(performance, 'now', {value: () => now});

// Rendering is the scheduling boundary's dependency: count draws without needing a browser's 2d context.
renderer.draw = () => renderer.frames++;

/** @summary Mounts the minimum live scene; the actual renderer owns all scheduling. */
function mount() {
    renderer.context = {};
    renderer.canvasSize = {height: 842, width: 1440};
    renderer.indexed = {minutes: 1440};
    renderer.place = {};
    renderer.still = false;
    renderer.render()
}

/** @summary Runs only this tick's callbacks, respecting cancellation by another callback. @returns {Number} */
function tick() {
    const before = renderer.frames;
    now += 16;
    for (const [id, callback] of [...pending]) {
        if (pending.delete(id)) callback(now)
    }
    return renderer.frames - before
}

mount();
const result = {pending: [], suspended: []};
if (scenario === 'pause-resume') {
    for (let i = 0; i < 3; i++) {
        renderer.pause();
        result.suspended.push(pending.size);
        renderer.resume();
        result.pending.push(pending.size)
    }
} else if (scenario === 'motion') {
    for (let i = 0; i < 3; i++) {
        renderer.setMotion({still: true});
        result.suspended.push(pending.size);
        renderer.setMotion({still: false});
        result.pending.push(pending.size)
    }
} else if (scenario === 'retire') {
    renderer.clearGraph();
    result.suspended.push(pending.size);
    mount();
    result.pending.push(pending.size)
} else if (scenario === 'refresh') {
    const before = renderer.frames;
    renderer.refresh();
    result.inputDraws = renderer.frames - before;
    result.pending.push(pending.size)
} else if (scenario === 'direct-render') {
    renderer.render();
    result.pending.push(pending.size)
} else if (scenario === 'still-input') {
    renderer.setMotion({still: true});
    const before = renderer.frames;
    renderer.refresh();
    result.inputDraws = renderer.frames - before;
    result.pending.push(pending.size)
} else if (scenario === 'paused-input') {
    renderer.pause();
    const before = renderer.frames;
    renderer.refresh();
    result.inputDraws = renderer.frames - before;
    result.suspended.push(pending.size)
} else if (scenario === 'resume-control') {
    renderer.resume();
    renderer.resume();
    result.pending.push(pending.size)
} else {
    throw new Error(`Unknown scheduling scenario: ${scenario}`)
}

const clock = renderer.clock;
result.draws = Array.from({length: 5}, tick);
result.clockAdvanced = renderer.clock > clock;
result.remaining = pending.size;
console.log(JSON.stringify(result));
