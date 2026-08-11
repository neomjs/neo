/**
 * @plane host
 */
import {execFile}      from 'child_process';
import fs              from 'fs-extra';
import os              from 'os';
import path            from 'path';
import {promisify}     from 'util';
import {fileURLToPath} from 'url';

// Neo namespace bootstrap (entry-point invariant). `Neo` + `core/_export` populate
// `globalThis.Neo` so that `ai/services.mjs` → Compare.mjs `Neo.gatekeep` resolves.
import Neo       from '../../../src/Neo.mjs';
import * as core from '../../../src/core/_export.mjs';

import AiConfig from '../../config.mjs';
import kbConfig from '../../mcp/server/knowledge-base/config.mjs';

import {
    KB_ChromaManager,
    KB_DatabaseService,
    KB_LifecycleService
} from '../../services.mjs';

import {
    ARTIFACT_BASENAME,
    ARTIFACT_META_FILENAME,
    assertCollectionScopedArtifact,
    rehydrateArtifactFromV2
} from './knowledgeBaseArtifact.mjs';

const execFileAsync = promisify(execFile);

/**
 * @module ai/scripts/maintenance/downloadKnowledgeBase
 * @summary Fetches the collection-scoped Knowledge Base release artifact and ingests it into the
 * consumer's `neo-knowledge-base` ChromaDB collection — **merge-only**, never clobbering the
 * user's `.neo-ai-data` or any Memory Core collection.
 *
 * Runs on every `npm install` via the `prepare` script, so the contract is strictly additive:
 *
 * - **Skip-if-populated:** if the consumer's KB collection already holds records, the download is
 *   skipped entirely (`npm run ai:sync-kb` is the incremental-update path).
 * - **Collection-scoped import:** the artifact is unzipped to a temp dir and ingested via the
 *   canonical SDK (`KB_DatabaseService.manageDatabaseBackup({action: 'import', mode: 'merge'})`).
 *   The data directory is never directory-restored; Memory Core collections are never touched.
 * - **Defense-in-depth:** `assertCollectionScopedArtifact` runs on the unzipped contents before
 *   import, so a malformed artifact carrying Memory Core data or a `sqlite/` payload is rejected.
 * - **Schema v1 + v2:** a v2 artifact carries its embeddings in a packed `fp16` sidecar rather than
 *   as decimal text inside the JSONL; `rehydrateArtifactFromV2` re-attaches them before the import,
 *   so the SDK boundary keeps consuming one JSONL shape. A v1 artifact has no sidecar and the step
 *   is a no-op — older release assets stay importable. Vectors are re-attached **by index**, which
 *   is only safe while the record order is proven, so the metadata's order digest is verified first
 *   and a mismatch aborts instead of ingesting misaligned embeddings.
 * - **Embedding-provenance check:** the artifact's `embeddingProvider`/`dimension` metadata is
 *   compared to the consumer's config; a mismatch warns (recall would silently degrade against
 *   the shipped raw vectors) without aborting npm install.
 * - **Soft-fail:** every failure path returns rather than `process.exit(1)` so `npm install`
 *   never breaks for standard consumers.
 *
 * @see ai/scripts/maintenance/uploadKnowledgeBase.mjs
 * @see ai/services/knowledge-base/DatabaseService.mjs
 */

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/**
 * Resolves the release tag from `package.json`.
 * @returns {Promise<String>}
 */
async function resolveVersion() {
    const fromEnv = process.env.npm_package_version;
    if (fromEnv) {
        return fromEnv;
    }
    const pkg = await fs.readJson(path.join(PROJECT_ROOT, 'package.json'));
    return pkg.version;
}

/**
 * Returns the consumer's current Knowledge Base collection record count, or `null` when the
 * collection / Chroma daemon cannot be reached (treated as "not populated, attempt download").
 *
 * @param {Object} chromaManager KB ChromaManager SDK seam.
 * @returns {Promise<Number|null>}
 */
async function readKbCollectionCount(chromaManager) {
    try {
        const collection = await chromaManager.getKnowledgeBaseCollection();
        return await collection.count();
    } catch {
        return null;
    }
}

/**
 * Unzips the downloaded artifact into a directory using the platform-native tool.
 *
 * @param {String} zipPath    Absolute path to the downloaded zip.
 * @param {String} targetDir  Absolute path to extract into.
 * @returns {Promise<void>}
 */
async function unzipArtifact(zipPath, targetDir) {
    try {
        await execFileAsync('unzip', ['-o', '-q', zipPath, '-d', targetDir]);
    } catch (e) {
        if (process.platform === 'win32') {
            await execFileAsync('powershell', ['-command', `Expand-Archive -Force '${zipPath}' '${targetDir}'`]);
        } else {
            throw new Error('Failed to unzip the Knowledge Base artifact. Install "unzip" or extract it manually.');
        }
    }
}

/**
 * Executes the merge-only Knowledge Base download + ingest workflow.
 *
 * @param {Object}  [options]
 * @param {String}  [options.tagName]            Override the resolved release tag (tests).
 * @param {Object}  [options.chromaManager]      KB ChromaManager SDK seam (tests).
 * @param {Object}  [options.databaseService]    KB database SDK seam (tests).
 * @param {Object}  [options.lifecycleService]   KB lifecycle SDK seam (tests).
 * @param {Object}  [options.embeddingConfig]    Tier-1 AI config seam exposing `embeddingProvider` + `vectorDimension`.
 * @param {Function}[options.fetchImpl=fetch]    Fetch seam (tests).
 * @param {String}  [options.workRoot]           Override the download/extract parent dir (tests). Defaults to OS tempdir.
 * @param {Object}  [options.logger=console]     Log sink.
 * @returns {Promise<{status: String, imported: Number, reason: String}>} `imported` / `reason` present per status.
 */
export async function downloadKnowledgeBase({
    tagName,
    chromaManager    = KB_ChromaManager,
    databaseService  = KB_DatabaseService,
    lifecycleService = KB_LifecycleService,
    embeddingConfig  = AiConfig,
    fetchImpl        = fetch,
    workRoot         = os.tmpdir(),
    logger           = console
} = {}) {
    const resolvedTag  = tagName ?? await resolveVersion();
    const artifactName = ARTIFACT_BASENAME;
    const url          = `https://github.com/neomjs/neo/releases/download/${resolvedTag}/${artifactName}`;

    // Merge-only guard: never re-import over a populated consumer collection.
    logger.log('Checking for an existing Knowledge Base collection...');
    await lifecycleService.ready();
    const existingCount = await readKbCollectionCount(chromaManager);

    if (typeof existingCount === 'number' && existingCount > 0) {
        logger.log(`✅ Knowledge Base already populated (${existingCount} chunks). Skipping download. Run 'npm run ai:sync-kb' to update incrementally.`);
        return {status: 'skipped', reason: 'collection-populated'};
    }

    const downloadDir = path.join(workRoot, `neo-kb-download-${process.pid}-${Date.now()}`);
    const extractDir  = path.join(downloadDir, 'extract');
    const zipPath     = path.join(downloadDir, artifactName);

    await fs.ensureDir(extractDir);

    try {
        logger.log(`⬇️  Downloading Knowledge Base artifact for v${resolvedTag}...`);
        logger.log(`   URL: ${url}`);

        const response = await fetchImpl(url);
        if (!response.ok) {
            if (response.status === 404) {
                logger.warn(`⚠️  Artifact not found (404). This is expected for development versions or before the release asset is uploaded.`);
                logger.log(`   Build the Knowledge Base locally with 'npm run ai:sync-kb'.`);
                return {status: 'absent', reason: 'artifact-404'};
            }
            throw new Error(`Download failed: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        await fs.writeFile(zipPath, Buffer.from(arrayBuffer));
        logger.log(`✅ Downloaded ${artifactName} (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB).`);

        await unzipArtifact(zipPath, extractDir);

        // Defense-in-depth: reject a malformed artifact carrying Memory Core data or sqlite/.
        await assertCollectionScopedArtifact({artifactDir: extractDir});

        await warnOnEmbeddingMismatch({extractDir, embeddingConfig, logger});

        // Schema v2 ships embeddings as a packed fp16 sidecar instead of decimal text in the JSONL.
        // Re-attach them before the import so the SDK still consumes a v1-shaped JSONL — a v1
        // artifact carries no sidecar and this is a no-op, which is what keeps older release assets
        // importable. A digest/shape mismatch throws, so the catch below skips the import entirely
        // rather than ingesting vectors paired to the wrong records.
        const rehydration = await rehydrateArtifactFromV2({artifactDir: extractDir});

        if (rehydration.rehydrated) {
            logger.log(`🗜️  Re-attached ${rehydration.recordCount} packed fp16 embeddings (artifact schema v2).`);
        }

        // Collection-scoped, merge-only import. Never directory-restores .neo-ai-data;
        // never touches a Memory Core collection.
        logger.log('📥 Importing Knowledge Base collection (merge mode)...');
        const result = await databaseService.manageDatabaseBackup({
            action: 'import',
            file  : extractDir,
            mode  : 'merge'
        });

        logger.log(`✅ Knowledge Base ready (imported ${result.imported} chunks).`);
        return {status: 'imported', imported: result.imported};
    } catch (error) {
        // Soft-fail so npm install never breaks for standard consumers.
        logger.error(`❌ Knowledge Base download failed (non-fatal): ${error.message}`);
        return {status: 'error', reason: error.message};
    } finally {
        await fs.remove(downloadDir);
    }
}

/**
 * Compares the artifact's embedding provenance to the consumer's config and warns on a mismatch.
 * Raw vectors round-trip on import (no re-embedding), so a provider/dimension divergence would
 * silently degrade recall — a warning makes that visible without aborting npm install.
 *
 * @param {Object} options
 * @param {String} options.extractDir      Unzipped artifact directory.
 * @param {Object} options.embeddingConfig Tier-1 AI config exposing `embeddingProvider` + `vectorDimension`.
 * @param {Object} options.logger          Log sink.
 * @returns {Promise<void>}
 */
async function warnOnEmbeddingMismatch({extractDir, embeddingConfig, logger}) {
    const metaPath = path.join(extractDir, ARTIFACT_META_FILENAME);
    if (!await fs.pathExists(metaPath)) {
        logger.warn(`⚠️  Artifact has no ${ARTIFACT_META_FILENAME}; cannot verify embedding provider/dimension compatibility.`);
        return;
    }

    const meta           = await fs.readJson(metaPath);
    const localProvider  = embeddingConfig.embeddingProvider;
    const localDimension = embeddingConfig.vectorDimension;

    if (meta.embeddingProvider !== localProvider || meta.dimension !== localDimension) {
        logger.warn(
            `⚠️  Embedding mismatch: artifact was built with provider='${meta.embeddingProvider}' dimension=${meta.dimension}, ` +
            `your config uses provider='${localProvider}' dimension=${localDimension}. ` +
            `Imported vectors are used as-is (no re-embedding); recall against new queries may be degraded. ` +
            `Re-run 'npm run ai:sync-kb' to re-embed against your provider.`
        );
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    downloadKnowledgeBase()
        .then(() => process.exit(0))
        .catch(error => {
            // Reaching here is unexpected (the workflow soft-fails internally); still never break install.
            console.error(`❌ Knowledge Base download failed (non-fatal): ${error.message}`);
            process.exit(0);
        });
}
