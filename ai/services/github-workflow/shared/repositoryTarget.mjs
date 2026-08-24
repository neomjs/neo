/**
 * Pre-Flight (structural fast-path): this module matches the pure, no-I/O policy helpers
 * `discussionRoutingDisposition.mjs` and `conversationTrust.mjs` in this directory. It owns one
 * github-workflow request-boundary contract and introduces no new directory role.
 *
 * @module ai/services/github-workflow/shared/repositoryTarget
 * @summary Resolves one optional per-request GitHub repository without importing, mutating, or shadowing AiConfig.
 *
 * AiConfig remains the deployment-home SSOT. Each consumer reads its resolved home leaves inline at
 * the use site and supplies them to this pure function; this module never imports or aliases config.
 * Explicit targets are request data and never write back into the singleton. Keeping both branches
 * here prevents 18 MCP operations from inventing subtly different bare-name or refusal semantics.
 *
 * @see learn/agentos/decisions/0019-aiconfig-reactive-provider-ssot.md
 */

export const REPOSITORY_TARGET_INVALID = 'REPOSITORY_TARGET_INVALID';

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/,
      REPO_PATTERN  = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * @summary Builds the typed, no-I/O refusal returned for malformed explicit repository targets.
 * @param {*} value Rejected caller value.
 * @returns {{error: String, message: String, code: String, rejectedRepo: *}}
 */
function invalidRepositoryTarget(value) {
    return {
        error       : 'Invalid Repository Target',
        message     : `[${REPOSITORY_TARGET_INVALID}] Invalid repository target ${JSON.stringify(value)}. Expected a GitHub repository name or exactly one 'owner/name' pair; empty values, invalid owner/repository characters, whitespace, backslashes, and additional slashes are refused.`,
        code        : REPOSITORY_TARGET_INVALID,
        rejectedRepo: value
    }
}

/**
 * @summary Resolves omitted, bare-name, and full owner/name repository targets.
 *
 * For an omitted value, returns the home leaves the caller read from AiConfig at its use site. A
 * bare name uses that deployment home owner. A full `owner/name` pair is used exactly as supplied.
 * Explicit values are never trimmed or normalized: accepting a corrected spelling after the caller
 * supplied a different target could send a mutation somewhere the request did not name.
 *
 * @param {*} value Optional MCP `repo` input.
 * @param {Object} home Resolved deployment-home repository read by the consumer at the use site.
 * @param {String} home.owner Deployment-home GitHub owner.
 * @param {String} home.repo Deployment-home GitHub repository name.
 * @returns {{owner: String, repo: String, fullName: String, explicit: Boolean}|{error: String, message: String, code: String, rejectedRepo: *}}
 */
export function resolveRepositoryTarget(value, {owner: homeOwner, repo: homeRepo}) {
    if (value === undefined) {
        return {
            owner   : homeOwner,
            repo    : homeRepo,
            fullName: `${homeOwner}/${homeRepo}`,
            explicit: false
        }
    }

    if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
        return invalidRepositoryTarget(value)
    }

    const segments = value.split('/');

    const explicitOwner = segments.length === 2 ? segments[0] : null,
          explicitRepo  = segments.length === 2 ? segments[1] : segments[0];

    if (
        segments.length > 2 ||
        (explicitOwner !== null && !OWNER_PATTERN.test(explicitOwner)) ||
        !REPO_PATTERN.test(explicitRepo) ||
        explicitRepo === '.' ||
        explicitRepo === '..'
    ) {
        return invalidRepositoryTarget(value)
    }

    const owner = explicitOwner || homeOwner,
          repo  = explicitRepo;

    return {
        owner,
        repo,
        fullName: `${owner}/${repo}`,
        explicit: true
    }
}

export default resolveRepositoryTarget;
