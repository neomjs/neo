/**
 * @module harness/preloadEsmProbeOutcome
 * @summary Classifies the real Electron sandboxed-ESM preload probe without importing Electron,
 * so every supported, blocked, unexpected, and inconclusive outcome stays unit-testable.
 */

export const EXPECTED_SANDBOXED_ESM_ERROR = 'Cannot use import statement outside a module';
export const PRELOAD_ESM_PROBE_MARKER      = '__neoSandboxedEsmPreloadProbe';

const CONVERSION_STEPS = [
    'rename preload.cjs to preload.mjs',
    'replace require(\'electron\') with ESM imports',
    'replace the forced ADAPTER_STATES duplication with an adapterWitness.mjs import and delete its drift guard in adapterWitness.spec.mjs',
    'repoint main.mjs, electron-builder.yml, and preload.spec.mjs',
    'update the harness row in learn/benefits/ArchitectureOverview.md',
    'record the resolved constraint in ADR-0034'
].join('; ');

/**
 * @summary Converts one runtime observation into the self-notifying preload-conversion verdict.
 *
 * Exactly one known state passes: the pinned runtime rejects the ESM preload with Electron's
 * documented sandbox error. Support, contradictory evidence, timeouts, silence, and new failure
 * modes all fail so upstream capability changes cannot hide behind an inconclusive result.
 * @param {Object} observation
 * @param {String[]} [observation.errors=[]]
 * @param {Boolean} [observation.markerLoaded=false]
 * @param {Boolean} [observation.timedOut=false]
 * @returns {{message: String, ok: Boolean, status: String}}
 */
export function classifyPreloadEsmProbe({errors = [], markerLoaded = false, timedOut = false} = {}) {
    const messages = errors.map(error => String(error));

    if (timedOut) {
        return {
            message: 'Sandboxed ESM preload probe timed out; the result is inconclusive and fails closed.',
            ok     : false,
            status : 'inconclusive'
        }
    }

    if (markerLoaded && messages.length > 0) {
        return {
            message: `Sandboxed ESM preload probe observed both a loaded marker and errors (${messages.join(' | ')}); contradictory evidence fails closed.`,
            ok     : false,
            status : 'contradictory'
        }
    }

    if (markerLoaded) {
        return {
            message: `Electron now supports ESM imports in sandboxed preloads. #16036 conversion is unblocked: ${CONVERSION_STEPS}.`,
            ok     : false,
            status : 'support-detected'
        }
    }

    if (messages.length === 1 && messages[0].includes(EXPECTED_SANDBOXED_ESM_ERROR)) {
        return {
            message: `Constraint confirmed: sandboxed ESM preload rejected with "${EXPECTED_SANDBOXED_ESM_ERROR}".`,
            ok     : true,
            status : 'constraint-confirmed'
        }
    }

    if (messages.length > 0) {
        return {
            message: `Sandboxed ESM preload probe produced unexpected error(s): ${messages.join(' | ')}. Expected "${EXPECTED_SANDBOXED_ESM_ERROR}"; failing closed.`,
            ok     : false,
            status : 'unexpected-error'
        }
    }

    return {
        message: 'Sandboxed ESM preload probe produced neither the loaded marker nor the expected rejection; inconclusive and failing closed.',
        ok     : false,
        status : 'inconclusive'
    }
}
