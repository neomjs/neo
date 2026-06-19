import {program}                      from 'commander';
import {ChromaClient}                 from 'chromadb';
import {execFile}                     from 'child_process';
import fs                             from 'fs-extra';
import os                             from 'os';
import path                           from 'path';
import {pathToFileURL}                from 'url';
import {promisify}                    from 'util';
import Neo                            from '../../../src/Neo.mjs';
import AiConfig                       from '../../config.mjs';
import kbConfig                       from '../../mcp/server/knowledge-base/config.mjs';
import mcConfig                       from '../../mcp/server/memory-core/config.mjs';
import {
    createDynamicTextEmbeddingFunction,
    registerNeoChromaEmbeddingFunctions
} from '../../services/shared/vector/chromaClientPrimitives.mjs';

/**
 * @summary On-demand Chroma integrity diagnostic for unified-store SQLite and API read paths.
 *
 * This script is intentionally outside KB/MC healthcheck hot paths. It copies
 * `chroma.sqlite3` to a temporary snapshot before running SQLite integrity pragmas,
 * then performs read-only Chroma API probes against the configured collections.
 * It never runs `REINDEX`, `VACUUM`, delete/recreate, or live-store repair.
 *
 * Usage:
 *   node ai/scripts/maintenance/checkChromaIntegrity.mjs
 *   node ai/scripts/maintenance/checkChromaIntegrity.mjs --skip-api
 *   node ai/scripts/maintenance/checkChromaIntegrity.mjs --sqlite /path/to/chroma.sqlite3 --json
 *
 * @module ai.scripts.maintenance.checkChromaIntegrity
 * @see learn/agentos/decisions/0017-chroma-single-flat-unified-store.md
 * @see learn/agentos/tooling/RestorationRunbook.md
 */

const execFileAsync = promisify(execFile);
void Neo;

export const DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE = 5;

registerNeoChromaEmbeddingFunctions({
    dummyEmbeddingFunction: AiConfig.dummyEmbeddingFunction
});

/**
 * @param {String} output
 * @returns {{ok: Boolean, output: String}}
 */
export function classifySqliteCheck(output) {
    const normalized = String(output || '').trim();

    return {
        ok    : normalized === 'ok',
        output: normalized
    }
}

/**
 * @param {Object} options
 * @param {String} [options.sqlitePath]
 * @param {Object} [options.memoryCoreConfig=mcConfig]
 * @returns {String}
 */
export function resolveSqlitePath({sqlitePath, memoryCoreConfig = mcConfig} = {}) {
    if (sqlitePath) {
        return path.resolve(sqlitePath)
    }

    return path.join(memoryCoreConfig.engines.chroma.dataDir, 'chroma.sqlite3')
}

/**
 * @param {Object} options
 * @param {Object} [options.knowledgeBaseConfig=kbConfig]
 * @param {Object} [options.memoryCoreConfig=mcConfig]
 * @returns {String[]}
 */
export function resolveCollectionNames({
    knowledgeBaseConfig = kbConfig,
    memoryCoreConfig    = mcConfig
} = {}) {
    return [
        knowledgeBaseConfig.collectionName,
        memoryCoreConfig.collections.memory,
        memoryCoreConfig.collections.session,
        memoryCoreConfig.collections.graph
    ].filter(Boolean)
}

/**
 * @param {Object[]} collectionResults
 * @returns {Number}
 */
export function countFailedApiSteps(collectionResults = []) {
    return collectionResults.reduce((count, collection) => {
        return count + (collection.steps || []).filter(step => step.ok === false).length
    }, 0)
}

/**
 * @param {Object} options
 * @param {String} options.sourcePath
 * @param {Object} [options.fsModule=fs]
 * @param {String} [options.tmpRoot=os.tmpdir()]
 * @returns {Promise<{snapshotPath: String, tmpDir: String}>}
 */
export async function copySqliteSnapshot({
    sourcePath,
    fsModule = fs,
    tmpRoot  = os.tmpdir()
} = {}) {
    if (!await fsModule.pathExists(sourcePath)) {
        throw new Error(`Chroma SQLite file not found: ${sourcePath}`)
    }

    const tmpDir       = await fsModule.mkdtemp(path.join(tmpRoot, 'neo-chroma-integrity-')),
          snapshotPath = path.join(tmpDir, 'chroma.sqlite3');

    await fsModule.copy(sourcePath, snapshotPath);

    return {snapshotPath, tmpDir}
}

/**
 * @param {Object} options
 * @param {String} options.snapshotPath
 * @param {String} options.pragma
 * @param {Function} [options.execFn=execFileAsync]
 * @returns {Promise<Object>}
 */
export async function runSqlitePragma({
    snapshotPath,
    pragma,
    execFn = execFileAsync
} = {}) {
    try {
        const {stdout} = await execFn('sqlite3', [snapshotPath, `pragma ${pragma};`], {
            maxBuffer: 64 * 1024 * 1024
        });

        return classifySqliteCheck(stdout)
    } catch (error) {
        return {
            ok    : false,
            output: '',
            error : error.message
        }
    }
}

/**
 * @param {String} label
 * @param {Function} fn
 * @returns {Promise<Object>}
 */
async function runStep(label, fn) {
    try {
        return {
            label,
            ok   : true,
            value: await fn()
        }
    } catch (error) {
        return {
            label,
            ok   : false,
            error: error.message
        }
    }
}

/**
 * @param {*} value
 * @returns {Number}
 */
export function normalizeExportabilitySampleSize(value) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 1) {
        return DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE
    }

    return Math.floor(parsed)
}

/**
 * @param {Object} options
 * @param {Object} options.collection
 * @param {Number} [options.sampleSize=DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE]
 * @returns {Promise<Object>}
 */
export async function probeStoredEmbeddingExportability({
    collection,
    sampleSize = DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE
} = {}) {
    const label          = 'stored embedding exportability',
          normalizedSize = normalizeExportabilitySampleSize(sampleSize);

    let ids = [];
    try {
        const response = await collection.get({
            limit  : normalizedSize,
            include: []
        });

        ids = response.ids || [];
    } catch (error) {
        return {
            label,
            ok   : false,
            error: error.message
        }
    }

    const failures = [];
    let succeeded  = 0;

    for (const id of ids) {
        try {
            const response = await collection.get({
                ids    : [id],
                include: ['embeddings']
            });

            const embedding = response.embeddings?.[0];
            if (!response.ids?.length || !embedding?.length) {
                throw new Error('Stored embedding missing from single-id export')
            }

            succeeded++;
        } catch (error) {
            failures.push({
                id,
                error: error.message
            });
        }
    }

    return {
        label,
        ok   : failures.length === 0,
        value: {
            sampled: ids.length,
            succeeded,
            failed : failures.length,
            failures
        }
    }
}

/**
 * @param {Object} options
 * @param {Object} options.collection
 * @param {String} options.name
 * @param {Number} [options.exportabilitySampleSize=DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE]
 * @returns {Promise<Object>}
 */
export async function probeCollection({
    collection,
    name,
    exportabilitySampleSize = DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE
}) {
    const result = {
        name,
        steps: []
    };

    result.steps.push(await runStep('count', async () => collection.count()));

    const idsStep = await runStep('get ids limit 1', async () => {
        const response = await collection.get({limit: 1, include: []});
        return response.ids
    });

    result.steps.push(idsStep);

    const exportabilityStep = await probeStoredEmbeddingExportability({
        collection,
        sampleSize: exportabilitySampleSize
    });

    const id = idsStep.ok ? idsStep.value?.[0] : null;
    if (!id) {
        result.steps.push(exportabilityStep);
        return result
    }

    result.steps.push(await runStep('get metadata/document by id', async () => {
        const response = await collection.get({
            ids    : [id],
            include: ['metadatas', 'documents']
        });

        return {
            ids   : response.ids.length,
            hasDoc: typeof response.documents?.[0] === 'string'
        }
    }));

    let embedding;
    const embeddingStep = await runStep('get embedding by id', async () => {
        const response = await collection.get({
            ids    : [id],
            include: ['embeddings']
        });

        embedding = response.embeddings?.[0];

        return {
            ids: response.ids.length,
            dim: embedding?.length || null
        }
    });

    result.steps.push(embeddingStep);

    result.steps.push(exportabilityStep);

    if (embedding?.length) {
        result.steps.push(await runStep('query by existing embedding', async () => {
            const response = await collection.query({
                queryEmbeddings: [embedding],
                nResults       : 1,
                include        : ['distances']
            });

            return {
                ids     : response.ids?.[0]?.length || 0,
                distance: response.distances?.[0]?.[0] ?? null
            }
        }));
    }

    return result
}

/**
 * @param {Object} options
 * @param {Object} [options.memoryCoreConfig=mcConfig]
 * @param {Object} [options.knowledgeBaseConfig=kbConfig]
 * @param {Function} [options.Client=ChromaClient]
 * @param {Number} [options.exportabilitySampleSize=DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE]
 * @returns {Promise<Object[]>}
 */
export async function probeChromaApi({
    memoryCoreConfig    = mcConfig,
    knowledgeBaseConfig = kbConfig,
    Client                  = ChromaClient,
    exportabilitySampleSize = DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE
} = {}) {
    const chroma = memoryCoreConfig.engines.chroma,
          client = new Client({
              host    : chroma.host,
              port    : Number(chroma.port),
              ssl     : false,
              database: chroma.database
          }),
          embeddingFunction = createDynamicTextEmbeddingFunction({
              providerResolver: () => memoryCoreConfig.embeddingProvider
          }),
          names = resolveCollectionNames({knowledgeBaseConfig, memoryCoreConfig});

    await client.heartbeat();

    const results = [];
    for (const name of names) {
        const result = {
            name,
            steps: []
        };

        const getCollection = await runStep('getCollection', async () => {
            return await client.getCollection({name, embeddingFunction})
        });

        if (!getCollection.ok) {
            result.steps.push(getCollection);
            results.push(result);
            continue
        }

        result.steps.push({
            label: 'getCollection',
            ok   : true,
            value: name
        });
        const collectionResult = await probeCollection({
            collection: getCollection.value,
            name,
            exportabilitySampleSize
        });

        result.steps.push(...collectionResult.steps);
        results.push(result);
    }

    return results
}

/**
 * @param {Object} value
 * @returns {String}
 */
function formatStepValue(value) {
    if (!value || typeof value !== 'object' || !('sampled' in value)) {
        return ''
    }

    const failurePreview = (value.failures || []).slice(0, 3).map(failure => {
        return `${failure.id}: ${failure.error}`
    }).join('; ');

    const failures = failurePreview ? `; failures=${failurePreview}` : '';

    return ` (sampled=${value.sampled}, succeeded=${value.succeeded}, failed=${value.failed}${failures})`
}

/**
 * @param {Object} result
 * @returns {void}
 */
function printHuman(result) {
    console.log(`SQLite source: ${result.sqlite.sourcePath}`);
    console.log(`SQLite snapshot: ${result.sqlite.snapshotPath}`);
    for (const check of result.sqlite.checks) {
        const status = check.ok ? 'ok' : 'failed';
        console.log(`- ${check.pragma}: ${status}${check.output ? ` (${check.output})` : ''}${check.error ? ` (${check.error})` : ''}`);
    }

    if (!result.api) {
        return
    }

    console.log('Chroma API read probes:');
    for (const collection of result.api.collections) {
        console.log(`- ${collection.name}`);
        for (const step of collection.steps) {
            const details = step.error ? ` (${step.error})` : formatStepValue(step.value);
            console.log(`  - ${step.label}: ${step.ok ? 'ok' : 'failed'}${details}`);
        }
    }
}

/**
 * @param {String[]} argv
 * @returns {Promise<Object>}
 */
export async function run(argv = process.argv) {
    program
        .name('checkChromaIntegrity')
        .description('Copy-first Chroma SQLite integrity check plus read-only API probes.')
        .option('--sqlite <path>', 'Path to chroma.sqlite3. Defaults to configured unified store.')
        .option('--skip-api', 'Skip live read-only Chroma API probes.', false)
        .option(
            '--exportability-sample-size <count>',
            'Number of ids to sample for stored-embedding exportability probes.',
            String(DEFAULT_STORED_EMBEDDING_EXPORTABILITY_SAMPLE_SIZE)
        )
        .option('--keep-snapshot', 'Keep the copied SQLite snapshot instead of removing the temp dir.', false)
        .option('--json', 'Print machine-readable JSON.', false)
        .parse(argv);

    const options    = program.opts(),
          sourcePath = resolveSqlitePath({sqlitePath: options.sqlite}),
          snapshot   = await copySqliteSnapshot({sourcePath});

    const result = {
        sqlite: {
            sourcePath,
            snapshotPath: snapshot.snapshotPath,
            checks      : []
        },
        api: null
    };

    for (const pragma of ['quick_check', 'integrity_check']) {
        result.sqlite.checks.push({
            pragma,
            ...await runSqlitePragma({snapshotPath: snapshot.snapshotPath, pragma})
        });
    }

    if (!options.skipApi) {
        try {
            const collections = await probeChromaApi({
                exportabilitySampleSize: normalizeExportabilitySampleSize(options.exportabilitySampleSize)
            });
            result.api = {
                collections,
                failedSteps: countFailedApiSteps(collections)
            };
        } catch (error) {
            result.api = {
                error: error.message
            };
        }
    }

    if (!options.keepSnapshot) {
        await fs.remove(snapshot.tmpDir);
    }

    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        printHuman(result);
    }

    const sqliteFailed = result.sqlite.checks.some(check => !check.ok),
          apiFailed    = Boolean(result.api?.error || result.api?.failedSteps);

    return {
        result,
        exitCode: sqliteFailed || apiFailed ? 1 : 0
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    run().then(({exitCode}) => {
        process.exit(exitCode);
    }).catch(error => {
        console.error(error.stack || error.message);
        process.exit(1);
    });
}
