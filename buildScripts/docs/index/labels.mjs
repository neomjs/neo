import fs              from 'fs-extra';
import path            from 'path';
import {Command}       from 'commander';
import {execFileSync}  from 'node:child_process';
import {fileURLToPath} from 'url';
import {sanitizeInput} from '../../util/sanitizer.mjs';

/**
 * @module buildScripts.createLabelIndex
 * @summary Fetches GitHub labels and generates a JSON index for the Neo.mjs Portal application.
 *
 * This script retrieves all labels from the repository via a self-contained paginated GraphQL
 * loop and writes a `labels.json` file consumed by the Portal's "Tickets" view to render label
 * badges. It calculates contrast colors (black/white) for accessibility based on each label's
 * background color.
 *
 * **Boundary note:** this script deliberately imports nothing from `ai/**`. The engine's build
 * pipeline must run with the Brain absent, and the label fetch is a plain paginated
 * `labels(first: 100)` GraphQL loop — small enough to own here, with the same query shape and the
 * same credential precedence (`GH_TOKEN` → `GITHUB_TOKEN` → `gh auth token`) the Brain's GraphQL
 * client documents. Earlier revisions imported the Brain's `LabelService` (which dragged in a full
 * Neo namespace bootstrap), and before that the `ai/services.mjs` barrel (which eagerly constructs
 * every MCP server including the Knowledge Base's `chromadb` client, breaking Body-tier CI). The
 * `check-engine-brain-boundary` guard now fails any reintroduction of that direction.
 *
 * **Key Features:**
 * - **GitHub Integration:** Fetches live label data directly from the GitHub GraphQL API.
 * - **Accessibility:** Automatically calculates optimal text contrast colors (YIQ formula).
 * - **Minification:** Outputs a minified JSON file for production use.
 *
 * @see apps/portal/view/news/tickets/Component.mjs
 * @see buildScripts/createTicketIndex.mjs
 * @keywords portal, labels, github, accessibility, build-script, knowledge-base
 */

const ROOT_DIR    = process.cwd();
const OUTPUT_FILE = path.resolve(ROOT_DIR, 'apps/portal/resources/data/labels.json');

/**
 * Query to fetch all labels in a repository, paginated. Mirrors the shape the Brain's
 * `labelQueries.mjs` uses so both sides of the former boundary keep returning identical rows.
 * @type {String}
 */
const FETCH_LABELS = `
  query FetchLabels($owner: String!, $repo: String!, $limit: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      labels(first: $limit, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          name
          color
          description
        }
      }
    }
  }
`;

/**
 * Resolves the GitHub auth token with the same precedence the Brain's GraphqlService documents:
 * `GH_TOKEN` → `GITHUB_TOKEN` → `gh auth token` (interactive/local fallback).
 * The raw token is never logged; on failure the error names the env vars to set.
 * @returns {String} The token.
 */
function getAuthToken() {
    const envToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

    if (envToken) {
        return envToken.trim();
    }

    try {
        return execFileSync('gh', ['auth', 'token'], {encoding: 'utf8'}).trim();
    } catch {
        throw new Error(
            'No GitHub credential found. Set GH_TOKEN or GITHUB_TOKEN, or authenticate the gh CLI (`gh auth login`).'
        );
    }
}

/**
 * Derives `{owner, repo}` from this repository's own package manifest, so the script carries no
 * hardcoded repository identity and no config import.
 * @returns {{owner: String, repo: String}}
 */
function getRepoIdentity() {
    const pkg   = fs.readJSONSync(path.resolve(ROOT_DIR, 'package.json'));
    const match = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(pkg?.repository?.url || '');

    if (!match) {
        throw new Error(`Cannot derive owner/repo from package.json repository.url: ${pkg?.repository?.url}`);
    }

    return {owner: match[1], repo: match[2]};
}

/**
 * Transient-failure contract, mirrored from the Brain's `GraphqlService` so dissolving the import
 * did not narrow the behavior: up to {@link MAX_RETRY_ATTEMPTS} retries after the first attempt,
 * exponential backoff with jitter capped at {@link RETRY_MAX_DELAY_MS}, `Retry-After` honored in
 * both seconds and HTTP-date forms, retryable statuses `[429, 502, 503, 504]`, and classified
 * transient network errors. Anything else fails immediately with the real status/message.
 */
const
    MAX_RETRY_ATTEMPTS      = 3,
    RETRY_BASE_DELAY_MS     = 1000,
    RETRY_MAX_DELAY_MS      = 10000,
    RETRY_JITTER_RATIO      = 0.2,
    RETRYABLE_HTTP_STATUSES = [429, 502, 503, 504],
    TRANSIENT_ERROR_MARKERS = [
        'fetch failed', 'network', 'terminated', 'timeout',
        'econnreset', 'etimedout', 'enotfound', 'eai_again', 'socket hang up'
    ];

/**
 * Determines whether a thrown transport error is likely transient (mirrors the Brain classifier).
 * @param {Error|*} error The thrown fetch error.
 * @returns {Boolean}
 */
function isRetryableNetworkError(error) {
    const message = [
        error?.message,
        error?.cause?.message,
        error?.cause?.code,
        error?.code,
        String(error)
    ].filter(Boolean).join(' ').toLowerCase();

    return TRANSIENT_ERROR_MARKERS.some(pattern => message.includes(pattern));
}

/**
 * Calculates the retry delay: `Retry-After` (seconds or HTTP-date) wins; otherwise capped
 * exponential backoff with jitter.
 * @param {Number} attempt The 1-based retry attempt.
 * @param {Response|null} response The failed response, if one exists.
 * @returns {Number} Delay in milliseconds.
 */
function getRetryDelay(attempt, response=null) {
    const retryAfter = response?.headers?.get?.('retry-after');

    if (retryAfter) {
        const seconds = Number(retryAfter);

        if (Number.isFinite(seconds)) {
            return Math.max(0, seconds * 1000);
        }

        const retryAt = Date.parse(retryAfter);

        if (Number.isFinite(retryAt)) {
            return Math.max(0, retryAt - Date.now());
        }
    }

    const baseDelay = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    const jitter    = baseDelay * RETRY_JITTER_RATIO * Math.random();

    return Math.round(baseDelay + jitter);
}

/**
 * Performs one GraphQL request with the full transient-retry envelope.
 * @param {Object} config
 * @param {Function} config.fetchFn Injected fetch (test seam; defaults to global fetch).
 * @param {Function} config.sleepFn Injected delay fn (test seam).
 * @param {Object}   config.headers Request headers.
 * @param {Object}   config.variables GraphQL variables for this page.
 * @returns {Promise<Object>} The parsed GraphQL payload.
 */
async function requestWithRetry({fetchFn, sleepFn, headers, variables}) {
    let response;

    for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
        try {
            response = await fetchFn('https://api.github.com/graphql', {
                method: 'POST',
                headers,
                body  : JSON.stringify({query: FETCH_LABELS, variables})
            });
        } catch (e) {
            if (attempt < MAX_RETRY_ATTEMPTS && isRetryableNetworkError(e)) {
                await sleepFn(getRetryDelay(attempt + 1));
                continue;
            }

            throw e;
        }

        if (response.ok) {
            break;
        }

        const errorMessage = `GitHub GraphQL request failed: ${response.status} ${response.statusText}`;

        if (attempt < MAX_RETRY_ATTEMPTS && RETRYABLE_HTTP_STATUSES.includes(response.status)) {
            await sleepFn(getRetryDelay(attempt + 1, response));
            continue;
        }

        throw new Error(errorMessage);
    }

    const payload = await response.json();

    if (payload.errors?.length) {
        throw new Error(`GitHub GraphQL errors: ${payload.errors.map(e => e.message).join('; ')}`);
    }

    return payload;
}

/**
 * Fetches every label in the repository through the paginated GraphQL loop, with the mirrored
 * transient-retry envelope. Non-transient failures throw with the real status and message, so CI
 * logs surface the actual error rather than a generic wrapper.
 * @param {Object} [deps] Test seams; production callers pass nothing.
 * @param {Function} [deps.fetchFn] Fetch implementation.
 * @param {Function} [deps.sleepFn] Delay implementation (receives ms).
 * @param {Function} [deps.getAuthTokenFn] Token resolver.
 * @param {Function} [deps.getRepoIdentityFn] Owner/repo resolver.
 * @returns {Promise<Object[]>} All label nodes (`{name, color, description}`).
 */
export async function fetchAllLabels({
    fetchFn           = fetch,
    sleepFn           = ms => new Promise(resolve => setTimeout(resolve, ms)),
    getAuthTokenFn    = getAuthToken,
    getRepoIdentityFn = getRepoIdentity
} = {}) {
    const
        token         = getAuthTokenFn(),
        {owner, repo} = getRepoIdentityFn(),
        allLabels     = [],
        headers       = {
            'Authorization': `Bearer ${token}`,
            'Content-Type' : 'application/json',
            'User-Agent'   : 'neo.mjs-build'
        };

    let hasNextPage = true,
        cursor      = null;

    while (hasNextPage) {
        const payload = await requestWithRetry({fetchFn, sleepFn, headers, variables: {owner, repo, limit: 100, cursor}});
        const labels  = payload.data.repository.labels;

        allLabels.push(...labels.nodes);
        hasNextPage = labels.pageInfo.hasNextPage;
        cursor      = labels.pageInfo.endCursor;
    }

    return allLabels;
}

/**
 * Calculates the optimal text color (black or white) for a given background color
 * using the YIQ color space formula.
 * @param {string} hexcolor - The 6-digit hex color (e.g., "aabbcc")
 * @returns {string} - Black or white hex color.
 */
function getContrastColor(hexcolor) {
    const r   = parseInt(hexcolor.substring(0, 2), 16);
    const g   = parseInt(hexcolor.substring(2, 4), 16);
    const b   = parseInt(hexcolor.substring(4, 6), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

/**
 * Main function to fetch labels and generate the index file.
 *
 * @param {Object} options Configuration options
 * @param {String} [options.outputFile] - Path to the output JSON file (defaults to `apps/portal/resources/data/labels.json`)
 * @returns {Promise<void>} Resolves when the JSON file is written
 */
async function createLabelIndex(options = {}) {
    const outputFile = options.outputFile || OUTPUT_FILE;

    console.log('Fetching labels from GitHub...');

    try {
        const rawLabels = await fetchAllLabels();

        const labels = rawLabels.map(label => ({
            color      : `#${label.color}`,
            description: label.description,
            name       : label.name,
            textColor  : getContrastColor(label.color)
        }));

        labels.sort((a, b) => a.name.localeCompare(b.name));

        console.log(`Found ${labels.length} labels. Writing to ${outputFile}...`);

        await fs.ensureDir(path.dirname(outputFile));
        await fs.writeJSON(outputFile, labels);

        console.log('Successfully generated labels.json');

    } catch (error) {
        console.error('Error generating label index:', error);
        // We throw here so the caller (CLI or other script) can handle it
        throw error;
    }
}

/**
 * CLI entry point for the script.
 * Handles argument parsing using `commander` and invokes the main `createLabelIndex` function.
 *
 * Supported flags:
 * - `-o, --output <path>`: Custom output file path
 */
async function runCli() {
    const program = new Command();

    program
        .name('create-label-index')
        .description('Generates a JSON index of GitHub labels for the Portal app.')
        .option('-o, --output <path>', 'Output file path', sanitizeInput);

    program.parse(process.argv);

    const opts = program.opts();

    await createLabelIndex({
        outputFile: opts.output ? path.resolve(ROOT_DIR, opts.output) : undefined
    });
}

const cliEntryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath   = fileURLToPath(import.meta.url);

if (cliEntryPath && cliEntryPath === modulePath) {
    runCli()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

export default createLabelIndex;
