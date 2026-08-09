/**
 * @module ai/services/memory-core/helpers/recoveryOverrideStore
 * @summary Writes a validated knob transaction to the durable config overlay the target reads at boot.
 *
 * The overlay is a JSON file on a mount the writer owns read-write and the target owns read-only. That
 * asymmetry is doing two jobs: the target cannot rewrite the record of what was applied to it, and the
 * writer survives the target's death — if an override ever stops the target booting, the process that
 * wrote it can still revert it without the target running.
 *
 * Two rules make a write safe to hand to a boot path:
 *
 * **Validate before it lands.** The boot-time config guard fails fast on missing structure, so a
 * malformed overlay is not a silent no-op — it is a target that will not start. And a target that will
 * not start reads to a reactive controller as a fault, which lets one controller's actuation manufacture
 * another's trigger. Validation belongs here, where the closed set and its invariants are, rather than at
 * boot in a process that only has a fail-fast guard.
 *
 * **Write atomically.** A temporary sibling file renamed over the target, so a partial write is never
 * observable as configuration. An interrupted write must leave the previous overlay intact rather than a
 * truncated one.
 */
import {randomUUID} from 'node:crypto';

import fs   from 'fs/promises';
import path from 'path';

import {RECOVERY_KNOBS, knobRequiredContext, validateKnobTransaction} from './recoveryKnobRegistry.mjs';

/**
 * Filename of the durable overlay. Named so it cannot be mistaken for a deployment-state snapshot
 * written by another process on the same mount: a reader of that directory needs to know at a glance
 * which process owns a file and whether it is an observation or an instruction.
 * @type {String}
 */
export const RECOVERY_OVERRIDE_FILENAME = 'recovery-actuator-overrides.json';


/**
 * @summary Expands dotted leaf paths into the nested shape the config overlay is merged from.
 * @param {Object} values Values keyed by dotted leaf path.
 * @param {Object} [into={}] Existing overlay content to merge into.
 * @returns {Object}
 * @private
 */
function expandLeafPaths(values, into = {}) {
    const merged = structuredClone(into);

    for (const [leafPath, value] of Object.entries(values)) {
        const segments = leafPath.split('.');
        let   cursor   = merged;

        for (const segment of segments.slice(0, -1)) {
            // A non-object at an intermediate segment would silently swallow the write, so it is
            // replaced rather than merged into. The overlay is ours to own at these paths.
            if (!cursor[segment] || typeof cursor[segment] !== 'object' || Array.isArray(cursor[segment])) {
                cursor[segment] = {};
            }
            cursor = cursor[segment];
        }

        cursor[segments.at(-1)] = value;
    }

    return merged
}

/**
 * @summary Reads the current overlay, or an empty object when none exists yet.
 *
 * A malformed existing overlay throws rather than being silently replaced: overwriting a file we cannot
 * parse would discard operator or peer content we never read.
 * @param {String} overridePath
 * @param {Object} [fsModule=fs]
 * @returns {Promise<Object>}
 */
export async function readRecoveryOverrides(overridePath, fsModule = fs) {
    let raw;

    try {
        raw = await fsModule.readFile(overridePath, 'utf8')
    } catch (error) {
        if (error?.code === 'ENOENT') return {};
        throw error
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Recovery override file '${overridePath}' is not a JSON object`);
    }

    return parsed
}

/**
 * @summary Validates a knob transaction and writes it to the overlay atomically.
 *
 * Refuses — writing nothing — when the knob is unknown, the transaction violates the knob's bounds or
 * invariants, or any of the knob's leaves is pinned by an environment variable. The env case matters
 * because the config layer re-asserts the env layer after merging an overlay, so an env-pinned leaf
 * would accept the write and then discard it: a reported success over a value that never took effect.
 *
 * @param {Object} options
 * @param {String} options.knob Knob name from the closed set.
 * @param {Object} options.values Proposed values keyed by dotted leaf path.
 * @param {Object} options.context Resolved values for the knob's required context leaves.
 * @param {String} options.overrideDir Directory on the writer-owned mount.
 * @param {Object} [options.env=process.env] Environment to test leaf pinning against.
 * @param {Object} [options.fsModule=fs] Filesystem seam.
 * @param {Function|null} [options.isAuthorityHeld=null] Live authority oracle, re-asserted immediately
 *     before the durable write because the preparation above it awaits.
 * @returns {Promise<{applied: Boolean, path: String|null, violations: String[]}>}
 */
export async function writeKnobOverride({
    knob,
    values,
    context,
    overrideDir,
    env             = process.env,
    fsModule        = fs,
    isAuthorityHeld = null
} = {}) {
    const {valid, violations} = validateKnobTransaction({context, knob, values});

    if (!valid) return {applied: false, path: null, violations};

    // Env pinning is checked here rather than in the registry because it is a property of the RUNTIME
    // the write is aimed at, not of the knob. The same knob is writable on one seat and refused on
    // another, and only the writer knows which.
    const pinned = RECOVERY_KNOBS[knob].leaves
        .filter(leaf => env?.[leaf.env] !== undefined && env[leaf.env] !== '')
        .map(leaf => `'${leaf.path}' is pinned by ${leaf.env}; the env layer outranks this overlay, so the write would be discarded`);

    if (pinned.length > 0) return {applied: false, path: null, violations: pinned};

    const overridePath = path.join(overrideDir, RECOVERY_OVERRIDE_FILENAME),
          existing     = await readRecoveryOverrides(overridePath, fsModule),
          next         = expandLeafPaths(values, existing),
          // Same directory as the target, so the rename is within one filesystem and therefore atomic.
          // A temp file elsewhere would degrade to copy-then-delete and reintroduce the partial state
          // this exists to prevent.
          // GLOBALLY unique, not process-unique. The path began as `${overridePath}.${knob}.tmp`,
          // shared by every writer of that knob, so two holders writing at once used one scratch
          // file and whichever renamed second could publish a payload the other had half-written.
          //
          // A pid + per-module counter did not close it either: the counter restarts in every
          // independently initialized writer context, and two contexts inside one pid then collide
          // on the same name. A UUID has no such shared origin.
          tempPath     = `${overridePath}.${knob}.${randomUUID()}.tmp`;

    const assertHeld = () => {
        if (typeof isAuthorityHeld === 'function' && isAuthorityHeld() !== true) {
            const error = new Error(`Authority moved before the '${knob}' override write; refusing.`);

            error.reason = 'runtime-authority-lost';

            throw error;
        }
    };

    // Checked here because the yield is INSIDE this function — no caller can hold a check adjacent
    // to a write it does not itself perform — and a holder that has already lost authority should
    // not create directories or scratch files it has no right to.
    assertHeld();

    // The mount exists but its subdirectory may not on a plane that has never written one, and a
    // writer that requires someone else to have created its destination first is a boot-ordering
    // dependency wearing a filesystem error.
    await fsModule.mkdir(overrideDir, {recursive: true});

    // FRESH PROOF immediately before the scratch file exists. `mkdir` is awaited, so the assertion
    // above is already stale here — and a displaced holder should not be leaving files in a
    // successor's directory at all, even inert ones.
    assertHeld();

    await fsModule.writeFile(tempPath, `${JSON.stringify(next, null, 4)}\n`, {mode: 0o644});

    // AND AGAIN IMMEDIATELY BEFORE THE COMMIT. This is the only check that binds the effect: `mkdir`
    // and `writeFile` are both awaited, so the assertion above is already stale here, and the rename
    // is the instant the overlay becomes configuration the next converge applies. A scratch file
    // left by a refusal is inert; a renamed one is an instruction.
    try {
        assertHeld();
    } catch (error) {
        // The scratch file is ours, and a refusal must not leave one behind to accumulate on every
        // takeover.
        await fsModule.rm?.(tempPath, {force: true});
        throw error;
    }

    await fsModule.rename(tempPath, overridePath);

    return {applied: true, path: overridePath, violations: []}
}

/**
 * @summary The context leaves a caller must resolve before a knob can be written.
 *
 * Re-exported from the registry so a caller that only writes overrides needs one import rather than
 * two, and so adding a bound to a knob never widens a writer's import surface.
 * @param {String} knob
 * @returns {String[]}
 */
export function requiredContextForKnob(knob) {
    return knobRequiredContext(knob)
}
