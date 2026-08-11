/**
 * @module ai/scripts/lifecycle/materialArtifactKey
 * @summary The autonomous-quadrant stop key: an autonomous turn may stop when a MATERIAL lifecycle
 * artifact shipped since the session's last accepted stop — verified from transcript tool evidence,
 * never from prose. Declarative stop-permission (lane-state words) proved gameable; the swarm's real
 * unit of shipped motion is the lifecycle artifact, so the artifact IS the license and the terminal
 * stays the handoff record.
 *
 * Two artifact classes in v1, both provenance-correlated end-to-end (the producing `tool_use` is
 * tracked by its `id`; ONLY the `tool_result` carrying the matching `tool_use_id` can confirm it;
 * an `is_error` result confirms nothing; a result with no matching pending id confirms nothing):
 * - `pr-opened`     — a `gh pr create` invocation (the command's FIRST token sequence, so shell
 *   echo/quoting cannot impersonate it) whose own result carries the new PR URL;
 * - `formal-review` — a `manage_pr_review` create call whose own result confirms the posted review.
 *
 * The own-PR RC-response cycle is deliberately NOT a v1 class: a trustworthy recognizer must bind a
 * fresh push delta to the SAME author-owned PR under live CHANGES_REQUESTED authority — facts the
 * transcript alone cannot establish without a false-proxy risk, so the class rides the ticket as a
 * dogfood-gated successor rather than shipping weak.
 *
 * A PR-only key would fight the hook's own capacity advisory (review seats outrank new artifacts
 * past the own-open-PR threshold) and reinstate the commit-bias the contributions-over-commits
 * principle overrides — so formal reviews are a first-class key by design.
 *
 * Pure + total throughout: injected strings in, plain objects out, never throws (turn-end hook
 * path), no imports beyond the standard library.
 * @plane in-plane
 */

/**
 * The recognized artifact classes, frozen — the vocabulary the evaluator accepts and the
 * collector emits. Anything else is not a key.
 * @type {String[]}
 */
export const MATERIAL_ARTIFACT_CLASSES = Object.freeze(['pr-opened', 'formal-review']);

// The arming anchor tolerates leading whitespace + env assignments but requires `gh pr create` as
// the actual command head — `echo "gh pr create ..."`, quoted mentions, and pipelines that merely
// CONTAIN the string never arm (the shell-impersonation negative). Linear by construction: the one
// optional whitespace run is hoisted OUTSIDE the assignment loop, so every quantifier boundary
// inside the loop separates disjoint character classes (`\S+` vs `\s+`) — no ambiguous split, no
// exponential backtracking (the js/redos class the adjacent `\s*…\s+` form carried).
const PR_CREATE_HEAD_RE = /^\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*gh\s+pr\s+create\b/;

// Compound commands never arm — `gh pr create … || echo <url>` would otherwise mint from the
// fallback's echoed text (the result of a compound is the COMPOUND's output, not the pr-create's).
// Fail-closed on the ENUMERATED composition forms: `;`, `|` (and `||`), `&` (and `&&` — a single
// `&` backgrounds the pr-create and hands the tail command the visible output), backticks, `$(`,
// redirection `<`/`>`, and CR/LF line breaks (a multi-line command is sequential composition with
// no operator spelling at all). Legitimate `&&` chains disqualify too — the artifact still exists
// in reality; only the STOP LICENSE requires the standalone invocation whose result is
// unambiguously the pr-create's own.
const SHELL_COMPOUND_RE = /[;|&`<>\r\n]|\$\(/;
const PULL_URL_RE       = /github\.com\/[^\s"'\\]+\/pull\/(\d+)/;
const REVIEW_OK_RE      = /"reviewId"|Successfully created \w+ review/i;

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
 * verification substrate for {@link evaluateMaterialArtifactKey}. Provenance is ID-CORRELATED:
 * a qualifying `tool_use` block arms a pending entry keyed by its `id`; only a `tool_result`
 * block whose `tool_use_id` matches that key can confirm it, and an `is_error: true` result
 * consumes the key while confirming nothing. Batched records (multiple tool_use or tool_result
 * blocks in one message) are handled per block; a result with no matching pending key is ignored
 * (so free-floating or replayed result text cannot mint an artifact); a use block without an `id`
 * arms nothing (fail-closed — uncorrelatable provenance is no provenance).
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
          artifacts = [],
          pending   = new Map(); // tool_use.id → {kind, ref}

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
                // Uncorrelatable provenance is no provenance: a use block without an id arms nothing.
                if (typeof block.id !== 'string' || !block.id) continue;

                const name  = block.name || '',
                      input = block.input || {};

                if (name === 'Bash' && typeof input.command === 'string'
                    && PR_CREATE_HEAD_RE.test(input.command) && !SHELL_COMPOUND_RE.test(input.command)) {
                    pending.set(block.id, {kind: 'pr-opened', ref: ''})
                } else if (name === 'mcp__neo-mjs-github-workflow__manage_pr_review' && input.action === 'create') {
                    pending.set(block.id, {kind: 'formal-review', ref: input.pr_number ? `#${input.pr_number}` : ''})
                }
                // any other tool_use arms nothing and disturbs nothing (batched records keep their keys)
            } else if (block?.type === 'tool_result') {
                const useId = typeof block.tool_use_id === 'string' ? block.tool_use_id : null,
                      armed = useId ? pending.get(useId) : null;

                if (!armed) continue;            // no matching producer — replayed/echoed text mints nothing
                pending.delete(useId);           // one result consumes one key, confirming or not

                if (block.is_error === true) continue; // a failed call is not an artifact

                const text = resultText(block.content);

                if (armed.kind === 'pr-opened' && PULL_URL_RE.test(text)) {
                    const match = text.match(PULL_URL_RE);
                    artifacts.push({class: 'pr-opened', ref: `#${match[1]}`, at: at || ''})
                } else if (armed.kind === 'formal-review' && REVIEW_OK_RE.test(text)) {
                    artifacts.push({class: 'formal-review', ref: armed.ref, at: at || ''})
                }
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
 * audit log — so prose can never self-declare a key. When the boundary itself is UNAVAILABLE
 * (`sinceUnavailable: true` — an unreadable/corrupt audit log), the key REFUSES regardless of
 * artifacts: evidence that cannot prove its scope licenses nothing (fail-closed), and the refusal
 * names the cause. Returns the accept/refuse verdict with the audit-ready reason; the caller owns
 * the `MATERIAL-ALLOW` audit line.
 * @param {Object} input
 * @param {Boolean} [input.verdictValid=false] The lane-state terminal validation verdict.
 * @param {Object[]} [input.artifacts=[]] Collector-confirmed artifacts — each `{class, ref}` (String fields).
 * @param {Boolean} [input.sinceUnavailable=false] True when the accepted-stop boundary could not be read.
 * @returns {{accept: Boolean, reason: String}}
 */
export function evaluateMaterialArtifactKey({verdictValid = false, artifacts = [], sinceUnavailable = false} = {}) {
    if (!verdictValid) {
        return {accept: false, reason: 'terminal verdict not valid — the material-artifact key still requires a valid lane-state terminal'}
    }

    if (sinceUnavailable) {
        return {accept: false, reason: 'the accepted-stop boundary is unreadable — artifacts cannot prove their scope, so the key refuses (fail-closed)'}
    }

    const confirmed = Array.isArray(artifacts)
        ? artifacts.filter(artifact => artifact && MATERIAL_ARTIFACT_CLASSES.includes(artifact.class))
        : [];

    if (!confirmed.length) {
        return {
            accept: false,
            reason: 'no material lifecycle artifact since the last accepted stop — ship one (a PR opened or a formal review); that is the stop key'
        }
    }

    const latest = confirmed[confirmed.length - 1],
          listed = confirmed.map(artifact => `${artifact.class}${artifact.ref ? ` ${artifact.ref}` : ''}`).join(', ');

    return {
        accept: true,
        reason: `[material-allow] ${confirmed.length} material artifact(s) since the last accepted stop (${listed}) + a valid terminal — the autonomous stop is earned; latest: ${latest.class}${latest.ref ? ` ${latest.ref}` : ''}`
    }
}
