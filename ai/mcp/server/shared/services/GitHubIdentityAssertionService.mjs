import {execFile}   from 'child_process';
import {promisify}  from 'util';
import Base         from '../../../../../src/core/Base.mjs';
import {IDENTITIES} from '../../../../graph/identityRoots.mjs';
import RequestContextService from './RequestContextService.mjs';

const execFileAsync = promisify(execFile);

/**
 * @summary Normalizes AgentIdentity-style and GitHub-login-style strings to a GitHub login.
 *
 * AgentIdentity node IDs use the form `@neo-gpt`, while GitHub's viewer API
 * returns plain logins such as `neo-gpt`. GitHub identity assertions compare in
 * the login namespace so public write gates do not false-positive on punctuation.
 *
 * @param {String|null|undefined} identity AgentIdentity node id or GitHub login.
 * @returns {String|null} Normalized login, or null when no non-empty identity exists.
 */
function normalizeGitHubLogin(identity) {
    if (identity == null) {
        return null;
    }

    const trimmed = String(identity).trim();

    if (!trimmed) {
        return null;
    }

    return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}

/**
 * @summary Normalizes an identity string into AgentIdentity node-id form.
 * @param {String|null|undefined} identity AgentIdentity node id or GitHub login.
 * @returns {String|null} `@`-prefixed identity id or null.
 */
function normalizeAgentIdentityId(identity) {
    const login = normalizeGitHubLogin(identity);

    return login ? `@${login}` : null;
}

/**
 * @summary Resolves canonical identity metadata from `identityRoots.mjs`.
 * @param {String|null|undefined} identity AgentIdentity node id or GitHub login.
 * @returns {{identityId: String, githubLogin: String}|null} Canonical identity tuple.
 */
function resolveExpectedGitHubLogin(identity) {
    const identityId = normalizeAgentIdentityId(identity);

    if (!identityId) {
        return null;
    }

    const record = IDENTITIES.find(item => {
        const githubLogin = normalizeGitHubLogin(item.properties?.githubLogin);

        return item.id === identityId || githubLogin === normalizeGitHubLogin(identity);
    });

    const githubLogin = normalizeGitHubLogin(record?.properties?.githubLogin);

    if (!record || !githubLogin) {
        return null;
    }

    return {
        identityId: record.id,
        githubLogin
    };
}

/**
 * @summary Creates a normalized fail-closed assertion result.
 * @param {String} code Stable machine-readable reason code.
 * @param {String} reason Short reason slug.
 * @param {String} message Human-readable diagnostic.
 * @param {Object} [details] Additional assertion metadata.
 * @returns {Object}
 */
function rejectIdentityAssertion(code, reason, message, details = {}) {
    return {
        ok: false,
        code,
        reason,
        message,
        ...details
    };
}

/**
 * @summary Shared GitHub identity assertion core for public-write and healthcheck guards.
 *
 * This service provides the pure source-of-truth comparison that detects harness
 * identity drift before a tool mutates public GitHub state. It anchors expected
 * identity in `NEO_AGENT_IDENTITY` and the canonical `identityRoots.mjs`
 * `githubLogin` mapping, then compares that expected login against both the
 * effective GitHub CLI viewer and any request-bound Memory Core self-identity.
 *
 * Memory Core identity is optional because some stdio servers still lack request
 * context; when present, a mismatch is a hard failure.
 *
 * @class Neo.ai.mcp.server.shared.services.GitHubIdentityAssertionService
 * @extends Neo.core.Base
 * @singleton
 * @see ../../../../graph/identityRoots.mjs
 * @see Neo.ai.mcp.server.shared.services.RequestContextService
 */
class GitHubIdentityAssertionService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.shared.services.GitHubIdentityAssertionService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.shared.services.GitHubIdentityAssertionService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Resolves the effective GitHub viewer login for the current process credentials.
     * Failures resolve to null so callers can fail closed without leaking CLI stderr.
     *
     * @param {Object} [options]
     * @param {String} [options.cwd] Working directory for the GitHub CLI probe.
     * @returns {Promise<String|null>} Effective viewer login or null on failure.
     */
    async resolveViewerLogin({cwd = process.cwd()} = {}) {
        try {
            const {stdout} = await execFileAsync('gh', ['api', 'user', '--jq', '.login'], {
                cwd,
                timeout: 1500
            });

            return normalizeGitHubLogin(stdout);
        } catch (error) {
            return null;
        }
    }

    /**
     * Resolves the active request-bound Memory Core self-identity, when present.
     * @returns {{identityId: String|null, githubLogin: String|null}}
     */
    resolveMemoryCoreIdentity() {
        const identityId  = RequestContextService.getAgentIdentityNodeId();
        const userId      = RequestContextService.getUserId();
        const identity    = resolveExpectedGitHubLogin(identityId) || resolveExpectedGitHubLogin(userId);
        const githubLogin = identity?.githubLogin || normalizeGitHubLogin(userId);

        return {
            identityId: identity?.identityId || normalizeAgentIdentityId(identityId),
            githubLogin
        };
    }

    /**
     * Asserts that the expected agent identity, effective GitHub viewer, and optional
     * Memory Core self-identity agree.
     *
     * @param {Object} [options]
     * @param {String|null} [options.agentIdentity]
     *     AgentIdentity node id or GitHub login to anchor the expectation.
     * @param {Function} [options.getViewerLogin] Test seam for the effective viewer probe.
     * @param {Function} [options.getMemoryCoreIdentity] Test seam for request-bound identity.
     * @param {String} [options.cwd] Working directory for the GitHub CLI probe.
     * @returns {Promise<Object>} `{ok: true, ...}` or `{ok: false, code, reason, message, ...}`.
     */
    async assertExpectedIdentity({
        agentIdentity,
        getViewerLogin        = options => this.resolveViewerLogin(options),
        getMemoryCoreIdentity = () => this.resolveMemoryCoreIdentity(),
        cwd
    } = {}) {
        const resolvedAgentIdentity = agentIdentity ||
            process.env.NEO_AGENT_IDENTITY ||
            RequestContextService.getAgentIdentityNodeId() ||
            RequestContextService.getUserId();
        const expected = resolveExpectedGitHubLogin(resolvedAgentIdentity);

        if (!expected) {
            return rejectIdentityAssertion(
                'GITHUB_IDENTITY_UNRESOLVED',
                'expected-identity-unresolved',
                'GitHub identity assertion failed: expected agent identity is unresolved or not registered in identityRoots.mjs.',
                {agentIdentity: resolvedAgentIdentity || null}
            );
        }

        const viewerLogin = normalizeGitHubLogin(await getViewerLogin({cwd}));

        if (!viewerLogin) {
            return rejectIdentityAssertion(
                'GITHUB_VIEWER_UNRESOLVED',
                'viewer-login-unresolved',
                `GitHub identity assertion failed: could not resolve effective GitHub viewer for expected agent '${expected.githubLogin}'.`,
                {
                    expectedIdentityId: expected.identityId,
                    expectedLogin     : expected.githubLogin
                }
            );
        }

        if (viewerLogin.toLowerCase() !== expected.githubLogin.toLowerCase()) {
            return rejectIdentityAssertion(
                'GITHUB_IDENTITY_MISMATCH',
                'viewer-login-mismatch',
                `GitHub identity assertion failed: expected agent '${expected.githubLogin}' but effective GitHub viewer is '${viewerLogin}'.`,
                {
                    expectedIdentityId: expected.identityId,
                    expectedLogin     : expected.githubLogin,
                    viewerLogin
                }
            );
        }

        const memoryCoreIdentity = await getMemoryCoreIdentity() || {};
        const memoryCoreLogin    = normalizeGitHubLogin(memoryCoreIdentity.githubLogin);

        if (memoryCoreLogin && memoryCoreLogin.toLowerCase() !== expected.githubLogin.toLowerCase()) {
            return rejectIdentityAssertion(
                'GITHUB_MEMORY_CORE_IDENTITY_MISMATCH',
                'memory-core-identity-mismatch',
                `GitHub identity assertion failed: expected agent '${expected.githubLogin}' but Memory Core self-identity is '${memoryCoreLogin}'.`,
                {
                    expectedIdentityId: expected.identityId,
                    expectedLogin     : expected.githubLogin,
                    memoryCoreLogin,
                    viewerLogin
                }
            );
        }

        return {
            ok                : true,
            expectedIdentityId: expected.identityId,
            expectedLogin     : expected.githubLogin,
            memoryCoreLogin   : memoryCoreLogin || null,
            viewerLogin
        };
    }
}

const service = Neo.setupClass(GitHubIdentityAssertionService);

/**
 * @summary Functional wrapper around the singleton identity assertion service.
 * @param {Object} [options] See {@link GitHubIdentityAssertionService#assertExpectedIdentity}.
 * @returns {Promise<Object>}
 */
function assertExpectedIdentity(options) {
    return service.assertExpectedIdentity(options);
}

export {
    assertExpectedIdentity,
    normalizeGitHubLogin,
    resolveExpectedGitHubLogin
};

export default service;
