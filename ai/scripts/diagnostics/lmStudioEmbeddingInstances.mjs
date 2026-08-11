/**
 * @plane in-plane
 */
import 'dotenv/config';

import {Command, InvalidArgumentError} from 'commander';
import {pathToFileURL}                 from 'node:url';

/**
 * Pre-Flight (structural fast-path): authoring
 * `ai/scripts/diagnostics/lmStudioEmbeddingInstances.mjs` matches sibling pattern of
 * `ai/scripts/diagnostics/gemini-incident-cost-ledger.mjs` and
 * `ai/scripts/diagnostics/mcpHealthcheck.mjs` in `ai/scripts/diagnostics/`; all are
 * read-only local diagnostics CLIs with exported pure helpers plus unit coverage.
 * Sibling-file-lift applies; no novel directory choice.
 *
 * @module ai/scripts/diagnostics/lmStudioEmbeddingInstances
 * @summary Detects duplicate loaded LM Studio embedding model instances.
 *
 * Local Agent OS clones can share one LM Studio `lms server`, but repeated or
 * concurrent embedding requests may leave instance-suffixed workers loaded
 * (`model`, `model:2`, `model:3`). This diagnostic reads the LM Studio model
 * list endpoint, groups loaded embedding models by canonical id, and fails loud
 * when the loaded embedding worker count exceeds the configured limit.
 *
 * @see https://github.com/neomjs/neo/issues/13539
 */

export const DEFAULT_MODELS_URL       = 'http://127.0.0.1:1234/api/v0/models';
export const DEFAULT_EMBEDDING_PREFIX = 'text-embedding-';
export const DEFAULT_MAX_LOADED       = 1;
export const DEFAULT_TIMEOUT_MS       = 5000;

/**
 * @summary Parses a non-negative integer CLI option.
 * @param {String} flag The CLI flag name.
 * @returns {Function}
 */
function parseNonNegativeInteger(flag) {
    return value => {
        const parsed = Number(value);

        if (!Number.isInteger(parsed) || parsed < 0) {
            throw new InvalidArgumentError(`${flag} requires a non-negative integer`);
        }

        return parsed;
    };
}

/**
 * @summary Reads a non-negative integer default from the environment.
 * @param {String|undefined} value Environment value.
 * @param {Number} fallback Default value when the env var is unset.
 * @param {String} name Environment variable name for the error message.
 * @returns {Number}
 */
function readNonNegativeIntegerDefault(value, fallback, name) {
    if (value === undefined || value === '') {
        return fallback;
    }

    return parseNonNegativeInteger(name)(value);
}

/**
 * @summary Parses CLI arguments and env-backed defaults.
 * @param {String[]} [argv=[]] CLI arguments without `node` / script path.
 * @param {Object} [env=process.env] Environment source.
 * @returns {Object}
 */
export function parseArgs(argv = [], env = process.env) {
    const program = new Command();

    program
        .name('lmStudioEmbeddingInstances')
        .description('Detect duplicate loaded LM Studio embedding model instances.')
        .exitOverride()
        .allowExcessArguments(false)
        .option('--url <url>', 'LM Studio model-list endpoint.', env.NEO_LM_STUDIO_MODELS_URL || DEFAULT_MODELS_URL)
        .option('--embedding-prefix <prefix>', 'Loaded model id prefix to count.', env.NEO_LM_STUDIO_EMBEDDING_PREFIX || DEFAULT_EMBEDDING_PREFIX)
        .option('--max-loaded <count>', 'Maximum tolerated loaded matching embedding workers.', parseNonNegativeInteger('--max-loaded'), readNonNegativeIntegerDefault(env.NEO_LM_STUDIO_MAX_LOADED_EMBEDDINGS, DEFAULT_MAX_LOADED, 'NEO_LM_STUDIO_MAX_LOADED_EMBEDDINGS'))
        .option('--timeout-ms <ms>', 'Maximum wait for the LM Studio model-list request.', parseNonNegativeInteger('--timeout-ms'), readNonNegativeIntegerDefault(env.NEO_LM_STUDIO_MODELS_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 'NEO_LM_STUDIO_MODELS_TIMEOUT_MS'))
        .option('--json', 'Print JSON instead of the human-readable report.', false);

    program.configureOutput({writeOut: () => {}, writeErr: () => {}});
    program.parse(argv, {from: 'user'});

    const options = program.opts();

    return {
        url            : options.url,
        embeddingPrefix: options.embeddingPrefix,
        maxLoaded      : options.maxLoaded,
        timeoutMs      : options.timeoutMs,
        json           : options.json
    };
}

/**
 * @summary Normalizes the LM Studio model-list response into an array.
 * @param {Object|Array} payload LM Studio `/api/v0/models` payload.
 * @returns {Object[]}
 */
export function normalizeModelsPayload(payload) {
    if (Array.isArray(payload)) {
        return payload;
    }
    if (Array.isArray(payload?.data)) {
        return payload.data;
    }

    throw new Error('LM Studio model-list response must be an array or an object with a data array.');
}

/**
 * @summary Strips LM Studio's duplicate-instance suffix from a model id.
 * @param {String} id Model id from the LM Studio API.
 * @returns {String}
 */
export function getCanonicalModelId(id) {
    return String(id || '').replace(/:\d+$/, '');
}

/**
 * @summary Selects loaded embedding models matching the configured id prefix.
 * @param {Object[]} models LM Studio model rows.
 * @param {Object} [options]
 * @param {String} [options.embeddingPrefix=DEFAULT_EMBEDDING_PREFIX]
 * @returns {Object[]}
 */
export function selectLoadedEmbeddingModels(models, {embeddingPrefix = DEFAULT_EMBEDDING_PREFIX} = {}) {
    return normalizeModelsPayload(models)
        .filter(model => {
            const id = String(model?.id || '');

            return id.startsWith(embeddingPrefix) &&
                String(model?.state || '').toLowerCase() === 'loaded' &&
                (!model?.type || model.type === 'embeddings');
        })
        .map(model => ({
            id         : model.id,
            canonicalId: getCanonicalModelId(model.id),
            type       : model.type || null,
            state      : model.state,
            publisher  : model.publisher || null,
            arch       : model.arch || null
        }));
}

/**
 * @summary Groups loaded models by canonical id.
 * @param {Object[]} loadedModels Loaded model rows from `selectLoadedEmbeddingModels`.
 * @returns {Object[]}
 */
export function groupLoadedModels(loadedModels) {
    const groups = new Map();

    for (const model of loadedModels) {
        if (!groups.has(model.canonicalId)) {
            groups.set(model.canonicalId, []);
        }

        groups.get(model.canonicalId).push(model.id);
    }

    return Array.from(groups.entries())
        .map(([canonicalId, ids]) => ({
            canonicalId,
            ids,
            count: ids.length
        }))
        .sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
}

/**
 * @summary Classifies loaded embedding worker state.
 * @param {Object|Array} payload LM Studio model-list response.
 * @param {Object} [options]
 * @param {String} [options.url=DEFAULT_MODELS_URL]
 * @param {String} [options.embeddingPrefix=DEFAULT_EMBEDDING_PREFIX]
 * @param {Number} [options.maxLoaded=DEFAULT_MAX_LOADED]
 * @returns {Object}
 */
export function analyzeEmbeddingInstances(payload, {
    url             = DEFAULT_MODELS_URL,
    embeddingPrefix = DEFAULT_EMBEDDING_PREFIX,
    maxLoaded       = DEFAULT_MAX_LOADED
} = {}) {
    const
        loadedModels    = selectLoadedEmbeddingModels(payload, {embeddingPrefix}),
        groups          = groupLoadedModels(loadedModels),
        duplicateGroups = groups.filter(group => group.count > 1),
        reasons         = [];

    if (loadedModels.length > maxLoaded) {
        reasons.push('loaded-count-exceeded');
    }
    if (duplicateGroups.length > 0) {
        reasons.push('duplicate-instance-suffixes');
    }

    return {
        ok         : reasons.length === 0,
        generatedAt: new Date().toISOString(),
        url,
        embeddingPrefix,
        maxLoaded,
        loadedCount: loadedModels.length,
        loadedModels,
        groups,
        duplicateGroups,
        reasons
    };
}

/**
 * @summary Fetches and parses the LM Studio model-list response.
 * @param {Object} options
 * @param {String} options.url LM Studio models endpoint.
 * @param {Number} [options.timeoutMs=DEFAULT_TIMEOUT_MS] Timeout in milliseconds.
 * @param {Function} [options.fetchImpl=fetch] Injectable fetch implementation for tests.
 * @returns {Promise<Object>}
 */
export async function fetchModels({url, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch}) {
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), timeoutMs);

    try {
        const response = await fetchImpl(url, {signal: abortController.signal});

        if (!response?.ok) {
            throw new Error(`LM Studio model-list request failed with HTTP ${response?.status || '<unknown>'}.`);
        }

        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

/**
 * @summary Runs the full read-only duplicate embedding diagnostic.
 * @param {Object} options CLI-shaped diagnostic options.
 * @param {Function} [options.fetchImpl=fetch] Injectable fetch implementation for tests.
 * @returns {Promise<Object>}
 */
export async function runDiagnostic(options) {
    const payload = await fetchModels(options);

    return analyzeEmbeddingInstances(payload, options);
}

/**
 * @summary Formats a human-readable duplicate embedding report.
 * @param {Object} analysis Result from `analyzeEmbeddingInstances`.
 * @returns {String}
 */
export function formatReport(analysis) {
    const lines = [
        `LM Studio Embedding Instances (#13539): ${analysis.ok ? 'OK' : 'FAIL'}`,
        `Endpoint: ${analysis.url}`,
        `Prefix: ${analysis.embeddingPrefix}`,
        `Loaded matching workers: ${analysis.loadedCount}/${analysis.maxLoaded}`,
        ''
    ];

    if (analysis.loadedModels.length === 0) {
        lines.push('Loaded models: none');
    } else {
        lines.push('Loaded models:');
        for (const model of analysis.loadedModels) {
            lines.push(`- ${model.id} (canonical: ${model.canonicalId})`);
        }
    }

    if (analysis.duplicateGroups.length > 0) {
        lines.push('', 'Duplicate groups:');
        for (const group of analysis.duplicateGroups) {
            lines.push(`- ${group.canonicalId}: ${group.ids.join(', ')}`);
        }
    }

    if (analysis.reasons.length > 0) {
        lines.push('', `Reasons: ${analysis.reasons.join(', ')}`);
    }

    return `${lines.join('\n')}\n`;
}

async function main() {
    let options;

    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        if (error.code === 'commander.helpDisplayed') {
            return;
        }
        throw error;
    }

    try {
        const analysis = await runDiagnostic(options);

        if (options.json) {
            console.log(JSON.stringify(analysis, null, 2));
        } else {
            process.stdout.write(formatReport(analysis));
        }

        if (!analysis.ok) {
            process.exitCode = 1;
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exitCode = 1;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
