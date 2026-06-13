import crypto from 'crypto';
import path   from 'path';

/**
 * @summary Derive the stable, collision-free, traversal-safe managed checkout path for a Fleet
 * Manager agent's clone of a given repo.
 *
 * The pure half of Fleet Manager repo provisioning: given a trusted `managedRoot` and an agent +
 * repo, decide *where* that agent's checkout belongs — deterministic path math only, with no fs /
 * git / env / config access. The side-effectful clone / locate / health-check (a later leaf)
 * consumes this; isolating the decision makes the correctness-and-security-critical rule fully
 * unit-testable.
 *
 * Two invariants are load-bearing because Fleet Manager auto-memory is **checkout-path-keyed**:
 * - **Stable:** identical inputs always map to the identical path — an unstable path would silently
 *   fork an agent's path-keyed memory across restarts.
 * - **Collision-free:** distinct agents (or repos) never share a path — a collision would
 *   cross-contaminate two agents' memory. Distinctness holds even when two ids sanitize to the same
 *   readable form, because each segment carries a deterministic hash of the *raw* value.
 *
 * And one security invariant, mirroring the untrusted-key posture of `FleetRegistryService` (an
 * agent id may be an arbitrary explicit string, not just a GitHub username): the untrusted value is
 * sanitized and the resolved path is asserted to stay **contained** under `managedRoot`, so a value
 * like `../../etc` can never escape the managed tree.
 *
 * `managedRoot` is a required argument — never defaulted, derived, or read from env / fs here (the
 * config-is-SSOT contract); the consuming service resolves it from config and passes it in.
 *
 * @param {Object} options
 * @param {String} options.managedRoot An absolute path to the trusted fleet-managed checkout root.
 * @param {String} options.agentId     The Fleet Manager agent id (untrusted; any non-empty string).
 * @param {String} options.repoSlug    The repo identifier, e.g. `'neomjs/neo'` (untrusted; non-empty).
 * @returns {String} `<managedRoot>/<agentSegment>/<repoSegment>` — absolute, stable, contained.
 * @throws {Error} If `managedRoot` is not a non-empty absolute string, or `agentId` / `repoSlug` is
 * not a non-empty string, or (defense-in-depth) the resolved path escapes `managedRoot`.
 */
export function deriveAgentRepoPath({managedRoot, agentId, repoSlug} = {}) {
    assertNonEmptyString(managedRoot, 'managedRoot');
    assertNonEmptyString(agentId,     'agentId');
    assertNonEmptyString(repoSlug,    'repoSlug');

    if (!path.isAbsolute(managedRoot)) {
        throw new Error(`deriveAgentRepoPath: 'managedRoot' must be an absolute path, received '${managedRoot}'.`);
    }

    const
        root   = path.resolve(managedRoot),
        target = path.resolve(root, safeSegment(agentId), safeSegment(repoSlug)),
        rel    = path.relative(root, target);

    // Defense-in-depth over safeSegment: the resolved path must stay strictly within the managed
    // root. A silently-wrong path would clone into the wrong place, so an escape is a loud failure,
    // not a quietly-returned bad path. `path.relative` is the robust containment idiom (handles a
    // root of `/` and cross-drive targets that a `startsWith` check would mis-handle).
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`deriveAgentRepoPath: derived path escaped the managed root (agentId='${agentId}', repoSlug='${repoSlug}').`);
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
        throw new Error(`deriveAgentRepoPath: '${name}' must be a non-empty string.`);
    }
}
