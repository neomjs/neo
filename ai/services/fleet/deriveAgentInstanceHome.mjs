import crypto from 'crypto';
import path   from 'path';

/**
 * @summary Derive the stable, collision-free, traversal-safe instance home for a Fleet Manager
 * agent's isolated harness config/state directory.
 *
 * The pure half of Fleet Manager harness-instance provisioning: given a trusted `instanceRoot` and
 * an agent + harness family, decide *where* that agent's ISOLATED harness home (`CODEX_HOME` /
 * `CLAUDE_CONFIG_DIR` — see {@link Neo.ai.services.fleet.deriveHarnessLaunchSpec}) belongs —
 * deterministic path math only, with no fs / env / config access. Isolating the decision makes the
 * correctness-and-security-critical rule fully unit-testable.
 *
 * Two invariants are load-bearing because a harness home carries per-agent **auth + session state**:
 * - **Stable:** identical inputs always map to the identical path — an unstable home would silently
 *   fork an agent's harness auth/state across restarts.
 * - **Collision-free:** distinct agents (or harness families) never share a home — a collision would
 *   cross-contaminate two agents' auth/session state. Distinctness holds even when two ids sanitize
 *   to the same readable form, because each segment carries a deterministic hash of the *raw* value.
 *   The home is keyed by the Fleet **agent id, NEVER `githubUsername`** — two fleet agents may share
 *   one GitHub identity yet must never share a harness home.
 *
 * And one security invariant, mirroring `deriveAgentRepoPath` (an agent id may be an arbitrary
 * explicit string, not just a GitHub username): the untrusted values are sanitized and the resolved
 * path is asserted to stay **contained** under `instanceRoot`, so a value like `../../etc` can never
 * escape the instance tree.
 *
 * `instanceRoot` is a required argument — never defaulted, derived, or read from env / fs here (the
 * config-is-SSOT contract); the consuming service resolves it from config and passes it in.
 *
 * @param {Object} options
 * @param {String} options.instanceRoot An absolute path to the trusted fleet instance-home root.
 * @param {String} options.agentId      The Fleet Manager agent id (untrusted; any non-empty string).
 * @param {String} options.harnessType  The harness family, e.g. `'codex'` (untrusted; non-empty).
 * @returns {String} `<instanceRoot>/<agentSegment>/<harnessSegment>` — absolute, stable, contained.
 * @throws {Error} If `instanceRoot` is not a non-empty absolute string, or `agentId` / `harnessType`
 * is not a non-empty string, or (defense-in-depth) the resolved path escapes `instanceRoot`.
 */
export function deriveAgentInstanceHome({instanceRoot, agentId, harnessType} = {}) {
    assertNonEmptyString(instanceRoot, 'instanceRoot');
    assertNonEmptyString(agentId,      'agentId');
    assertNonEmptyString(harnessType,  'harnessType');

    if (!path.isAbsolute(instanceRoot)) {
        throw new Error(`deriveAgentInstanceHome: 'instanceRoot' must be an absolute path, received '${instanceRoot}'.`);
    }

    const
        root   = path.resolve(instanceRoot),
        target = path.resolve(root, safeSegment(agentId), safeSegment(harnessType)),
        rel    = path.relative(root, target);

    // Defense-in-depth over safeSegment: the resolved path must stay strictly within the instance
    // root. A silently-wrong path would bind a harness to the wrong home, so an escape is a loud
    // failure, not a quietly-returned bad path. `path.relative` is the robust containment idiom
    // (handles a root of `/` and cross-drive targets that a `startsWith` check would mis-handle).
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`deriveAgentInstanceHome: derived path escaped the instance root (agentId='${agentId}', harnessType='${harnessType}').`);
    }

    return target;
}

/**
 * Build a filesystem-safe, human-readable, collision-free path segment from an untrusted raw value:
 * a sanitized + length-bounded readable prefix joined to a deterministic 12-hex-char SHA-256 suffix.
 * The hash makes the segment stable AND keeps distinct raw values distinct even when sanitization is
 * lossy (e.g. `a/b` and `a-b` sanitize alike but hash differently). Sanitization collapses unsafe
 * characters and dot-runs and trims leading/trailing separators, so `.` / `..` can never survive as
 * a bare traversal segment.
 *
 * Duplicated from `deriveAgentRepoPath.mjs` (private there — extracting it would change that
 * module's public surface); keep the two implementations byte-identical so the two managed trees
 * segment identically.
 * @param {String} raw
 * @returns {String} `<readable>-<sha256(raw)[0..12]>`
 * @private
 */
function safeSegment(raw) {
    const
        hash      = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12),
        sanitized = raw
            .replace(/[^a-zA-Z0-9._-]+/g, '-') // collapse runs of unsafe chars (incl. `/` and `\`) to one dash
            .replace(/\.{2,}/g, '.')           // collapse dot-runs — kills `..`
            .replace(/^[.\-]+|[.\-]+$/g, '')   // trim leading/trailing dots + dashes — kills a bare `.` / `-`
            .slice(0, 40),                     // bound the readable prefix
        readable  = sanitized || 'x';          // fallback when sanitization empties the value

    return `${readable}-${hash}`;
}

/**
 * Guard a required string argument.
 * @param {*}      value
 * @param {String} name
 * @throws {Error} If `value` is not a non-empty string.
 * @private
 */
function assertNonEmptyString(value, name) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`deriveAgentInstanceHome: '${name}' must be a non-empty string.`);
    }
}
