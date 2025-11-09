import jsdocApi from 'jsdoc-api';
import os       from 'os';
import fs       from 'fs/promises';
import path     from 'path';

/**
 * Builds the configuration object for JSDoc.
 * @param {object} options - The options object.
 * @returns {object}
 */
function buildConf(options) {
    const config = options.config || {};

    return {
        tags: {
            allowUnknownTags: options.allowUnknownTags !== false,
            dictionaries: Array.isArray(options.dictionaries) ? options.dictionaries : ['jsdoc', 'closure']
        },
        source: {
            includePattern: options.includePattern || '.+\\.js(doc|x)?$',
            excludePattern: options.excludePattern || '(^|\\/|\\\\)_'
        },
        templates: {
            cleverLinks: false,
            monospaceLinks: false
        },
        plugins: Array.isArray(options.plugins) ? options.plugins : [],
        ...config
    };
}

/**
 * Creates a temporary config file
 * @param {object} conf - Configuration object
 * @returns {Promise<{path: string, cleanup: Function}>}
 */
async function createTempConfig(conf) {
    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `jsdocx-conf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
    await fs.writeFile(tempPath, JSON.stringify(conf), 'utf8');

    return {
        path: tempPath,
        cleanup: async () => {
            try {
                await fs.unlink(tempPath);
            } catch (e) {
                // Ignore cleanup errors
            }
        }
    };
}

/**
 * Builds the options for jsdoc-api
 * @param {object} options - The options object.
 * @param {string[]} files - Files to process
 * @param {string} configPath - Path to config file
 * @returns {object}
 */
function buildJSDocApiOptions(options, files, configPath) {
    return {
        files: files || options.files,
        configure: configPath, // Must be a path, not an object
        encoding: options.encoding || 'utf8',
        package: options.package,
        recurse: options.recurse,
        pedantic: options.pedantic
    };
}

/**
 * Splits an array into chunks
 * @param {Array} array - Array to split
 * @param {number} size - Chunk size
 * @returns {Array[]} - Array of chunks
 */
function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

/**
 * Runs JSDoc using jsdoc-api with parallel processing
 * @param {object} options - The options for JSDoc.
 * @param {number} workerCount - Number of parallel workers
 * @returns {Promise<any[]>} - Combined results from all workers
 */
async function runParallel(options, workerCount) {
    const files = options.files;
    const filesPerWorker = Math.ceil(files.length / workerCount);
    const chunks = chunkArray(files, filesPerWorker);

    console.log(`Processing ${files.length} files in ${chunks.length} parallel batches (~${filesPerWorker} files each)`);

    // Create a single config file to share across all workers
    const conf = buildConf(options);
    const configFile = await createTempConfig(conf);

    try {
        const workerPromises = chunks.map(async (fileChunk, index) => {
            const apiOptions = buildJSDocApiOptions(options, fileChunk, configFile.path);

            try {
                const result = await jsdocApi.explain(apiOptions);
                return result;
            } catch (e) {
                console.error(`Batch ${index + 1} failed:`, e.message);
                throw e;
            }
        });

        const results = await Promise.all(workerPromises);

        // Cleanup config file
        await configFile.cleanup();

        // Merge all results - jsdoc-api returns arrays
        return results.flat();
    } catch (e) {
        await configFile.cleanup();
        throw e;
    }
}

/**
 * Gets the optimal worker count based on physical cores
 * @returns {number}
 */
function getOptimalWorkerCount() {
    const cpus = os.cpus();
    const cpuCount = cpus.length;

    // On macOS/systems with hyperthreading, logical cores = 2x physical cores
    // We want to use physical cores for CPU-bound tasks
    // Heuristic: If all CPUs have same model, likely hyperthreading
    const uniqueModels = new Set(cpus.map(cpu => cpu.model));
    const likelyHyperthreading = uniqueModels.size === 1 && cpuCount > 4;

    const physicalCores = likelyHyperthreading ? Math.floor(cpuCount / 2) : cpuCount;

    // Use 75% of physical cores, minimum 2
    return Math.max(2, Math.floor(physicalCores * 0.75));
}

/**
 * Runs JSDoc and returns the parsed JSON output.
 * @param {object} options - The options for JSDoc.
 * @returns {Promise<any>}
 */
export async function run(options) {
    const fileCount = options.files?.length || 0;

    // Use parallel processing for larger file sets
    const PARALLEL_THRESHOLD = 100;
    const cpuCount = os.cpus().length;

    // Use optimal worker count based on physical cores
    // Can be overridden via options.workerCount
    const defaultWorkerCount = getOptimalWorkerCount();
    const workerCount = options.workerCount || defaultWorkerCount;

    if (fileCount >= PARALLEL_THRESHOLD) {
        console.log(`Using jsdoc-api with ${workerCount} parallel workers for ${fileCount} files (${cpuCount} logical CPUs available)`);
        return runParallel(options, workerCount);
    }

    // Single batch for smaller file sets
    console.log(`Using jsdoc-api for ${fileCount} files`);

    const conf = buildConf(options);
    const configFile = await createTempConfig(conf);

    try {
        const apiOptions = buildJSDocApiOptions(options, options.files, configFile.path);
        const result = await jsdocApi.explain(apiOptions);
        await configFile.cleanup();
        return result;
    } catch (e) {
        await configFile.cleanup();
        console.error('JSDoc API failed:', e.message);
        throw new Error('JSDoc returned no output or encountered an error.');
    }
}
