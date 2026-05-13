import archivePath from '../services/github-workflow/shared/archivePath.mjs';
import crypto      from 'crypto';
import fs          from 'fs/promises';
import matter      from 'gray-matter';
import path        from 'path';
import {fileURLToPath} from 'url';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const defaultArchiveChunkPrefix    = 'chunk-';
const defaultArchiveChunkThreshold = 100;
const defaultArchiveRoot           = path.join(projectRoot, 'resources/content/archive');
const defaultLegacyRoot            = path.join(projectRoot, 'resources/content/pr-archive');
const defaultMetadataFile          = path.join(projectRoot, 'resources/content/.sync-metadata.json');
const defaultVersionDirectoryPrefix = 'v';

/**
 * @summary Normalizes archive release buckets to the configured version prefix.
 * @param {String} value Candidate release bucket.
 * @param {String} versionDirectoryPrefix Configured version directory prefix.
 * @returns {String|null}
 */
export function normalizeArchiveVersion(value, versionDirectoryPrefix = 'v') {
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    return trimmed.startsWith(versionDirectoryPrefix)
        ? trimmed
        : `${versionDirectoryPrefix}${trimmed}`
}

/**
 * @summary Builds a sorted release-cut index from sync metadata.
 * @param {Object} releases The `metadata.releases` object.
 * @param {String} versionDirectoryPrefix Configured version directory prefix.
 * @returns {Array<{version: string, publishedAt: Date}>}
 */
export function buildReleaseIndex(releases = {}, versionDirectoryPrefix = 'v') {
    return Object.entries(releases)
        .map(([version, release]) => ({
            version     : normalizeArchiveVersion(version, versionDirectoryPrefix),
            publishedAt: new Date(release?.publishedAt)
        }))
        .filter(release => release.version && !Number.isNaN(release.publishedAt.getTime()))
        .sort((a, b) => a.publishedAt - b.publishedAt)
}

/**
 * @summary Infers the target PR archive version using the AC8 deterministic order.
 * @param {Object} pr Pull request metadata/frontmatter.
 * @param {Array<{version: string, publishedAt: Date}>} releaseIndex Sorted release cuts.
 * @param {Object} options
 * @param {String} [options.fallbackVersion] Explicit operator-provided bucket for post-latest-release PRs.
 * @param {String} [options.versionDirectoryPrefix='v'] Configured version directory prefix.
 * @returns {{version: string, source: string}|{anomaly: string, detail: string}}
 */
export function inferPrArchiveVersion(pr, releaseIndex, options = {}) {
    const {
        fallbackVersion,
        versionDirectoryPrefix = 'v'
    } = options;

    const archiveVersion = normalizeArchiveVersion(pr.archiveVersion, versionDirectoryPrefix);
    if (archiveVersion) {
        return {version: archiveVersion, source: 'archiveVersion'}
    }

    const milestone = normalizeArchiveVersion(pr.milestone, versionDirectoryPrefix);
    if (milestone && releaseIndex.some(release => release.version === milestone)) {
        return {version: milestone, source: 'milestone'}
    }

    if (pr.state === 'CLOSED' && !pr.mergedAt) {
        return {
            anomaly: 'closed-unmerged-pr',
            detail : 'closed pull request has no mergedAt; release-version inference would be a guess'
        }
    }

    if (!pr.mergedAt) {
        return {
            anomaly: 'missing-mergedAt',
            detail : 'mergedAt is required when archiveVersion and milestone do not resolve'
        }
    }

    const mergedAt = new Date(pr.mergedAt);
    if (Number.isNaN(mergedAt.getTime())) {
        return {
            anomaly: 'invalid-mergedAt',
            detail : `mergedAt is not a valid date: ${pr.mergedAt}`
        }
    }

    const release = releaseIndex.find(candidate => candidate.publishedAt > mergedAt);
    if (release) {
        return {version: release.version, source: 'mergedAt'}
    }

    const explicitFallback = normalizeArchiveVersion(fallbackVersion, versionDirectoryPrefix);
    if (explicitFallback) {
        return {version: explicitFallback, source: 'fallbackVersion'}
    }

    return {
        anomaly: 'post-latest-release',
        detail : 'mergedAt is after the latest known release; pass --fallback-version to map intentionally'
    }
}

/**
 * @summary Plans or applies the Epic #11187 AC8 legacy PR archive migration.
 * @param {Object} options
 * @param {String} [options.legacyRoot] Legacy `resources/content/pr-archive` root.
 * @param {String} [options.archiveRoot] Target `resources/content/archive` root.
 * @param {Object} [options.metadata] Loaded sync metadata.
 * @param {String} [options.metadataFile] Sync metadata file path.
 * @param {Boolean} [options.dryRun=true] When false, move planned files.
 * @param {Boolean} [options.allowAnomalies=false] Allow apply to move mapped files while anomalies remain.
 * @param {String} [options.fallbackVersion] Explicit bucket for post-latest-release PRs.
 * @param {Number} [options.archiveChunkThreshold] Archive flat/chunk threshold.
 * @param {String} [options.archiveChunkPrefix] Archive chunk directory prefix.
 * @param {String} [options.versionDirectoryPrefix] Version directory prefix.
 * @param {Boolean} [options.updateMetadata=true] Update `.sync-metadata.json` during apply mode.
 * @returns {Promise<Object>}
 */
export async function migratePrArchive(options = {}) {
    const legacyRoot = path.resolve(options.legacyRoot ?? defaultLegacyRoot);
    const archiveRoot = path.resolve(options.archiveRoot ?? defaultArchiveRoot);
    const metadataFile = options.metadataFile ?? defaultMetadataFile;
    const metadata = options.metadata ?? await loadMetadata(metadataFile);
    const dryRun = options.dryRun !== false;
    const allowAnomalies = options.allowAnomalies === true;
    const shouldUpdateMetadata = !options.metadata && options.updateMetadata !== false;
    const archiveChunkThreshold = normalizePositiveInteger(
        options.archiveChunkThreshold ?? defaultArchiveChunkThreshold,
        'archiveChunkThreshold'
    );
    const archiveChunkPrefix = normalizeNonEmptyString(
        options.archiveChunkPrefix ?? defaultArchiveChunkPrefix,
        'archiveChunkPrefix'
    );
    const versionDirectoryPrefix = normalizeNonEmptyString(
        options.versionDirectoryPrefix ?? defaultVersionDirectoryPrefix,
        'versionDirectoryPrefix'
    );
    const releaseIndex = buildReleaseIndex(metadata.releases || {}, versionDirectoryPrefix);
    const files = await findMarkdownFiles(legacyRoot);

    const plans = [];
    const anomalies = [];

    for (const sourcePath of files) {
        const parsed = await readPullRequestFrontmatter(sourcePath);
        const inference = inferPrArchiveVersion(parsed, releaseIndex, {
            fallbackVersion: options.fallbackVersion,
            versionDirectoryPrefix
        });

        if (inference.anomaly) {
            anomalies.push({
                number: parsed.number,
                sourcePath,
                reason: inference.anomaly,
                detail: inference.detail
            });
            continue;
        }

        plans.push({
            number         : parsed.number,
            filename       : path.basename(sourcePath),
            metadata       : parsed,
            sourcePath,
            version        : inference.version,
            inferenceSource: inference.source
        });
    }

    assignTargetPaths(plans, {
        archiveRoot,
        archiveChunkThreshold,
        archiveChunkPrefix
    });

    if (!dryRun && anomalies.length > 0 && !allowAnomalies) {
        const error = new Error(`Refusing to apply PR archive migration with ${anomalies.length} anomalies. Re-run with --allow-anomalies to move only mapped files.`);
        error.anomalies = anomalies;
        throw error
    }

    let movedCount = 0;
    let archivedMetadataCount = 0;
    let metadataUpdatedCount = 0;
    let removedLegacyDirs = 0;

    if (!dryRun) {
        for (const plan of plans) {
            await movePlan(plan);
            movedCount++;
        }

        if (shouldUpdateMetadata) {
            const archivedPlans = await findArchivedPullPlans(archiveRoot);
            archivedMetadataCount = archivedPlans.length;
            metadataUpdatedCount = updatePullMetadata(metadata, archivedPlans);
            await writeMetadata(metadataFile, metadata);
        }

        removedLegacyDirs = await removeEmptyChildDirs(legacyRoot);
    }

    const targetCount = await countMarkdownFiles(path.join(archiveRoot, 'pulls'));
    const remainingLegacyCount = await countMarkdownFiles(legacyRoot);

    return {
        dryRun,
        legacyRoot,
        archiveRoot,
        fallbackVersion: normalizeArchiveVersion(options.fallbackVersion, versionDirectoryPrefix),
        releaseCount: releaseIndex.length,
        legacyCount: files.length,
        plannedCount: plans.length,
        movedCount,
        anomalyCount: anomalies.length,
        targetCount,
        projectedTargetCount: dryRun ? targetCount + plans.length : targetCount,
        remainingLegacyCount,
        archivedMetadataCount,
        metadataUpdatedCount,
        removedLegacyDirs,
        plans: plans.map(plan => ({
            number         : plan.number,
            from           : toProjectRelative(plan.sourcePath),
            to             : toProjectRelative(plan.targetPath),
            version        : plan.version,
            inferenceSource: plan.inferenceSource
        })),
        anomalies: anomalies.map(anomaly => ({
            number: anomaly.number,
            from  : toProjectRelative(anomaly.sourcePath),
            reason: anomaly.reason,
            detail: anomaly.detail
        }))
    }
}

export function parseArgs(argv) {
    const options = {
        dryRun: true,
        json  : false
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const readValue = name => {
            const prefix = `${name}=`;
            if (arg.startsWith(prefix)) return arg.slice(prefix.length);
            return argv[++i]
        };

        if (arg === '--apply') {
            options.dryRun = false;
        } else if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--json') {
            options.json = true;
        } else if (arg === '--allow-anomalies') {
            options.allowAnomalies = true;
        } else if (arg.startsWith('--legacy-root')) {
            options.legacyRoot = readValue('--legacy-root');
        } else if (arg.startsWith('--archive-root')) {
            options.archiveRoot = readValue('--archive-root');
        } else if (arg.startsWith('--metadata-file')) {
            options.metadataFile = readValue('--metadata-file');
        } else if (arg.startsWith('--fallback-version')) {
            options.fallbackVersion = readValue('--fallback-version');
        } else if (arg.startsWith('--archive-chunk-threshold')) {
            options.archiveChunkThreshold = Number(readValue('--archive-chunk-threshold'));
        } else if (arg.startsWith('--archive-chunk-prefix')) {
            options.archiveChunkPrefix = readValue('--archive-chunk-prefix');
        } else if (arg.startsWith('--version-directory-prefix')) {
            options.versionDirectoryPrefix = readValue('--version-directory-prefix');
        } else if (arg === '--help') {
            options.help = true;
        } else {
            throw new Error(`Unknown argument: ${arg}`)
        }
    }

    return options
}

async function loadMetadata(metadataFile) {
    const raw = await fs.readFile(metadataFile, 'utf-8');
    return JSON.parse(raw)
}

async function writeMetadata(metadataFile, metadata) {
    await fs.writeFile(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`, 'utf-8');
}

async function findMarkdownFiles(root) {
    const files = [];

    async function visit(dir) {
        let entries;

        try {
            entries = await fs.readdir(dir, {withFileTypes: true});
        } catch (e) {
            if (e.code === 'ENOENT') return;
            throw e
        }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await visit(fullPath);
            } else if (entry.isFile() && /^pr-\d+\.md$/.test(entry.name)) {
                files.push(fullPath);
            }
        }
    }

    await visit(root);
    return files.sort((a, b) => prNumberFromFilename(a) - prNumberFromFilename(b))
}

async function findArchivedPullPlans(archiveRoot) {
    const pullsRoot = path.join(archiveRoot, 'pulls');
    const files = await findMarkdownFiles(pullsRoot);
    const plans = [];

    for (const targetPath of files) {
        const parsed = await readPullRequestFrontmatter(targetPath);
        const relative = path.relative(pullsRoot, targetPath);
        const [version] = relative.split(path.sep);

        plans.push({
            number         : parsed.number,
            filename       : path.basename(targetPath),
            metadata       : parsed,
            sourcePath     : targetPath,
            targetPath,
            version,
            inferenceSource: 'existingArchive'
        });
    }

    return plans.sort((a, b) => a.number - b.number)
}

async function readPullRequestFrontmatter(sourcePath) {
    const raw = await fs.readFile(sourcePath, 'utf-8');
    const parsed = matter(raw);
    const number = Number(parsed.data.number ?? prNumberFromFilename(sourcePath));

    return {
        number,
        state         : parsed.data.state,
        closedAt      : parsed.data.closedAt,
        mergedAt      : parsed.data.mergedAt,
        milestone     : parsed.data.milestone,
        archiveVersion: parsed.data.archiveVersion,
        updatedAt     : parsed.data.updatedAt,
        contentHash   : crypto.createHash('sha256').update(raw).digest('hex')
    }
}

function assignTargetPaths(plans, options) {
    const byVersion = new Map();

    for (const plan of plans) {
        if (!byVersion.has(plan.version)) byVersion.set(plan.version, []);
        byVersion.get(plan.version).push(plan);
    }

    for (const [version, versionPlans] of byVersion.entries()) {
        versionPlans.sort((a, b) => a.number - b.number);

        versionPlans.forEach((plan, itemIndex) => {
            plan.targetPath = archivePath({
                archiveRoot          : options.archiveRoot,
                archiveChunkPrefix   : options.archiveChunkPrefix,
                archiveChunkThreshold: options.archiveChunkThreshold,
                type                 : 'pulls',
                version,
                filename             : plan.filename,
                itemCount            : versionPlans.length,
                itemIndex,
                maxItemsPerDir       : options.archiveChunkThreshold
            });
        });
    }
}

async function movePlan(plan) {
    await fs.mkdir(path.dirname(plan.targetPath), {recursive: true});

    try {
        await fs.access(plan.targetPath);
        throw new Error(`Target already exists: ${plan.targetPath}`)
    } catch (e) {
        if (e.code !== 'ENOENT') throw e;
    }

    await fs.rename(plan.sourcePath, plan.targetPath)
}

function updatePullMetadata(metadata, plans) {
    metadata.pulls ??= {};

    for (const plan of plans) {
        const pr = plan.metadata;

        metadata.pulls[plan.number] = {
            number        : pr.number,
            contentHash   : pr.contentHash,
            state         : pr.state,
            updatedAt     : pr.updatedAt,
            closedAt      : pr.closedAt ?? null,
            mergedAt      : pr.mergedAt ?? null,
            milestone     : pr.milestone ?? null,
            archiveVersion: plan.version,
            path          : toProjectRelative(plan.targetPath)
        };
    }

    return plans.length
}

async function countMarkdownFiles(root) {
    return (await findMarkdownFiles(root)).length
}

async function removeEmptyChildDirs(root) {
    let removed = 0;

    async function visit(dir) {
        let entries;

        try {
            entries = await fs.readdir(dir, {withFileTypes: true});
        } catch (e) {
            if (e.code === 'ENOENT') return;
            throw e
        }

        for (const entry of entries) {
            if (entry.isDirectory()) {
                await visit(path.join(dir, entry.name));
            }
        }

        if (dir === root) return;

        const remaining = await fs.readdir(dir);
        if (remaining.length === 0) {
            await fs.rmdir(dir);
            removed++;
        }
    }

    await visit(root);
    return removed
}

function prNumberFromFilename(filePath) {
    const match = path.basename(filePath).match(/^pr-(\d+)\.md$/);
    return match ? Number(match[1]) : Number.NaN
}

function normalizeNonEmptyString(value, name) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError(`${name} must be a non-empty string`)
    }

    return value
}

function normalizePositiveInteger(value, name) {
    if (!Number.isInteger(value) || value < 1) {
        throw new TypeError(`${name} must be a positive integer`)
    }

    return value
}

function toProjectRelative(filePath) {
    return path.relative(projectRoot, filePath)
}

function printHumanReport(report) {
    console.log(`PR archive migration ${report.dryRun ? 'dry-run' : 'apply'} complete`);
    console.log(`legacy=${report.legacyCount} planned=${report.plannedCount} moved=${report.movedCount} anomalies=${report.anomalyCount} target=${report.targetCount} projectedTarget=${report.projectedTargetCount}`);

    for (const plan of report.plans) {
        console.log(`[MOVE] #${plan.number} ${plan.inferenceSource} ${plan.version}: ${plan.from} -> ${plan.to}`);
    }

    for (const anomaly of report.anomalies) {
        console.log(`[ANOMALY] #${anomaly.number} ${anomaly.reason}: ${anomaly.from} (${anomaly.detail})`);
    }
}

function printUsage() {
    console.log(`Usage: node ai/scripts/migrate-pr-archive-ac8.mjs [--dry-run|--apply] [--json] [--fallback-version v13.0.0] [--allow-anomalies] [--archive-chunk-threshold 100] [--archive-chunk-prefix chunk-] [--version-directory-prefix v]`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
        printUsage();
    } else {
        migratePrArchive(options)
            .then(report => {
                if (options.json) {
                    console.log(JSON.stringify(report, null, 2));
                } else {
                    printHumanReport(report);
                }
            })
            .catch(error => {
                console.error(error.message);
                if (options.json && error.anomalies) {
                    console.error(JSON.stringify({anomalies: error.anomalies}, null, 2));
                }
                process.exitCode = 1;
            });
    }
}
