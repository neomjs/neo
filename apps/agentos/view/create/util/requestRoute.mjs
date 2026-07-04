import {validateBlueprint} from './blueprintSchema.mjs';

/**
 * @module AgentOS.view.create.util.requestRoute
 * @summary The keeper request→blueprint route — the creation pipeline's spine, view-free.
 *
 * Accepts a natural-language creation request, calls the INJECTED agent boundary to produce a
 * candidate blueprint, and emit-validates it through the one shared validator before anything
 * reaches instantiation. The agent boundary is a parameter (not an import) so the route is fully
 * testable without a live agent and the NL/provider wiring stays a separate leaf's concern.
 *
 * Refusals are data, never exceptions: every failure path — empty request, over-long request,
 * boundary error, invalid blueprint — returns a bounded `{accepted: false, reason, stage}` the
 * chat surface renders as the honest-refusal state. The agent sees the same reason and can
 * self-correct on the next attempt (the emit-side half of the fail-closed-both-sides contract).
 */

/**
 * @summary Upper bound on accepted request length — a creation request is a sentence or a
 * paragraph, never a document; oversized input is refused, not truncated (truncation silently
 * changes intent).
 * @type {Number}
 */
export const MAX_REQUEST_LENGTH = 2000;

/**
 * @summary The route's failure stages, so callers and tests can assert WHERE a refusal happened
 * without parsing prose.
 * @type {Object}
 */
export const ROUTE_STAGES = Object.freeze({
    BOUNDARY  : 'boundary',
    REQUEST   : 'request',
    VALIDATION: 'validation'
});

/**
 * @summary Routes one creation request to a validated blueprint via the injected agent boundary.
 *
 * @param {Object}   options
 * @param {String}   options.request  The user's natural-language creation request
 * @param {Function} options.generate Async agent boundary: `(request) => candidate blueprint`.
 *   Injected by the caller (the NL wiring leaf provides the live one; tests provide doubles).
 * @returns {Promise<{accepted: Boolean, blueprint: Object|null, reason: String|null, stage: String|null}>}
 */
export async function routeCreationRequest({request, generate}) {
    if (typeof request !== 'string' || request.trim() === '') {
        return {accepted: false, blueprint: null, reason: 'creation request must be a non-empty string', stage: ROUTE_STAGES.REQUEST};
    }

    if (request.length > MAX_REQUEST_LENGTH) {
        return {accepted: false, blueprint: null, reason: `creation request exceeds ${MAX_REQUEST_LENGTH} characters — refused, not truncated`, stage: ROUTE_STAGES.REQUEST};
    }

    if (typeof generate !== 'function') {
        return {accepted: false, blueprint: null, reason: 'no agent boundary injected — the route never imports a provider directly', stage: ROUTE_STAGES.BOUNDARY};
    }

    let candidate;

    try {
        candidate = await generate(request.trim());
    } catch (error) {
        return {
            accepted : false,
            blueprint: null,
            reason   : `agent boundary failed: ${error instanceof Error ? error.message : String(error)}`,
            stage    : ROUTE_STAGES.BOUNDARY
        };
    }

    const {accepted, reason} = validateBlueprint(candidate);

    if (!accepted) {
        return {accepted: false, blueprint: null, reason, stage: ROUTE_STAGES.VALIDATION};
    }

    return {accepted: true, blueprint: candidate, reason: null, stage: null};
}
