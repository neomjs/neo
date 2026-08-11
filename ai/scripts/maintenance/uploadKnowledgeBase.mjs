/**
 * @plane host
 */
import {execFile}      from 'child_process';
import fs              from 'fs-extra';
import os              from 'os';
import path            from 'path';
import readline        from 'readline';
import {promisify}     from 'util';
import {fileURLToPath} from 'url';

// Neo namespace bootstrap (entry-point invariant). `Neo` + `core/_export` populate
// `globalThis.Neo` so that `ai/services.mjs` → Compare.mjs `Neo.gatekeep` resolves.
import Neo       from '../../../src/Neo.mjs';
import * as core from '../../../src/core/_export.mjs';

import AiConfig from '../../config.mjs';
import kbConfig from '../../mcp/server/knowledge-base/config.mjs';

import {
    KB_DatabaseService,
    KB_LifecycleService
} from '../../services.mjs';

import {
    ARTIFACT_BASENAME,
    KB_BACKUP_FILE_PREFIX,
    ARTIFACT_META_FILENAME,
    ARTIFACT_SCHEMA_VERSION,
    ARTIFACT_VECTORS_FILENAME,
    MEMORY_CORE_COLLECTION_PREFIXES,
    assertCollectionScopedArtifact,
    packArtifactToV2
} from './knowledgeBaseArtifact.mjs';

const execFileAsync = promisify(execFile);

/**
 * @module ai/scripts/maintenance/uploadKnowledgeBase
 * @summary Packages the Knowledge Base ChromaDB collection into a collection-scoped release
 * artifact and uploads it to the matching GitHub Release.
 *
 * ## Why collection-scoped
 *
 * The release artifact carries ONLY the public `neo-knowledge-base` ChromaDB collection,
 * exported as portable JSONL via the canonical `ai/services.mjs` SDK boundary
 * (`KB_DatabaseService.manageDatabaseBackup({action: 'export'})` — the same path
 * `ai/scripts/maintenance/backup.mjs` uses). It never bundles the `.neo-ai-data` data
 * directory, which holds private Memory Core memories, the graph SQLite, and the A2A
 * mailbox. A defense-in-depth assertion (`assertCollectionScopedArtifact`) fails the upload
 * if any Memory Core collection or a `sqlite/` payload leaks into the staged artifact.
 *
 * ## Artifact shape (schema v2)
 *
 * The artifact is a zip of a staging directory containing exactly three entries:
 * - `knowledge-base-backup-<ISO-timestamp>.jsonl` — the collection export, **without** `embedding`.
 * - `kb-vectors-fp16.bin` — the embeddings as a packed row-major `fp16` buffer, paired to the JSONL
 *   rows by index. ~97% of a v1 artifact was embeddings serialized as decimal TEXT; the vectors
 *   still ship in full, so the raw-vectors / no-re-embed guarantee is unchanged.
 * - `kb-artifact-meta.json` — `embeddingProvider` + `dimension` provenance so a download-side
 *   recall mismatch (model/dimension drift against the shipped raw vectors) is detectable, plus the
 *   `recordCount` + order digest the consumer needs to decode the sidecar safely.
 *
 * ## Pipeline position
 *
 * Invoked by `buildScripts/release/publish.mjs` after the GitHub Release is created. The
 * canonical artifact basename is shared with `downloadKnowledgeBase.mjs` and the publish
 * pipeline via `knowledgeBaseArtifact.mjs`.
 *
 * @see ai/scripts/maintenance/downloadKnowledgeBase.mjs
 * @see ai/scripts/maintenance/backup.mjs
 * @see ai/services/knowledge-base/DatabaseService.mjs
 */

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/**
 * Reads `package.json` for the release tag. Best-effort `npm_package_version` first so the
 * value matches the invoking npm context, then a direct read of the repo `package.json`.
 *
 * @returns {Promise<String>} The semver version string.
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
 * Counts non-empty JSONL lines in a file (one record per line). Used both for the metadata
 * `recordCount` stamp and as a guard against shipping an empty artifact.
 *
 * @param {String} filePath Absolute path to a `.jsonl` file.
 * @returns {Promise<Number>}
 */
async function countJsonlRecords(filePath) {
    const rl = readline.createInterface({
        input    : fs.createReadStream(filePath),
        crlfDelay: Infinity
    });
    let count = 0;
    for await (const line of rl) {
        if (line.trim()) {
            count++;
        }
    }
    return count;
}

/**
 * Executes the collection-scoped Knowledge Base upload workflow.
 *
 * @param {Object}  [options]
 * @param {String}  [options.tagName]            Override the resolved release tag (tests).
 * @param {Object}  [options.databaseService]    KB database SDK seam (tests).
 * @param {Object}  [options.lifecycleService]   KB lifecycle SDK seam (tests).
 * @param {Object}  [options.embeddingConfig]    Tier-1 AI config seam exposing `embeddingProvider` + `vectorDimension`.
 * @param {Object}  [options.knowledgeBaseConfig] KB server config seam exposing `collectionName`.
 * @param {Function}[options.runGh]              Async `(args[]) => Promise` seam for `gh` invocations (tests).
 * @param {Boolean} [options.skipReleaseCheck]   Skip the `gh release view` pre-flight (tests).
 * @param {Boolean} [options.skipUpload]         Stage + assert + meta only; do not invoke `gh release upload` (tests).
 * @param {String}  [options.stageRoot]          Override the staging-dir parent (tests). Defaults to OS tempdir.
 * @param {Object}  [options.logger=console]     Log sink.
 * @returns {Promise<{tagName: String, artifactName: String, recordCount: Number, embeddingProvider: String, dimension: Number, artifactPath: String}>}
 */
export async function uploadKnowledgeBase({
    tagName,
    databaseService     = KB_DatabaseService,
    lifecycleService    = KB_LifecycleService,
    embeddingConfig     = AiConfig,
    knowledgeBaseConfig = kbConfig,
    runGh               = (args) => execFileAsync('gh', args),
    skipReleaseCheck    = false,
    skipUpload          = false,
    stageRoot           = os.tmpdir(),
    logger              = console
} = {}) {
    const resolvedTag       = tagName ?? await resolveVersion();
    const collectionName    = knowledgeBaseConfig.collectionName;
    const embeddingProvider = embeddingConfig.embeddingProvider;
    const dimension         = embeddingConfig.vectorDimension;
    const artifactName      = ARTIFACT_BASENAME;

    const stageDir     = path.join(stageRoot, `neo-kb-artifact-${process.pid}-${Date.now()}`);
    const artifactDir  = path.dirname(path.resolve(PROJECT_ROOT, artifactName));
    const artifactPath = path.resolve(PROJECT_ROOT, artifactName);

    await fs.ensureDir(stageDir);

    try {
        // 1. Verify the release tag exists before doing local work (fail fast).
        if (!skipReleaseCheck) {
            logger.log(`🔍 Checking for GitHub Release ${resolvedTag}...`);
            try {
                await runGh(['release', 'view', resolvedTag]);
            } catch {
                throw new Error(`Release ${resolvedTag} not found on GitHub. Push the tag or create the draft release first.`);
            }
        }

        // 2. Export ONLY the neo-knowledge-base collection to JSONL via the canonical SDK.
        await lifecycleService.ready();
        logger.log(`📤 Exporting collection '${collectionName}' to JSONL...`);
        await databaseService.manageDatabaseBackup({action: 'export', backupPath: stageDir});

        const stagedJsonl = (await fs.readdir(stageDir))
            .filter(name => name.startsWith(KB_BACKUP_FILE_PREFIX) && name.endsWith('.jsonl'));

        if (stagedJsonl.length !== 1) {
            throw new Error(
                `Expected exactly one '${KB_BACKUP_FILE_PREFIX}*.jsonl' export in the staging dir, found ${stagedJsonl.length}. ` +
                `Refusing to build an ambiguous artifact.`
            );
        }

        const jsonlPath   = path.join(stageDir, stagedJsonl[0]);
        const recordCount = await countJsonlRecords(jsonlPath);

        if (recordCount === 0) {
            throw new Error(`Knowledge Base collection '${collectionName}' exported 0 records. Run 'npm run ai:sync-kb' before releasing.`);
        }

        // 3. Move embeddings out of the JSONL into the packed fp16 sidecar (schema v2). ~97% of a v1
        // artifact was embeddings as decimal TEXT; the vectors still ship in full, so the
        // raw-vectors / no-re-embed guarantee is unchanged. fp16 over fp32 was decided on a
        // corpus-wide recall measurement, not on arithmetic — see the originating ticket.
        logger.log('🗜️  Packing embeddings into the fp16 sidecar (schema v2)...');
        const packed = await packArtifactToV2({artifactDir: stageDir, jsonlPath, dimension});
        logger.log(`✅ Packed ${packed.recordCount} × ${packed.dimension} vectors into ${(packed.vectorBytes / 1048576).toFixed(1)} MB.`);

        // 4. Stamp embedding provenance so a download-side model/dimension drift is detectable.
        // `vectorDigest` binds the JSONL's record ORDER: v2 re-attaches vectors positionally, so a
        // reordered JSONL would pair every row with the wrong embedding at exactly the right size.
        const meta = {
            artifactVersion: ARTIFACT_SCHEMA_VERSION,
            collection     : collectionName,
            embeddingProvider,
            dimension,
            recordCount,
            vectorEncoding : 'fp16',
            vectorDigest   : packed.vectorDigest,
            // Stamped, not assumed: `Float16Array` writes in the agent's native order and Node ships a
            // big-endian build, so the consumer must be told what order it is reading.
            byteOrder : packed.byteOrder,
            neoVersion: resolvedTag,
            createdAt : new Date().toISOString()
        };
        await fs.writeJson(path.join(stageDir, ARTIFACT_META_FILENAME), meta, {spaces: 2});

        // 5. Defense-in-depth: prove the staged artifact is collection-scoped (no MC, no sqlite/).
        await assertCollectionScopedArtifact({artifactDir: stageDir});
        logger.log(`✅ Artifact is collection-scoped: ${recordCount} '${collectionName}' chunks, no Memory Core collections, no sqlite/.`);

        // 6. Zip the staging dir CONTENTS (flat) into the canonical artifact, then upload.
        await fs.ensureDir(artifactDir);
        await fs.remove(artifactPath);
        logger.log(`📦 Packaging ${artifactName}...`);
        // `-j` flattens — the zip holds the JSONL + meta at its root, never a `.neo-ai-data` tree.
        await execFileAsync('zip', ['-j', '-q', artifactPath, jsonlPath, path.join(stageDir, ARTIFACT_META_FILENAME), path.join(stageDir, ARTIFACT_VECTORS_FILENAME)]);

        const stats = await fs.stat(artifactPath);
        logger.log(`✅ Packaged: ${artifactName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

        if (!skipUpload) {
            logger.log(`⬆️  Uploading to GitHub Release ${resolvedTag}...`);
            await runGh(['release', 'upload', resolvedTag, artifactPath, '--clobber']);
            logger.log(`✅ Upload complete: https://github.com/neomjs/neo/releases/download/${resolvedTag}/${artifactName}`);
        }

        return {tagName: resolvedTag, artifactName, recordCount, embeddingProvider, dimension, artifactPath};
    } finally {
        await fs.remove(stageDir);
        if (!skipUpload && await fs.pathExists(artifactPath)) {
            await fs.remove(artifactPath);
            logger.log(`🧹 Cleaned up ${artifactName}`);
        }
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    uploadKnowledgeBase()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('❌ Knowledge Base upload failed:', error.message);
            process.exit(1);
        });
}
