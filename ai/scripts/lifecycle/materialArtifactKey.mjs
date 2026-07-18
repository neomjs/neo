/**
 * @module ai/scripts/lifecycle/materialArtifactKey
 * @summary The autonomous-quadrant stop key: an autonomous turn may stop when a MATERIAL lifecycle
 * artifact shipped since the session's last accepted stop — verified from transcript tool evidence,
 * never from prose. Declarative stop-permission (lane-state words) proved gameable; the swarm's real
 * unit of shipped motion is the lifecycle artifact, so the artifact IS the license and the terminal
 * stays the handoff record.
 *
 * Three artifact classes, all externally verifiable from tool-use/tool-result record shapes
 * (fail-closed: an unrecognized shape yields NO key — prose claims can never mint one):
 * - `pr-opened`      — a `gh pr create` tool call whose result carries the new PR URL;
 * - `formal-review`  — a `manage_pr_review` create call whose result confirms the posted review;
 * - `rc-response`    — the author-response cycle: a successful `git push` followed by a PR-comment
 *   call whose result confirms the posted comment (the v1 recognizer for "commits pushed + the
 *   response comment"; deliberately conservative — refinement rides dogfood evidence).
 *
 * A PR-only key would fight the hook's own capacity advisory (review seats outrank new artifacts
 * past the own-open-PR threshold) and reinstate the commit-bias the contributions-over-commits
 * principle overrides — so formal reviews and RC-responses are first-class keys by design.
 *
 * Pure + total throughout: injected strings in, plain objects out, never throws (turn-end hook
 * path), no imports beyond the standard library.
 */

/**
 * The recognized artifact classes, frozen — the vocabulary the evaluator accepts and the
 * collector emits. Anything else is not a key.
 * @type {String[]}
 */
export const MATERIAL_ARTIFACT_CLASSES = Object.freeze(['pr-opened', 'formal-review', 'rc-response']);

const PULL_URL_RE    = /github\.com\/[^\s"'\\]+\/pull\/(\d+)/;
const COMMENT_URL_RE = /#issuecomment-\d+|Successfully created .*comment/i;
const REVIEW_OK_RE   = /"reviewId"|Successfully created \w+ review/i;
const PR_CREATE_RE   = /\bgh\s+pr\s+create\b/;
const GIT_PUSH_RE    = /\bgit\s+push\b/;
const PUSH_OK_RE     = /->\s+\S+|Everything up-to-date|branch .* set up to track/;
const PR_COMMENT_RE  = /\bgh\s+pr\s+comment\b/;

/**
 * @summary Extracts the flat text of a tool_result content field (string, or joined text blocks).
 * @param {*} content
 * @returns {String}
 * @protected
 */
function resultText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map(block => typeof block === 'string' ? block : (block?.text ?? (typeof block?.content === 'string' ? block.content : ''))).join('\n');
    }
    return ''
}

/**
 * @summary Collects material lifecycle artifacts from a Claude Code JSONL transcript — the
 * verification substrate for {@link evaluateMaterialArtifactKey}. Walks tool_use records to arm a
 * per-class pending expectation and the FOLLOWING tool_result records to confirm it: an armed call
 * whose result never confirms yields nothing (fail-closed), and text that merely TALKS about a PR
 * or review arms nothing (the prose-claim negative by construction).
 *
 * `sinceIso` scopes the key to "since this session's last accepted stop": records at-or-before the
 * boundary are ignored; when a boundary is given, records WITHOUT a parseable timestamp are also
 * ignored (fail-closed — an undatable artifact cannot prove it postdates the boundary).
 * @param {String} [jsonl=''] The transcript JSONL.
 * @param {Object} [options]
 * @param {String|null} [options.sinceIso=null] ISO timestamp of the last accepted stop, or null.
 * @returns {Object[]} Confirmed artifacts in transcript order — each `{class, ref, at}` (String fields).
 */
export function collectMaterialArtifactsFromJsonl(jsonl = '', {sinceIso = null} = {}) {
    if (typeof jsonl !== 'string' || !jsonl) return [];

    const sinceMs   = sinceIso ? Date.parse(sinceIso) : null,
          artifacts = [];

    let pending = null, // {kind, ref} armed by the newest qualifying tool_use
        pushConfirmed = false; // a successful `git push` seen inside the window (the rc-response first half)

    for (const line of jsonl.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let record;
        try { record = JSON.parse(trimmed); } catch { continue; }

        const at = typeof record.timestamp === 'string' ? record.timestamp : null;

        if (Number.isFinite(sinceMs)) {
            const atMs = at ? Date.parse(at) : NaN;
            if (!Number.isFinite(atMs) || atMs <= sinceMs) { continue; }
        }

        const content = record.message?.content;
        if (!Array.isArray(content)) continue;

        for (const block of content) {
            if (block?.type === 'tool_use') {
                const name  = block.name || '',
                      input = block.input || {};

                if (name === 'Bash' && typeof input.command === 'string') {
                    if (PR_CREATE_RE.test(input.command)) {
                        pending = {kind: 'pr-opened', ref: ''}
                    } else if (GIT_PUSH_RE.test(input.command)) {
                        pending = {kind: 'push', ref: ''}
                    } else if (PR_COMMENT_RE.test(input.command)) {
                        const match = input.command.match(/gh\s+pr\s+comment\s+(\d+)/);
                        pending = {kind: 'pr-comment', ref: match ? `#${match[1]}` : ''}
                    } else {
                        pending = null
                    }
                } else if (name === 'mcp__neo-mjs-github-workflow__manage_pr_review' && input.action === 'create') {
                    pending = {kind: 'formal-review', ref: input.pr_number ? `#${input.pr_number}` : ''}
                } else {
                    pending = null
                }
            } else if (block?.type === 'tool_result' && pending) {
                const text = resultText(block.content);

                if (pending.kind === 'pr-opened' && PULL_URL_RE.test(text)) {
                    const match = text.match(PULL_URL_RE);
                    artifacts.push({class: 'pr-opened', ref: `#${match[1]}`, at: at || ''})
                } else if (pending.kind === 'formal-review' && REVIEW_OK_RE.test(text)) {
                    artifacts.push({class: 'formal-review', ref: pending.ref, at: at || ''})
                } else if (pending.kind === 'push' && PUSH_OK_RE.test(text)) {
                    pushConfirmed = true
                } else if (pending.kind === 'pr-comment' && COMMENT_URL_RE.test(text) && pushConfirmed) {
                    // the author-response cycle: confirmed push + confirmed PR comment, in order
                    artifacts.push({class: 'rc-response', ref: pending.ref, at: at || ''})
                }

                pending = null
            }
        }
    }

    return artifacts
}

/**
 * @summary Evaluates the material-artifact stop key for an AUTONOMOUS turn: a valid lane-state
 * terminal (the handoff record still matters) plus at least one collector-confirmed artifact
 * (the license). The inputs are external by construction — the artifacts come from
 * {@link collectMaterialArtifactsFromJsonl} over the transcript, the boundary from the hook's own
 * audit log — so prose can never self-declare a key. Returns the accept/refuse verdict with the
 * audit-ready reason; the caller owns the `MATERIAL-ALLOW` audit line.
 * @param {Object} input
 * @param {Boolean} [input.verdictValid=false] The lane-state terminal validation verdict.
 * @param {Object[]} [input.artifacts=[]] Collector-confirmed artifacts — each `{class, ref}` (String fields).
 * @returns {{accept: Boolean, reason: String}}
 */
export function evaluateMaterialArtifactKey({verdictValid = false, artifacts = []} = {}) {
    if (!verdictValid) {
        return {accept: false, reason: 'terminal verdict not valid — the material-artifact key still requires a valid lane-state terminal'}
    }

    const confirmed = Array.isArray(artifacts)
        ? artifacts.filter(artifact => artifact && MATERIAL_ARTIFACT_CLASSES.includes(artifact.class))
        : [];

    if (!confirmed.length) {
        return {
            accept: false,
            reason: 'no material lifecycle artifact since the last accepted stop — ship one (a PR opened, a formal review, or an RC-response cycle); that is the stop key'
        }
    }

    const latest = confirmed[confirmed.length - 1],
          listed = confirmed.map(artifact => `${artifact.class}${artifact.ref ? ` ${artifact.ref}` : ''}`).join(', ');

    return {
        accept: true,
        reason: `[material-allow] ${confirmed.length} material artifact(s) since the last accepted stop (${listed}) + a valid terminal — the autonomous stop is earned; latest: ${latest.class}${latest.ref ? ` ${latest.ref}` : ''}`
    }
}
