import path from 'path';

/**
 * @summary Normalizes and guards tenant repo-access config entries for server-side KB ingestion.
 *
 * The tenant repo-sync lane intentionally separates clean repository identity from
 * credential material. A tenant config entry may name a `credentialRef`, but `cloneUrl` and
 * `repoSlug` must stay safe for graph persistence, logs, and telemetry. Git credentials are
 * injected later by the Git mirror worker, not stored in the Knowledge Base config node.
 *
 * @see https://github.com/neomjs/neo/issues/11787
 * @see https://github.com/neomjs/neo/issues/16045
 */

const URL_WITH_USERINFO_RE   = /^[a-z][a-z0-9+.-]*:\/\/[^/\s@]+@/iu;
const SCP_LIKE_USERINFO_RE   = /^[^/\s@:]+@[^/\s@:]+:/u;
const URL_SCHEME_RE          = /^[a-z][a-z0-9+.-]*:\/\//iu;
const SCP_LIKE_ENDPOINT_RE   = /^[^/\s:]{2,}:(?!\/\/)/u;
const ENV_CREDENTIAL_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const SSH_USERNAME_RE        = /^[A-Za-z0-9._-]+$/u;
const SECRET_REPLACEMENT     = '[REDACTED]';

export const TenantRepoAccessStatus = Object.freeze({
    READY   : 'ready',
    DEGRADED: 'degraded',
    UNKNOWN : 'unknown'
});

export const TenantRepoAccessCode = Object.freeze({
    CREDENTIAL_RESOLVED: 'KB_TENANT_REPO_ACCESS_CREDENTIAL_RESOLVED',
    CREDENTIAL_INVALID : 'KB_TENANT_REPO_ACCESS_CREDENTIAL_INVALID',
    CREDENTIAL_REJECTED: 'KB_TENANT_REPO_ACCESS_CREDENTIAL_REJECTED',
    INSUFFICIENT_SCOPE : 'KB_TENANT_REPO_ACCESS_INSUFFICIENT_SCOPE',
    READY              : 'KB_TENANT_REPO_ACCESS_READY',
    TIMEOUT            : 'KB_TENANT_REPO_ACCESS_TIMEOUT',
    TRANSPORT_FAILED   : 'KB_TENANT_REPO_ACCESS_TRANSPORT_FAILED',
    DENIED_OR_NOT_FOUND: 'KB_TENANT_REPO_ACCESS_DENIED_OR_NOT_FOUND',
    REF_NOT_FOUND      : 'KB_TENANT_REPO_ACCESS_REF_NOT_FOUND',
    REF_UNVERIFIED     : 'KB_TENANT_REPO_ACCESS_REF_UNVERIFIED',
    PROBE_FAILED       : 'KB_TENANT_REPO_ACCESS_PROBE_FAILED',
    EVIDENCE_EXPIRED   : 'KB_TENANT_REPO_ACCESS_EVIDENCE_EXPIRED',
    PROBE_UNAVAILABLE  : 'KB_TENANT_REPO_ACCESS_PROBE_UNAVAILABLE',
    SYNC_FAILED        : 'KB_TENANT_REPO_ACCESS_SYNC_FAILED'
});

const TENANT_REPO_ACCESS_CODES_BY_STATUS = Object.freeze({
    [TenantRepoAccessStatus.READY]: Object.freeze([
        TenantRepoAccessCode.READY
    ]),
    [TenantRepoAccessStatus.DEGRADED]: Object.freeze([
        TenantRepoAccessCode.CREDENTIAL_INVALID,
        TenantRepoAccessCode.CREDENTIAL_REJECTED,
        TenantRepoAccessCode.INSUFFICIENT_SCOPE,
        TenantRepoAccessCode.TIMEOUT,
        TenantRepoAccessCode.TRANSPORT_FAILED,
        TenantRepoAccessCode.DENIED_OR_NOT_FOUND,
        TenantRepoAccessCode.REF_NOT_FOUND,
        TenantRepoAccessCode.PROBE_FAILED,
        TenantRepoAccessCode.SYNC_FAILED
    ]),
    [TenantRepoAccessStatus.UNKNOWN]: Object.freeze([
        TenantRepoAccessCode.REF_UNVERIFIED,
        TenantRepoAccessCode.EVIDENCE_EXPIRED,
        TenantRepoAccessCode.PROBE_UNAVAILABLE
    ])
});

/**
 * @summary Checks the strict public status/code pairing for tenant-repo access evidence.
 * @param {String} status Candidate readiness status.
 * @param {String} code Candidate stable readiness code.
 * @returns {Boolean}
 */
export function isTenantRepoAccessReadinessOutcome(status, code) {
    return TENANT_REPO_ACCESS_CODES_BY_STATUS[status]?.includes(code) === true;
}

// Stderr signatures, matched against ALREADY-REDACTED text. They exist because a remote operator
// with no host access must be able to tell "the credential is wrong" from "the credential lacks the
// scope" from "the network never reached the host" — three different fixes. Order is load-bearing:
// a scope failure also says "denied", and an auth failure also says "not found" on some providers,
// so the narrower signature has to win.
const ACCESS_TRANSPORT_RE = /could not resolve host|temporary failure in name resolution|network is unreachable|failed to connect|connection (?:timed out|refused|reset)|ssh: connect to host/iu;
const ACCESS_SCOPE_RE     = /write access to repository not granted|insufficient scope|requires? the [^\n]{0,40}scope|403 forbidden|resource not accessible by (?:personal access token|integration)/iu;
const ACCESS_REJECTED_RE  = /authentication failed|invalid username or password|could not read username|terminal prompts disabled|permission denied \(publickey|bad credentials|401 unauthorized/iu;
const ACCESS_ABSENT_RE    = /repository not found|does not appear to be a git repository|remote:? .{0,20}not found/iu;

/**
 * @summary Classifies a redacted Git access failure into the public access-readiness vocabulary.
 *
 * Single classifier for the whole lane. It lives beside the vocabulary it returns so the probe path
 * and the sync path cannot disagree — before this was shared, the sync path recognised exactly ONE
 * error code and flattened every other cause to `SYNC_FAILED`, discarding a classification the probe
 * path had already computed correctly. A remote operator then saw "sync failed" for an under-scoped
 * token, an absent repository, and an unreachable host alike.
 *
 * `DENIED_OR_NOT_FOUND` stays a deliberately COMBINED cause. Providers answer 404 for both "no
 * access" and "does not exist" on purpose, so that repository existence is not leakable by probing.
 * Splitting it would mean inventing a distinction the provider refuses to make; reporting the honest
 * combined cause is the accurate answer.
 *
 * @param {Error} error Redacted access error (never carries credential material).
 * @returns {String} A `TenantRepoAccessCode` value.
 */
export function classifyTenantRepoAccessFailure(error) {
    if (error?.code === 'KB_GITMIRROR_ACCESS_PROBE_TIMEOUT') return TenantRepoAccessCode.TIMEOUT;
    // The credential REFERENCE could not be resolved at all — a config defect, upstream of any
    // network call, and distinct from a credential the remote rejected.
    if (error?.code === 'KB_GITMIRROR_CREDENTIAL_REF_INVALID') return TenantRepoAccessCode.CREDENTIAL_INVALID;

    const stderr = String(error?.stderr || '');

    if (ACCESS_TRANSPORT_RE.test(stderr)) return TenantRepoAccessCode.TRANSPORT_FAILED;
    if (ACCESS_SCOPE_RE.test(stderr))     return TenantRepoAccessCode.INSUFFICIENT_SCOPE;
    if (ACCESS_REJECTED_RE.test(stderr))  return TenantRepoAccessCode.CREDENTIAL_REJECTED;
    if (ACCESS_ABSENT_RE.test(stderr))    return TenantRepoAccessCode.DENIED_OR_NOT_FOUND;

    // A Git process that ran and exited non-zero without a recognised signature is still evidence
    // that acquisition was refused; only a failure with no exit status at all is unclassifiable.
    if (Number.isInteger(error?.exitCode)) return TenantRepoAccessCode.DENIED_OR_NOT_FOUND;

    return TenantRepoAccessCode.PROBE_FAILED;
}

/**
 * @summary Creates a contract error with a stable code for callers and tests.
 * @param {String} code Stable error code.
 * @param {String} message Human-readable error message.
 * @returns {Error}
 * @private
 */
function createContractError(code, message) {
    const error = new Error(message);

    error.code = code;

    return error;
}

/**
 * @summary Escapes a string for safe literal use inside a regular expression.
 * @param {String} value String to escape.
 * @returns {String}
 * @private
 */
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * @summary Strips the terminal `.git` suffix and surrounding slashes from a repo identity segment.
 * @param {String} value Repo identity candidate.
 * @returns {String}
 * @private
 */
function stripRepoSuffix(value) {
    return value.replace(/^\/+/u, '').replace(/\/+$/u, '').replace(/\.git$/iu, '');
}

/**
 * @summary Normalizes one path segment used in tenant repo mirror paths.
 * @param {String} value Segment candidate.
 * @param {String} code Stable error code.
 * @param {String} label Human-readable segment label.
 * @returns {String}
 * @private
 */
function normalizeMirrorPathSegment(value, code, label) {
    const segment = String(value || '').trim();

    if (
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.includes('/') ||
        segment.includes('\\') ||
        segment.includes('@') ||
        segment.includes(':') ||
        /\s/u.test(segment)
    ) {
        throw createContractError(code, `Tenant repo mirror path requires a clean ${label}`);
    }

    return segment;
}

/**
 * @summary Returns true when a clone URL embeds userinfo that could carry credentials.
 * @param {String} cloneUrl Candidate clone URL.
 * @returns {Boolean}
 */
export function hasCloneUrlUserInfo(cloneUrl) {
    const value = String(cloneUrl || '').trim();

    return URL_WITH_USERINFO_RE.test(value) || SCP_LIKE_USERINFO_RE.test(value);
}

/**
 * @summary Returns true when a clone URL is fetched over a transport rather than copied from a local path.
 *
 * The distinction is not cosmetic: git applies `--filter` only over a transport, and **ignores it silently
 * for local path clones** — so anything asserting a filter took effect must ask this question, and must ask
 * it about transport-ness rather than about a `://` scheme. `git@host:org/repo.git` carries no scheme and is
 * a documented tenant `cloneUrl` form; a scheme test excludes it and, with it, the assertion.
 *
 * Two accepted transport shapes, matching what config normalization already admits:
 * - scheme-qualified — `https://…`, `ssh://…`, `file://…`
 * - SCP-like — a colon appearing before any slash, with or without `user@`. A colon-before-slash is
 *   git's own SCP test; the `{2,}` guard keeps a single-character prefix out, so a Windows drive
 *   (`C:\repos\mirror`) stays a path rather than becoming a host.
 *
 * A single-character prefix is deliberately NOT transport: `C:\repos\mirror` is a Windows drive letter, and
 * git resolves the same ambiguity the same way. Everything else without a colon-before-slash is a path.
 *
 * Found by @neo-opus-grace, whose review showed the scheme test skipped the guard on the one URL form where
 * nothing else looks.
 *
 * @param {String} cloneUrl Candidate clone URL.
 * @returns {Boolean}
 */
export function isTransportCloneUrl(cloneUrl) {
    const value = String(cloneUrl || '').trim();

    return URL_SCHEME_RE.test(value) || SCP_LIKE_ENDPOINT_RE.test(value);
}

/**
 * @summary Returns true only for a non-secret SSH login name in a clone endpoint.
 * @param {String} cloneUrl Candidate clone URL.
 * @returns {Boolean}
 * @private
 */
function hasCleanSshUsername(cloneUrl) {
    const value = String(cloneUrl || '').trim();

    try {
        const url      = new URL(value);
        const username = decodeURIComponent(url.username);

        return url.protocol === 'ssh:'
            && !url.password
            && SSH_USERNAME_RE.test(username);
    } catch {
        const match = value.match(/^([^/\s@:]+)@([^/\s@:]+):(.+)$/u);

        return Boolean(match && SSH_USERNAME_RE.test(match[1]));
    }
}

/**
 * @summary Throws when a clone URL contains credential-shaped material.
 * @param {String} cloneUrl Candidate clone URL.
 * @returns {String} Trimmed clone URL.
 */
export function assertCleanCloneUrl(cloneUrl) {
    const value = String(cloneUrl || '').trim();

    if (!value) {
        throw createContractError(
            'KB_TENANT_REPO_CLONE_URL_REQUIRED',
            'Tenant repo config requires a non-empty cloneUrl'
        );
    }

    if (hasCloneUrlUserInfo(value) && !hasCleanSshUsername(value)) {
        throw createContractError(
            'KB_TENANT_REPO_CLONE_URL_CREDENTIALS',
            'Tenant repo cloneUrl must not embed userinfo or credentials'
        );
    }

    if (/[?#]/u.test(value)) {
        throw createContractError(
            'KB_TENANT_REPO_CLONE_URL_CREDENTIALS',
            'Tenant repo cloneUrl must not include query strings or fragments'
        );
    }

    return value;
}

/**
 * @summary Derives a deterministic, credential-free repo slug from a clean clone URL.
 *
 * The output is `host/org/repo` for URL-style clone URLs, or `host/path` for clean scp-like
 * clone strings. Caller-provided `repoSlug` values pass through {@link normalizeRepoSlug}
 * instead; this helper only fills the omission case.
 *
 * @param {String} cloneUrl Clean clone URL.
 * @returns {String}
 */
export function deriveRepoSlugFromCloneUrl(cloneUrl) {
    const value = assertCleanCloneUrl(cloneUrl);

    try {
        const url = new URL(value);

        if (!url.hostname || !url.pathname || url.pathname === '/') {
            throw new Error('missing repo path');
        }

        return normalizeRepoSlug(`${url.hostname}/${stripRepoSuffix(url.pathname)}`);
    } catch (error) {
        const scpLike = value.match(/^(?:[^/\s@:]+@)?([^/\s@:]+):(.+)$/u);

        if (scpLike) {
            return normalizeRepoSlug(`${scpLike[1]}/${stripRepoSuffix(scpLike[2])}`);
        }

        throw createContractError(
            'KB_TENANT_REPO_CLONE_URL_INVALID',
            'Tenant repo cloneUrl must be a clean URL or host:path git reference'
        );
    }
}

/**
 * @summary Normalizes a repo slug while keeping it safe for graph persistence and logs.
 * @param {String} repoSlug Repo slug candidate.
 * @returns {String}
 */
export function normalizeRepoSlug(repoSlug) {
    const value = stripRepoSuffix(String(repoSlug || '').trim());

    if (!value) {
        throw createContractError(
            'KB_TENANT_REPO_SLUG_REQUIRED',
            'Tenant repo config requires a repoSlug or derivable cloneUrl'
        );
    }

    if (
        value.includes('://') ||
        value.includes('@') ||
        value.includes(':') ||
        value.includes('..') ||
        value.startsWith('/') ||
        value.includes('\\') ||
        /[\s?#]/u.test(value)
    ) {
        throw createContractError(
            'KB_TENANT_REPO_SLUG_INVALID',
            'Tenant repo repoSlug must be a clean repository identity'
        );
    }

    return value;
}

/**
 * @summary Normalizes the shared, reference-only credential grammar for tenant repositories.
 *
 * Supported string forms are `none`, `env:NAME`, `file:/path`, and `ssh:/path`.
 * A bare environment-variable name remains supported for backward compatibility, but
 * any string containing an unknown scheme delimiter is rejected instead of being
 * reinterpreted as an environment-variable name.
 *
 * Object forms use the same four `type` values and the corresponding `name`,
 * `filePath`, or `keyPath` property. The returned object contains only fields consumed
 * by GitMirror, preventing unrelated config data from crossing the credential boundary.
 *
 * @param {String|Object|null} credentialRef Durable credential reference.
 * @param {Object} [options]
 * @param {Boolean} [options.allowOmitted=false] Allow `null` / `undefined` for local GitMirror callers.
 * @returns {Object|null}
 */
export function normalizeTenantRepoCredentialRef(credentialRef, {allowOmitted = false} = {}) {
    if (credentialRef === null || credentialRef === undefined) {
        if (allowOmitted) {
            return null;
        }

        throw createContractError(
            'KB_TENANT_REPO_CREDENTIAL_REF_REQUIRED',
            'Tenant repo config entries require credentialRef'
        );
    }

    let candidate;

    if (typeof credentialRef === 'string') {
        const value = credentialRef.trim();

        if (!value) {
            throw createContractError(
                'KB_TENANT_REPO_CREDENTIAL_REF_INVALID',
                'Tenant repo credentialRef must be a non-empty supported reference'
            );
        }

        if (value === 'none') {
            return {type: 'none'};
        }

        const separatorIndex = value.indexOf(':');

        if (separatorIndex === -1) {
            candidate = {type: 'env', name: value};
        } else {
            const
                type   = value.slice(0, separatorIndex),
                target = value.slice(separatorIndex + 1).trim();

            if (type === 'env') {
                candidate = {type, name: target};
            } else if (type === 'file') {
                candidate = {type, filePath: target};
            } else if (type === 'ssh') {
                candidate = {type, keyPath: target};
            } else {
                throw createContractError(
                    'KB_TENANT_REPO_CREDENTIAL_REF_INVALID',
                    'Tenant repo credentialRef uses an unsupported scheme'
                );
            }
        }
    } else if (typeof credentialRef === 'object' && !Array.isArray(credentialRef)) {
        candidate = credentialRef;
    } else {
        throw createContractError(
            'KB_TENANT_REPO_CREDENTIAL_REF_INVALID',
            'Tenant repo credentialRef must be a supported string or object reference'
        );
    }

    const type = candidate.type;

    if (!['none', 'env', 'file', 'ssh'].includes(type)) {
        throw createContractError(
            'KB_TENANT_REPO_CREDENTIAL_REF_INVALID',
            'Tenant repo credentialRef uses an unsupported type'
        );
    }

    const normalized = {type};

    if (type === 'env') {
        const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';

        if (!ENV_CREDENTIAL_NAME_RE.test(name)) {
            throw createContractError(
                'KB_TENANT_REPO_CREDENTIAL_REF_INVALID',
                'Tenant repo env credentialRef requires a valid environment-variable name'
            );
        }

        normalized.name = name;
    } else if (type === 'file') {
        const filePath = typeof candidate.filePath === 'string' ? candidate.filePath.trim() : '';

        if (!filePath) {
            throw createContractError(
                'KB_TENANT_REPO_CREDENTIAL_REF_INVALID',
                'Tenant repo file credentialRef requires filePath'
            );
        }

        normalized.filePath = filePath;
    } else if (type === 'ssh') {
        const keyPath = typeof candidate.keyPath === 'string' ? candidate.keyPath.trim() : '';

        if (!keyPath) {
            throw createContractError(
                'KB_TENANT_REPO_CREDENTIAL_REF_INVALID',
                'Tenant repo ssh credentialRef requires keyPath'
            );
        }

        normalized.keyPath = keyPath;
    }

    if (Object.hasOwn(candidate, 'username')) {
        const username = typeof candidate.username === 'string' ? candidate.username.trim() : '';

        if (!['env', 'file'].includes(type) || !username || /[\r\n]/u.test(username)) {
            throw createContractError(
                'KB_TENANT_REPO_CREDENTIAL_REF_INVALID',
                'Tenant repo env/file credentialRef username must be a non-empty single-line string'
            );
        }

        normalized.username = username;
    }

    return normalized;
}

/**
 * @summary Normalizes one tenant repo-access config entry and enforces the no-secret boundary.
 * @param {Object} entry Tenant repo-access config entry.
 * @param {String} [entry.branchRef] Optional git ref (branch / tag / sha) to ingest from. When
 *     omitted the downstream envelope builder defaults to `'HEAD'` (= remote default branch).
 *     Useful for tenants whose canonical product-source-of-truth branch differs from the
 *     repo's default branch (e.g., trunk-based teams using `dev` as integration line and
 *     `main` as release-tag-only).
 * @returns {{cloneUrl: String, credentialRef: (String|Object), repoSlug: String, branchRef: String}} `branchRef` only present when configured.
 */
export function normalizeTenantRepoEntry(entry = {}) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw createContractError(
            'KB_TENANT_REPO_ENTRY_INVALID',
            'Tenant repo config entries must be objects'
        );
    }

    const cloneUrl = assertCleanCloneUrl(entry.cloneUrl);

    if (!entry.credentialRef) {
        throw createContractError(
            'KB_TENANT_REPO_CREDENTIAL_REF_REQUIRED',
            'Tenant repo config entries require credentialRef'
        );
    }

    normalizeTenantRepoCredentialRef(entry.credentialRef);

    if (Object.hasOwn(entry, 'branchRef') && (typeof entry.branchRef !== 'string' || entry.branchRef.trim() === '')) {
        throw createContractError(
            'KB_TENANT_REPO_ENTRY_INVALID',
            'Tenant repo config branchRef must be a non-empty string when present'
        );
    }

    return {
        ...entry,
        cloneUrl,
        credentialRef: entry.credentialRef,
        repoSlug     : entry.repoSlug ? normalizeRepoSlug(entry.repoSlug) : deriveRepoSlugFromCloneUrl(cloneUrl)
    };
}

/**
 * @summary Normalizes an optional `tenantRepos` config array.
 * @param {Object} config Tenant KB config payload.
 * @returns {Object}
 */
export function normalizeTenantRepoConfig(config = {}) {
    if (!Object.hasOwn(config, 'tenantRepos')) {
        return config;
    }

    if (!Array.isArray(config.tenantRepos)) {
        throw createContractError(
            'KB_TENANT_REPOS_INVALID',
            'Tenant repo config tenantRepos must be an array'
        );
    }

    return {
        ...config,
        tenantRepos: config.tenantRepos.map(entry => normalizeTenantRepoEntry(entry))
    };
}

/**
 * @summary Derives the credential-free local mirror path for a tenant repo.
 *
 * This helper intentionally only maps already-normalized identity values to a filesystem path.
 * Git clone/fetch lifecycle and credential injection remain owned by the Git mirror primitive.
 *
 * @param {Object} data
 * @param {String} data.mirrorRoot Root directory for tenant repo mirrors.
 * @param {String} data.tenantId Tenant id.
 * @param {String} data.repoSlug Clean repo slug.
 * @returns {String}
 */
export function deriveTenantRepoMirrorPath({mirrorRoot, tenantId, repoSlug} = {}) {
    const root = String(mirrorRoot || '').trim();

    if (!root) {
        throw createContractError(
            'KB_TENANT_REPO_MIRROR_ROOT_REQUIRED',
            'Tenant repo mirror path requires mirrorRoot'
        );
    }

    const tenantSegment = normalizeMirrorPathSegment(
        tenantId,
        'KB_TENANT_REPO_MIRROR_TENANT_INVALID',
        'tenantId'
    );
    const repoSegments = normalizeRepoSlug(repoSlug)
        .split('/')
        .map(segment => normalizeMirrorPathSegment(
            segment,
            'KB_TENANT_REPO_MIRROR_REPO_INVALID',
            'repoSlug segment'
        ));

    return path.join(root, 'tenant-repos', tenantSegment, ...repoSegments);
}

/**
 * @summary Redacts tenant repo credentials from strings or structured log payloads.
 *
 * This is deliberately small: it strips URL/scp-style userinfo and replaces explicit secret hints.
 * The helper is for defensive log formatting; credential acquisition remains outside this module.
 *
 * @param {*} input String, array, object, or primitive to redact.
 * @param {Object} [options]
 * @param {String[]} [options.secretHints] Optional known secret values to replace.
 * @returns {*} A redacted copy of `input`.
 */
export function redactTenantRepoSecrets(input, {secretHints = []} = {}) {
    if (typeof input === 'string') {
        let redacted = input
            .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/giu, `$1${SECRET_REPLACEMENT}@`)
            .replace(/(^|\s)([^/\s@:]+)@([^/\s@:]+:)/gu, `$1${SECRET_REPLACEMENT}@$3`);

        for (const secret of secretHints) {
            if (typeof secret === 'string' && secret.length > 0) {
                redacted = redacted.replace(new RegExp(escapeRegExp(secret), 'gu'), SECRET_REPLACEMENT);
            }
        }

        return redacted;
    }

    if (Array.isArray(input)) {
        return input.map(item => redactTenantRepoSecrets(item, {secretHints}));
    }

    if (input && typeof input === 'object') {
        return Object.fromEntries(
            Object.entries(input).map(([key, value]) => [key, redactTenantRepoSecrets(value, {secretHints})])
        );
    }

    return input;
}
