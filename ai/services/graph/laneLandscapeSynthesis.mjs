/**
 * @module ai/services/graph/laneLandscapeSynthesis
 * @summary The landscape-framed cited synthesis for the current-state lane-landscape Bird View.
 *
 * The historical Bird Views synthesize a WINDOW ("what happened this week"); this one synthesizes the
 * CURRENT STRUCTURE ("what does the lane landscape look like right now"). That difference is why the
 * window-framed prompt cannot be reused: its every seam carries a resolved `[windowStart, windowEnd)`,
 * and stamping a synthetic window onto a current-state answer would assert a bound the answer never
 * had. So this is a second PROMPT, never a second synthesizer — the fidelity rules below are the same
 * ones the temporal path enforces: cite by id, use only what is provided, never invent.
 *
 * Two rules are specific to this surface and load-bearing:
 * 1. **Describe, never rank or assign.** Ranking is the Computed Golden Path's authority; assignment is
 *    a peer's. A landscape that ordered lanes by importance would quietly become a second scorer.
 * 2. **Unknown stays unknown.** A degraded census must not be narrated into a confident picture — the
 *    caller withholds the narrative entirely on a coverage gap rather than serving a partial structure
 *    as the whole one.
 */

/**
 * @summary Returns the ids the prompt actually enumerates, so a caller can report which facts reached
 * inference rather than implying the whole census did.
 *
 * Every id the prompt names is an id the model may legitimately cite, so the set must cover the
 * *related* items too — an epic's open children and a blocked item's blockers are enumerated as facts,
 * not just referenced counts. Reporting only the entry ids would under-report the evidence that reached
 * inference, and a consumer auditing the narrative against this list would read a grounded mention of a
 * child or blocker as ungrounded.
 * @param {Object} [landscape={}] A {@link module:ai/services/graph/laneLandscapeProjection} landscape.
 * @returns {String[]} Stable-ordered ids present in the prompt.
 */
export function selectLandscapeSynthesisInputIds(landscape = {}) {
    const goal     = landscape?.goalTrajectory || [],
          blocked  = landscape?.dependencyPath || [],
          goalIds  = goal.flatMap(entry => [entry.id, ...(entry.openChildren || [])]),
          blockIds = blocked.flatMap(entry => [entry.id, ...(entry.blockedBy || [])]),
          openIds  = landscape?.authorityCoverage?.unassignedIds || [];

    return [...new Set([...goalIds, ...blockIds, ...openIds])].filter(Boolean).sort()
}

/**
 * @summary Builds the pure landscape-framed synthesis prompt. Enumerates the projected structure as
 * facts so the narrative is grounded in evidence actually present in the prompt — a count alone would
 * let the model invent the shape it is describing.
 * @param {Object} params
 * @param {Object} params.landscape A projected current-state landscape.
 * @returns {String} The prompt.
 */
/**
 * @summary Renders a census count for the prompt, keeping "I could not look" distinct from "zero".
 *
 * A degraded census reports `null` counts because a total is a completeness claim it cannot make.
 * Rendering that as `0` would hand a model a fabricated fact in the one section of the prompt it is
 * told to treat as ground truth ("use ONLY the structure above"), and the model has no way to tell
 * an absent measurement from a measured absence. The word does what the `null` does: it cannot be
 * read as a quantity.
 *
 * @param {Number|null|undefined} value A census count, or `null` when the census was degraded.
 * @returns {String|Number} The count, or an explicit unknown marker.
 */
function countForPrompt(value) {
    return typeof value === 'number' ? value : 'unknown (census degraded — not zero)'
}

export function buildLaneLandscapeSynthesisPrompt({landscape} = {}) {
    const goal      = landscape?.goalTrajectory || [],
          blocked   = landscape?.dependencyPath || [],
          authority = landscape?.authorityCoverage || {},
          coverage  = landscape?.coverage || {};

    const goalLines = goal.length > 0
        ? goal.map(entry => `- ${entry.id}: ${entry.openChildren.length} open child/children (${entry.openChildren.join(', ') || 'none'})`)
        : ['- none'];

    const blockedLines = blocked.length > 0
        ? blocked.map(entry => `- ${entry.id}: blocked by ${entry.blockedBy.join(', ')}`)
        : ['- none'];

    return [
        'You are describing the CURRENT lane landscape of a software organism — its structure right now,',
        `captured at ${landscape?.capturedAt}. This is not a history: do not narrate change over time.`,
        '',
        'GOAL TRAJECTORY (open epics and their open children):',
        ...goalLines,
        '',
        'DEPENDENCY / CRITICAL PATH (open items blocked by other open items):',
        ...blockedLines,
        '',
        'AUTHORITY COVERAGE:',
        // `?? 0` here would be the projection's own defect one layer lower and pointed at a MODEL:
        // a degraded census now reports `null` counts (a total is a completeness claim it cannot
        // make), and coercing that to `0` would write "assigned: 0" into a prompt as fact. The
        // caller skips synthesis entirely while degraded, so this is unreachable through
        // `exploreLaneLandscape` — but the builder is exported and its spec calls it directly, so
        // the honest rendering is what belongs here rather than a default that only stays correct
        // while an upstream guard holds.
        `- assigned: ${countForPrompt(authority.assignedCount)}`,
        `- unassigned: ${countForPrompt(authority.unassignedCount)}${(authority.unassignedIds || []).length > 0 ? ` (${authority.unassignedIds.join(', ')})` : ''}`,
        '',
        'CENSUS COVERAGE:',
        `- total open items: ${countForPrompt(coverage.totalOpenItems)}`,
        `- relation edges: ${coverage.edgeCount ?? 0}`,
        '',
        'Write a concise structural description across three dimensions: goal trajectory, dependency /',
        'critical path, and authority coverage. Cite items by id inline. Use ONLY the structure above —',
        'do not invent items, edges, or owners, and do not draw on outside knowledge. Where the structure',
        'does not say something, say it is unknown rather than inferring it.',
        '',
        'Describe the structure; do NOT rank the lanes by importance, recommend what to work on next, or',
        'suggest who should own anything. Ranking and assignment are other surfaces\' authority.'
    ].join('\n')
}

/**
 * @summary Binds the injected `generate` into a landscape synthesizer.
 *
 * Fail-loud on a missing dep or an empty narrative: a silent empty string would render as an
 * authoritative-looking blank description rather than an honest absence.
 *
 * @param {Object}   params
 * @param {Function} params.generate The LLM call — `async ({prompt}) => string | {content}`.
 * @returns {Function} `async ({landscape}) => {narrative, inferenceInputIds}`
 * @throws {Error} When `generate` is missing.
 */
export function makeLaneLandscapeSynthesize({generate} = {}) {
    if (typeof generate !== 'function') {
        throw new Error('makeLaneLandscapeSynthesize: an injected `generate` function is required')
    }

    return async function synthesize({landscape} = {}) {
        const prompt    = buildLaneLandscapeSynthesisPrompt({landscape}),
              result    = await generate({prompt}),
              narrative = typeof result === 'string' ? result : result?.content;

        if (typeof narrative !== 'string' || narrative.length === 0) {
            throw new Error('lane landscape synthesis produced no narrative')
        }

        return {narrative, inferenceInputIds: selectLandscapeSynthesisInputIds(landscape)}
    }
}
