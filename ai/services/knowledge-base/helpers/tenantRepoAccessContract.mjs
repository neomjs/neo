import path from 'path';

/**
 * @summary Normalizes and guards tenant repo-access config entries for server-side KB ingestion.
 *
 * The tenant repo-sync lane (#11731) intentionally separates clean repository identity from
 * credential material. A tenant config entry may name a `credentialRef`, but `cloneUrl` and
 * `repoSlug` must stay safe for graph persistence, logs, and telemetry. Git credentials are
 * injected later by the Git mirror worker (#11788), not stored in the Knowledge Base config node.
 *
 * @see https://github.com/neomjs/neo/issues/11787
 */

const URL_WITH_USERINFO_RE = /^[a-z][a-z0-9+.-]*:\/\/[^/\s@]+@/iu;
const SCP_LIKE_USERINFO_RE = /^[^/\s@:]+@[^/\s@:]+:/u;
const SECRET_REPLACEMENT   = '[REDACTED]';

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

    if (hasCloneUrlUserInfo(value)) {
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
        const scpLike = value.match(/^([^/\s@:]+):(.+)$/u);

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
 * @summary Normalizes one tenant repo-access config entry and enforces the no-secret boundary.
 * @param {Object} entry Tenant repo-access config entry.
 * @param {String} [entry.branchRef] Optional git ref (branch / tag / sha) to ingest from. When
 *     omitted the downstream envelope builder defaults to `'HEAD'` (= remote default branch).
 *     Useful for tenants whose canonical product-source-of-truth branch differs from the
 *     repo's default branch (e.g., trunk-based teams using `dev` as integration line and
 *     `main` as release-tag-only).
 * @returns {{cloneUrl: String, credentialRef: String|Object, repoSlug: String, branchRef?: String}}
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
 * Git clone/fetch lifecycle and credential injection remain owned by the Git mirror primitive (#11788).
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
