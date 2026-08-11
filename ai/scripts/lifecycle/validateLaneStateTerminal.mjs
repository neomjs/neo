/**
 * Pure, side-effect-free checker for the EVIDENCE SHAPE of an agent's turn-terminal `lane-state`
 * claim (the post-review-pickup §2.5/§2.6 convention).
 *
 * The wake-disposition vs lane-continuation discipline is repeatedly lost to disciplined-sounding
 * terminal prose: a wake correctly classified as low-action, then a turn that ends "standing by"
 * while naming an already-merged PR as a live gate. This validator mechanically rejects stale gate
 * names and non-driving terminals. It deliberately validates ONLY the author-provided terminal
 * evidence — it does not compute claimable work, count contributions, or enforce external liveness
 * (that is the separate, deferred external-enforcement layer).
 *
 * @module Neo.ai.scripts.lifecycle.validateLaneStateTerminal
 * @plane in-plane
 */

const PR_REF_RE = /\b(?:PR|pull request)\s*#?(\d+)\b/i;

/**
 * @summary Safely serializes hook transcript records for evidence scanning.
 * @param {*} value
 * @returns {String}
 * @protected
 */
function safeStringify(value) {
    try {
        return JSON.stringify(value);
    } catch {
        return '';
    }
}

/**
 * @summary Returns whether a transcript object is a tool-call-shaped record.
 * @param {*} value
 * @returns {Boolean}
 * @protected
 */
function isToolEvidenceObject(value) {
    if (!value || typeof value !== 'object') return false;

    const type = String(value.type ?? value.payload?.type ?? value.message?.type ?? '').toLowerCase(),
          name = String(value.name ?? value.recipient_name ?? value.tool ?? '').toLowerCase();

    return type.includes('tool_use') ||
        type.includes('tool_call') ||
        type.includes('function_call') ||
        type.includes('local_shell') ||
        type.includes('command') ||
        name.includes('bash') ||
        name.includes('exec') ||
        name.includes('shell') ||
        name.includes('github') ||
        name === 'gh' ||
        name.includes('mcp__neo_mjs_github_workflow');
}

/**
 * @summary Adds tool-call-shaped transcript surfaces to the evidence chunks.
 * @param {*} record
 * @param {String[]} chunks
 * @protected
 */
function collectToolEvidenceRecord(record, chunks) {
    if (!record || typeof record !== 'object') return;

    const candidates = [
        record,
        record.payload,
        record.item,
        record.message,
        record.payload?.item,
        record.payload?.message,
        record.item?.payload,
        record.message?.payload
    ];

    for (const candidate of candidates) {
        if (isToolEvidenceObject(candidate)) chunks.push(safeStringify(candidate));
    }

    const contentCandidates = [
        record.content,
        record.payload?.content,
        record.item?.content,
        record.message?.content,
        record.payload?.message?.content,
        record.item?.message?.content
    ];

    for (const content of contentCandidates) {
        const blocks = Array.isArray(content) ? content : [content];
        for (const block of blocks) {
            if (isToolEvidenceObject(block)) chunks.push(safeStringify(block));
        }
    }
}

/**
 * @summary Collects same-turn tool-call evidence from message-like hook records.
 * @param {Object[]} [messages=[]]
 * @returns {String}
 */
export function collectLaneStateToolEvidenceFromMessages(messages = []) {
    if (!Array.isArray(messages)) return '';

    const chunks = [];
    for (const record of messages) {
        collectToolEvidenceRecord(record, chunks);
    }
    return chunks.filter(Boolean).join('\n');
}

/**
 * @summary Collects same-turn tool-call evidence from JSONL hook transcripts.
 * @param {String} [jsonl='']
 * @returns {String}
 */
export function collectLaneStateToolEvidenceFromJsonl(jsonl = '') {
    if (typeof jsonl !== 'string') return '';

    const chunks = [];
    for (const line of jsonl.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let record;
        try { record = JSON.parse(trimmed); } catch { continue; }
        collectToolEvidenceRecord(record, chunks);
    }
    return chunks.filter(Boolean).join('\n');
}

/**
 * @summary Extracts the PR number from an explicit PR-shaped gate reference.
 * @param {String} ref
 * @returns {Number|null}
 */
export function extractPrNumberFromGateRef(ref = '') {
    const match = String(ref).match(PR_REF_RE);
    return match ? Number(match[1]) : null;
}

/**
 * @summary Returns whether same-turn tool-call evidence fetched the named PR.
 * @param {Number} prNumber
 * @param {String} [evidenceText='']
 * @returns {Boolean}
 */
export function hasSameTurnPrFetchEvidence(prNumber, evidenceText = '') {
    if (!Number.isInteger(prNumber) || !evidenceText) return false;

    const n                    = String(prNumber),
          prNumberParamPattern = `\\b(?:pr_number|pullRequestNumber|pull_request_number)\\b\\D{0,20}${n}\\b`,
          stateFieldPattern    = '\\b(?:mergedAt|mergeable|reviewDecision|statusCheckRollup|mergeStateStatus)\\b',
          patterns             = [
              new RegExp(`\\bgh\\s+pr\\s+(?:view|checks)\\s+${n}\\b`, 'i'),
              new RegExp(`\\bgh\\s+api\\b[\\s\\S]{0,400}\\b(?:pulls|pullRequests|pullRequest)\\b[\\s\\S]{0,200}\\b${n}\\b`, 'i'),
              new RegExp(`\\b(?:get_pull_request|getPullRequest|get_conversation|getConversation)\\b[\\s\\S]{0,300}\\b(?:pr_number|pullRequestNumber|pull_request_number|number)\\b\\D{0,20}${n}\\b`, 'i'),
              new RegExp(`${prNumberParamPattern}[\\s\\S]{0,300}${stateFieldPattern}|${stateFieldPattern}[\\s\\S]{0,300}${prNumberParamPattern}`, 'i')
          ];

    return patterns.some(pattern => pattern.test(evidenceText));
}

/**
 * The lane-continuation states that answer "may the turn end?" — all three are DRIVING continuations.
 * Per §no_hold_state there is no hold state: the only valid turn-state is on / jumped-to a high-value
 * lane. The survey-idle terminal `verified-no-lane` was retired — under "high-value work is infinite"
 * it is ~never honestly true, and the `L3_No_Hold_State` firewall brands it a manufactured idle.
 * @type {String[]}
 */
export const LANE_CONTINUATIONS = ['active-lane', 'next-lane', 'blocker-routed'];

/**
 * Wake dispositions that answer only "engage this message?" — never "does the turn have a lane?".
 * @type {String[]}
 */
export const NON_TERMINAL_DISPOSITIONS = ['awareness', 'stale', 'suppressed'];

/**
 * @summary Validates a structured turn-terminal `lane-state` descriptor against the evidence rules.
 *
 * Rules:
 *  1. A `wakeDisposition` of awareness/stale/suppressed is not a terminal on its own — a
 *     `laneContinuation` is required.
 *  2. `laneContinuation='active-lane'` may not be only an own PR awaiting merge/review/CI (a
 *     background watch); that resolves to `next-lane` unless there is concrete author work on it.
 *  3. Every named PR/issue gate must cite a same-turn `checkedAt` (stale gate names are not evidence).
 *     PR-shaped gates must also be backed by same-turn tool-call evidence that fetched the PR; a gate
 *     flagged `mergeClaim` must cite `field === 'mergedAt'` (reading a PR's `state`/CLOSED is not
 *     merge proof — a closed PR may be un-merged).
 *
 * @param {Object} [laneState={}]
 * @param {String} [laneState.wakeDisposition] One of `actionable|awareness|stale|suppressed|incident`.
 * @param {String} [laneState.laneContinuation] One of `active-lane|next-lane|blocker-routed`.
 * @param {Object[]} [laneState.namedGates] Named PR/issue gates this terminal cites: `[{ref, checkedAt, mergeClaim?, field?}]`.
 * @param {Boolean} [laneState.awaitingOwnPrOnly] True when the only cited lane is an own PR awaiting merge/review/CI.
 * @param {Object} [options]
 * @param {String} [options.evidenceText] Same-turn tool-call evidence collected from hook transcripts.
 * @returns {{valid: Boolean, violations: String[]}} `valid` is true when no rule is violated.
 */
export function validateLaneStateTerminal(laneState = {}, {evidenceText = ''} = {}) {
    const {
        wakeDisposition,
        laneContinuation,
        namedGates        = [],
        awaitingOwnPrOnly = false
    } = laneState;

    const violations = [];

    // Rule 1 — a wake disposition alone is not a terminal.
    if (!laneContinuation) {
        violations.push(NON_TERMINAL_DISPOSITIONS.includes(wakeDisposition)
            ? `wakeDisposition='${wakeDisposition}' answers only the message, not the turn: a laneContinuation is required.`
            : `Missing laneContinuation (one of: ${LANE_CONTINUATIONS.join(', ')}).`);
        return {valid: false, violations};
    }

    if (!LANE_CONTINUATIONS.includes(laneContinuation)) {
        violations.push(`Unknown laneContinuation '${laneContinuation}' (expected one of: ${LANE_CONTINUATIONS.join(', ')}).`);
    }

    // Rule 2 — active-lane is not an own-PR background watch.
    if (laneContinuation === 'active-lane' && awaitingOwnPrOnly) {
        violations.push('active-lane cannot be only an own PR awaiting merge/review/CI (a background watch) — it resolves to next-lane unless there is concrete author work on that PR this turn.');
    }

    // Rule 3 — named gates need a same-turn checkedAt; PR gates need a same-turn fetch; merge claims
    // must read the authoritative field.
    for (const gate of namedGates) {
        if (!gate?.checkedAt) {
            violations.push(`Named gate ${gate?.ref ?? '(unnamed)'} must cite a same-turn checkedAt — a stale gate name is not evidence.`);
        } else {
            const prNumber = extractPrNumberFromGateRef(gate.ref);
            if (prNumber && !hasSameTurnPrFetchEvidence(prNumber, evidenceText)) {
                violations.push(`Named gate ${gate.ref} cites checkedAt but no same-turn PR fetch evidence was found for PR #${prNumber} — run gh pr view/checks or the GitHub workflow PR fetch in this turn before naming it.`);
            }
        }

        if (gate?.mergeClaim && gate.field !== 'mergedAt') {
            violations.push(`Named gate ${gate.ref ?? '(unnamed)'} claims merge state but cites field ${gate.field ? `'${gate.field}'` : '(none)'} — a merge claim must read mergedAt (a PR's state/CLOSED is not merge proof).`);
        }
    }

    return {valid: violations.length === 0, violations};
}

export default validateLaneStateTerminal;
