/**
 * @module Neo.ai.client.gestureTrace
 * @summary Validates target-relative gesture traces before Engine input leaves the App Worker.
 */

export const gestureLimits = Object.freeze({contacts: 10, durationMs: 30000, events: 240, frames: 120});

// Apply arrivals before releases in a mixed frame so a same-time contact replacement does not
// manufacture an empty sequence. Changes of the same kind share one native TouchEvent.
const eventTypes = Object.freeze({down: 'touchstart', move: 'touchmove', up: 'touchend', cancel: 'touchcancel'});

/**
 * @summary Checks one absolute coordinate pair in the target's CSS pixel space.
 * @param {Object} point
 * @param {String} name
 * @returns {{x: Number, y: Number}}
 */
function readPoint(point, name) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
        throw new TypeError(`${name} needs finite x and y coordinates`)
    }

    return {x: point.x, y: point.y}
}

/**
 * @summary Expands a readable preset using the same frame and contact vocabulary as explicit input.
 * @param {Object} preset
 * @returns {Object[]}
 */
function expandPreset(preset) {
    const {kind, durationMs = 350, steps = 8} = preset ?? {};

    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > gestureLimits.durationMs) {
        throw new TypeError('preset durationMs must be positive and within the gesture duration limit')
    }

    if (kind === 'hold') {
        const point = readPoint(preset.at, 'preset.at');

        return [
            {t: 0,          contacts: [{...point, id: 'A', state: 'down'}]},
            {t: durationMs, contacts: [{...point, id: 'A', state: 'up'}]}
        ]
    }

    if (!Number.isInteger(steps) || steps < 1 || steps + 2 > gestureLimits.frames) {
        throw new TypeError('preset steps must fit within the gesture frame limit')
    }

    let points;

    if (kind === 'swipe') {
        const from = readPoint(preset.from, 'preset.from'),
              to   = readPoint(preset.to, 'preset.to');

        points = progress => [{id: 'A', x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress}]
    } else if (kind === 'pinch' || kind === 'rotate') {
        const center = readPoint(preset.center, 'preset.center'),
              rotate = kind === 'rotate',
              start  = rotate ? preset.radius : preset.fromRadius,
              end    = rotate ? start : preset.toRadius,
              angle  = rotate ? preset.degrees * Math.PI / 180 : 0;

        if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0 || (rotate && !Number.isFinite(preset.degrees)) || !Number.isFinite(angle)) {
            throw new TypeError('a transform preset needs positive radii and a finite angle')
        }

        points = progress => {
            const radius = start + (end - start) * progress,
                  x      = radius * Math.cos(angle * progress),
                  y      = radius * Math.sin(angle * progress);

            return [{id: 'A', x: center.x - x, y: center.y - y}, {id: 'B', x: center.x + x, y: center.y + y}]
        }
    } else {
        throw new TypeError('preset kind must be hold, swipe, pinch, or rotate')
    }

    return Array.from({length: steps + 2}, (_, index) => {
        const progress = Math.min(1, index / steps),
              state    = index === 0 ? 'down' : index > steps ? 'up' : 'move';

        return {t: durationMs * progress, contacts: points(progress).map(point => ({...point, state}))}
    })
}

/**
 * @summary Compiles changed-contact snapshots into window-local dispatch groups.
 * Unmentioned contacts keep their previous coordinates. Empty frames wait without dispatch.
 * @param {Object} request
 * @returns {Object}
 */
export function normalizeGestureRequest(request) {
    const {provider, target, windowId, preset, frames: input, timeoutMs} = request ?? {};

    if (provider !== 'engine' && provider !== 'browser') {
        throw new TypeError('provider must be engine or browser')
    }

    if (typeof target !== 'string' || !target.trim() || typeof windowId !== 'string' || !windowId.trim()) {
        throw new TypeError('target and windowId must be non-empty strings')
    }

    if ((input === undefined) === (preset === undefined)) {
        throw new TypeError('provide either frames or a preset')
    }

    const frames = input === undefined ? expandPreset(preset) : input;

    if (!Array.isArray(frames) || !frames.length || frames.length > gestureLimits.frames) {
        throw new TypeError('frames must be a non-empty array within the gesture frame limit')
    }

    const active     = new Map(), identifiers = new Map();
    let   eventCount = 0, previousTime = 0, sequenceCancelled = false;

    const plan = Array.from(frames, (frame, index) => {
        const label         = `frames[${index}]`,
              {t, contacts} = frame ?? {};

        if (!Number.isFinite(t) || t < previousTime || t > gestureLimits.durationMs || (index === 0 && t !== 0)) {
            throw new TypeError(`${label}.t must start at zero and stay ordered within the duration limit`)
        }

        if (!Array.isArray(contacts) || contacts.length > gestureLimits.contacts) {
            throw new TypeError(`${label}.contacts must be an array within the contact limit`)
        }

        previousTime = t;

        const groups = new Map(), seen = new Set(), events = [];

        for (const contact of contacts) {
            const {id, state} = contact ?? {},
                  validId     = Number.isSafeInteger(id) || (typeof id === 'string' && id.trim() && id.length <= 128);

            if (!validId || seen.has(id) || typeof state !== 'string' || !Object.hasOwn(eventTypes, state) || active.has(id) === (state === 'down')) {
                throw new TypeError(`${label} contains a duplicate label or invalid contact transition`)
            }

            const point = readPoint(contact, `${label}.contacts`);

            seen.add(id);
            if (!identifiers.has(id)) {
                identifiers.set(id, identifiers.size + 1)
            }

            if (!groups.has(state)) {
                groups.set(state, [])
            }

            groups.get(state).push({...point, id, identifier: identifiers.get(id)})
        }

        for (const [state, type] of Object.entries(eventTypes)) {
            const changed = groups.get(state);

            if (!changed) {
                continue
            }

            for (const point of changed) {
                if (state === 'up' || state === 'cancel') {
                    active.delete(point.id)
                } else {
                    active.set(point.id, point)
                }
            }

            if (++eventCount > gestureLimits.events || active.size > gestureLimits.contacts) {
                throw new TypeError(`${label} exceeds the gesture contact or dispatch limit`)
            }

            sequenceCancelled ||= state === 'cancel';

            const terminal = active.size ? null : sequenceCancelled ? 'cancel' : 'end';

            events.push({active: [...active.values()], changed, terminal, type});

            if (terminal) {
                sequenceCancelled = false
            }
        }

        return {t, events}
    });

    if (!eventCount || active.size) {
        throw new TypeError('the trace must contain input and release or cancel every contact')
    }

    if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > gestureLimits.durationMs + 1000)) {
        throw new TypeError('timeoutMs must be positive and within the gesture execution limit')
    }

    return {frames: plan, provider, target, timeoutMs: timeoutMs ?? previousTime + 1000, windowId}
}
