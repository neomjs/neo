/**
 * Pure parser that extracts the structured turn-terminal `lane-state` descriptor from an agent's
 * final transcript text, for the Stop-hook seam: `transcriptText → descriptor → validateLaneStateTerminal`.
 *
 * The emission convention is a fenced ```lane-state code block holding the descriptor as JSON (the
 * human-readable `lane-state:` prose line remains, but the MACHINE seam is the block). This parser is
 * deliberately continuation-set-agnostic — it extracts whatever the block declares; the lane-state
 * RULES live in `validateLaneStateTerminal`, so a change to the valid continuation set never touches
 * the parser.
 *
 * Three outcomes the hook distinguishes:
 *  - a well-formed block  → the descriptor object;
 *  - NO block present     → `null` (the "absent emission" case);
 *  - a block with broken JSON → it THROWS (a present-but-malformed emission is a distinct failure from absent).
 *
 * @module Neo.ai.scripts.lifecycle.parseLaneState
 * @plane in-plane
 */

/**
 * Matches a fenced ```lane-state block, capturing its inner body. Global so the LAST block wins
 * (an agent's true terminal claim is its final block, not an earlier illustrative one).
 * @type {RegExp}
 */
export const LANE_STATE_BLOCK = /```lane-state\s*\r?\n([\s\S]*?)\r?\n```/g;

/**
 * @summary Parses the last fenced ```lane-state block from transcript text into a lane-state descriptor.
 *
 * @param {String} transcriptText The agent's final turn-terminal message text (or the transcript tail).
 * @returns {Object|null} The descriptor `{wakeDisposition, laneContinuation, namedGates, awaitingOwnPrOnly}`
 *   normalized from the LAST ```lane-state block, or `null` when no block is present.
 * @throws {Error} When a ```lane-state block IS present but its body is not valid JSON — a
 *   present-but-malformed emission is a distinct failure the hook logs separately from an absent one.
 */
export function parseLaneState(transcriptText) {
    if (typeof transcriptText !== 'string') {
        return null;
    }

    let lastBody = null;
    for (const match of transcriptText.matchAll(LANE_STATE_BLOCK)) {
        lastBody = match[1];
    }

    if (lastBody === null) {
        return null;
    }

    let parsed;
    try {
        parsed = JSON.parse(lastBody);
    } catch (cause) {
        throw new Error(`parseLaneState: a \`\`\`lane-state block was present but its body is not valid JSON: ${cause.message}`, {cause});
    }

    return {
        wakeDisposition  : parsed.wakeDisposition,
        laneContinuation : parsed.laneContinuation,
        namedGates       : Array.isArray(parsed.namedGates) ? parsed.namedGates : [],
        awaitingOwnPrOnly: parsed.awaitingOwnPrOnly === true
    };
}

export default parseLaneState;
