import fs   from 'node:fs';
import os   from 'node:os';
import path from 'node:path';

export const LIFECYCLE_STATE_DIR_NAME = 'lifecycle-state';

/**
 * @module Neo.ai.scripts.lifecycle.lifecycleState
 * @summary Shared lifecycle-state path and render primitives for no-hold Stop hooks.
 *
 * The hook live board is current-agent state. Reader and writer paths must be resolved
 * through this module so one harness cannot read a different home than another writer
 * uses. State files are keyed by AgentIdentity to avoid clobbering peer boards in a
 * shared/canonical `.neo-ai-data` home.
 */

/**
 * @summary Normalizes AgentIdentity or GitHub-login strings to `@identity` form.
 * @param {String|null|undefined} value Identity candidate.
 * @returns {String|null}
 */
export function normalizeAgentIdentity(value) {
    const str = String(value || '').trim();

    if (!str) return null;

    return str.startsWith('@') ? str : `@${str}`
}

/**
 * @summary Resolves the best runtime AgentIdentity candidate from environment.
 * @param {Object} [env=process.env]
 * @returns {String|null}
 */
export function resolveRuntimeAgentIdentity(env = process.env) {
    return normalizeAgentIdentity(
        env.NEO_AGENT_IDENTITY ||
        env.NEO_AGENT_IDENTITY_NODE_ID ||
        env.NEO_AGENT_LOGIN ||
        env.GITHUB_USER
    )
}

/**
 * @summary Converts an AgentIdentity or GitHub login to the bare GitHub login form.
 * @param {String|null|undefined} value Identity candidate.
 * @returns {String|null}
 */
export function getAgentLogin(value) {
    const normalized = normalizeAgentIdentity(value);

    return normalized ? normalized.slice(1) : null
}

/**
 * @summary Builds the filename-safe lifecycle-state key for an AgentIdentity.
 * @param {String|null|undefined} value Identity candidate.
 * @returns {String|null}
 */
export function getLifecycleStateIdentityKey(value) {
    const login = getAgentLogin(value);
    if (!login) return null;

    const key = login.replace(/[^a-zA-Z0-9_-]/g, '');

    return key || null
}

/**
 * @summary Resolves the shared lifecycle-state directory.
 * @param {Object} [options]
 * @param {Object} [options.env=process.env] Environment map.
 * @param {String} [options.homeDir=os.homedir()] OS home for the default `.neo-ai-data` root.
 * @param {String} [options.rootDir] Explicit root override, mainly for tests.
 * @returns {String}
 */
export function resolveLifecycleStateDir({
    env     = process.env,
    homeDir = os.homedir(),
    rootDir
} = {}) {
    const baseDir = rootDir || env.NEO_AI_DAEMON_DIR || path.join(homeDir, '.neo-ai-data');

    return path.join(baseDir, LIFECYCLE_STATE_DIR_NAME)
}

/**
 * @summary Resolves the per-agent lifecycle-state JSON path.
 * @param {Object} [options]
 * @param {String} [options.agentIdentity] AgentIdentity or login.
 * @param {Object} [options.env=process.env] Environment map.
 * @param {String} [options.homeDir=os.homedir()] OS home for the default `.neo-ai-data` root.
 * @param {String} [options.rootDir] Explicit root override, mainly for tests.
 * @returns {String|null}
 */
export function resolveLifecycleStateFile({
    agentIdentity,
    env           = process.env,
    homeDir       = os.homedir(),
    rootDir
} = {}) {
    const key = getLifecycleStateIdentityKey(agentIdentity || resolveRuntimeAgentIdentity(env));

    return key ? path.join(resolveLifecycleStateDir({env, homeDir, rootDir}), `${key}.json`) : null
}

/**
 * @summary Reads the daemon-written lane-state file. Fail-open by construction.
 * @param {Object} [options]
 * @param {String} [options.agentIdentity] AgentIdentity or login.
 * @param {Object} [options.env=process.env] Environment map.
 * @param {Object} [options.fsImpl=fs] fs-compatible implementation.
 * @param {String} [options.homeDir=os.homedir()] OS home for the default `.neo-ai-data` root.
 * @param {String} [options.legacyFilePath] Optional legacy fallback read path.
 * @param {String} [options.rootDir] Explicit root override, mainly for tests.
 * @returns {Object|null}
 */
export function readLifecycleState({
    agentIdentity,
    env            = process.env,
    fsImpl         = fs,
    homeDir        = os.homedir(),
    legacyFilePath,
    rootDir
} = {}) {
    const canonicalFile = resolveLifecycleStateFile({agentIdentity, env, homeDir, rootDir});

    if (canonicalFile) {
        try {
            const state = JSON.parse(fsImpl.readFileSync(canonicalFile, 'utf8'));
            return state && typeof state === 'object' ? state : null
        } catch (e) {
            if (e?.code !== 'ENOENT') return null;
        }
    }

    if (legacyFilePath) {
        try {
            const state = JSON.parse(fsImpl.readFileSync(legacyFilePath, 'utf8'));
            return state && typeof state === 'object' ? state : null
        } catch {
            return null;
        }
    }

    return null
}

/**
 * @summary Formats the lifecycle board fields for hook directive injection.
 * @param {Object|null} state `{openPRs, unreadCount, generatedAt}` from {@link readLifecycleState}.
 * @returns {String}
 */
export function formatLifecycleBoard(state) {
    try {
        if (!state || typeof state !== 'object') return '';

        const prs   = Array.isArray(state.openPRs) ? state.openPRs : [],
              lines = [];

        const validPRs = prs.filter(pr => pr && typeof pr === 'object' &&
            (typeof pr.number === 'number' || typeof pr.number === 'string'));
        if (validPRs.length) {
            lines.push('  • your open PRs: ' +
                validPRs.map(pr => `#${pr.number}${pr.state ? ` ${pr.state}` : ''}`).join(', '));
        }
        if (Number.isInteger(state.unreadCount) && state.unreadCount > 0) {
            lines.push(`  • ${state.unreadCount} unread A2A — list_messages`);
        }
        if (!lines.length) return '';

        const asOf = typeof state.generatedAt === 'string' ? ` (as of ${state.generatedAt})` : '';
        return `\nYour live board${asOf} — concrete lanes right now:\n${lines.join('\n')}`;
    } catch {
        return '';
    }
}

/**
 * @summary Formats the producer-ranked Computed Golden Path direction for hook injection.
 * @param {Object|null} state `{goldenPathDirection: [{id, score?, title?}], ...}`.
 * @returns {String}
 */
export function formatGoldenPathDirection(state) {
    try {
        if (!state || typeof state !== 'object') return '';

        const lanes = Array.isArray(state.goldenPathDirection) ? state.goldenPathDirection : [];
        const valid = lanes.filter(lane => lane && typeof lane === 'object' &&
            typeof lane.id === 'string' && lane.id.trim() !== '');
        if (!valid.length) return '';

        const rows = valid.map((lane, index) => {
            const score = Number.isFinite(Number(lane.score)) ? ` — score ${Number(lane.score).toFixed(2)}` : '',
                  title = typeof lane.title === 'string' && lane.title.trim() ? ` — ${lane.title.trim()}` : '';
            return `  ${index + 1}. ${lane.id}${score}${title}`;
        });

        return `\nRelease-goal direction — Computed Golden Path top ROI (drive one of these over any-named-lane; advisory, not auto-reprioritization):\n${rows.join('\n')}`;
    } catch {
        return '';
    }
}
