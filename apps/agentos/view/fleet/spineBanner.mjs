/**
 * @module apps/agentos/view/fleet/spineBanner
 * @summary The cockpit's per-SPINE honesty line: derives ONE shell-level status from the
 * owner-held adapter states, so the surface names WHY it shows sample or last-known data
 * instead of failing silent. Render-only over existing truth — this module produces no probes.
 *
 * Precedence: `sample` (the spine is unreachable — cold) beats `stale` (reachable but degraded)
 * beats `live`. A fully live spine renders NOTHING — nominal earns zero pixels, the same
 * exception-based discipline the cards follow. Per-AGENT truth (wake/throttle telltales) is a
 * different surface; this line only speaks for the fleet transport itself.
 */

/**
 * @summary Derives the spine banner from the two owner-held adapter states.
 * @param {Object} options
 * @param {String} options.gridAdapterState   `'sample'|'stale'|'live'` — the roster surface truth.
 * @param {String} options.streamAdapterState `'sample'|'stale'|'live'` — the activity surface truth.
 * @returns {{hidden: Boolean, kind: String, text: String}} `kind` is `'live'|'cold'|'degraded'`
 *     — the class hook; `hidden` is `true` only for the fully live spine.
 */
export function deriveSpineBanner({gridAdapterState, streamAdapterState}) {
    const states = [gridAdapterState, streamAdapterState];

    if (states.includes('sample')) {
        return {
            hidden: false,
            kind  : 'cold',
            text  : 'Fleet server offline — showing sample data · start it: npm run cockpit'
        }
    }

    if (states.includes('stale')) {
        return {
            hidden: false,
            kind  : 'degraded',
            text  : 'Fleet feed degraded — showing last-known data'
        }
    }

    return {hidden: true, kind: 'live', text: ''}
}

export default deriveSpineBanner;
