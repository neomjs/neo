import {createHash}                   from 'node:crypto';
import {execFileSync}                 from 'node:child_process';
import fs                             from 'node:fs';
import path                           from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {
    digestProviderLaneValue,
    validateProviderLaneElectionReport
} from '../benchmark/provider-lane-election.mjs';
import {projectVectorGenerationHealth} from '../../services/shared/vector/generationElectionStore.mjs';

/**
 * @module ai/scripts/diagnostics/providerLaneCutoverManifest
 * @summary Aggregates the epic's validated receipts into ONE immutable cutover manifest — every
 * manifest field is COPIED from a validated source, never derived or defaulted here.
 *
 * The generator owns zero configuration knowledge. The elected report is the single input
 * authority for lane identities, envelopes, and deployment inputs (its embedded selected receipt
 * is revalidated by {@link validateProviderLaneElectionReport} including a full election
 * recomputation), git ancestry is the authority for revision containment, and the vector-plane
 * election record projection is the authority for the current/rollback generation pair. A cutover
 * copied from any OTHER mix of sources is exactly the partial-apply incident class this manifest
 * exists to refuse.
 *
 * Completeness is honest, not optimistic: receipt slots that have no evidence yet stay `null`,
 * the manifest reports `status: 'incomplete'` with the missing slot names, and the CLI exits
 * non-zero. Preflight before handoff is the generator itself — the output carries no timestamps,
 * so re-running against the same cut declaration must reproduce the manifest byte-for-byte; any
 * drift means a coordinate changed underneath the package.
 */

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

export const PROVIDER_LANE_CUTOVER_MANIFEST_SCHEMA_VERSION = 'provider-lane-cutover-manifest.v1';

/**
 * The six receipt classes one cutover binds. `composition` and `resourceElection` fill from the
 * validated elected report; the other four arrive as evidence files while the epic's proof lanes
 * land, and stay `null` (⇒ incomplete) until they exist.
 */
export const PROVIDER_LANE_CUTOVER_RECEIPT_SLOTS = Object.freeze([
    'composition', 'resourceElection', 'containment', 'rebuild', 'promotion', 'rollback'
]);

const EVIDENCE_SLOT_NAMES = Object.freeze(['containment', 'rebuild', 'promotion', 'rollback']);
const REVISION_PATTERN    = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN      = /^sha256:[0-9a-f]{64}$/;

/**
 * @summary Builds the cutover manifest from one cut declaration, refusing partial coordinates.
 *
 * The seams default to the real authorities; fixtures inject fakes to exercise the generator's
 * own refusal and copy semantics without rebuilding full election evidence.
 *
 * @param {Object} options
 * @param {Object} options.cut Cut declaration: `{revision, requiredPullRequests, electionReportPath,
 * vectorGenerationDir, receiptSlots}` — exact keys, no defaults.
 * @param {Function} [options.gitIsAncestor] `(ancestor, descendant) => Boolean` seam.
 * @param {Function} [options.readFileBytes] `path => Buffer` seam for receipt files.
 * @param {Function} [options.projectHealth] Vector-generation health projection seam.
 * @param {Function} [options.validateElectionReport] Elected-report validator seam.
 * @returns {Promise<Object>} The manifest; `status: 'incomplete'` when evidence slots are empty.
 * @throws {Error} On any invalid, mismatched, or non-contained coordinate.
 */
export async function buildProviderLaneCutoverManifest({
    cut,
    gitIsAncestor          = defaultGitIsAncestor,
    readFileBytes          = defaultReadFileBytes,
    projectHealth          = projectVectorGenerationHealth,
    validateElectionReport = validateProviderLaneElectionReport
} = {}) {
    requireExactKeys(cut, [
        'electionReportPath', 'receiptSlots', 'requiredPullRequests', 'revision', 'vectorGenerationDir'
    ], 'cut declaration');

    const {revision} = cut;

    if (!REVISION_PATTERN.test(revision ?? '')) {
        throw new Error(`cut declaration revision must be a full 40-hex commit, got '${revision}'`)
    }

    if (!Array.isArray(cut.requiredPullRequests) || cut.requiredPullRequests.length === 0) {
        throw new Error('cut declaration requires at least one required pull request')
    }

    for (const entry of cut.requiredPullRequests) {
        requireExactKeys(entry, ['mergeCommit', 'number'], 'required pull request');

        if (!Number.isInteger(entry.number) || entry.number <= 0 || !REVISION_PATTERN.test(entry.mergeCommit ?? '')) {
            throw new Error(`required pull request entry is malformed: ${JSON.stringify(entry)}`)
        }

        if (!gitIsAncestor(entry.mergeCommit, revision)) {
            throw new Error(`revision ${revision} does not contain PR #${entry.number} (merge ${entry.mergeCommit}); refusing to package a partial epic`)
        }
    }

    const reportBytes = readFileBytes(cut.electionReportPath);
    const report      = validateElectionReport(JSON.parse(reportBytes.toString('utf8')));

    if (!gitIsAncestor(report.repositoryHead, revision)) {
        throw new Error(`election evidence was measured at ${report.repositoryHead}, which revision ${revision} does not contain; re-elect or re-pin before packaging`)
    }

    // The elected outcome and its embedded selected receipt must agree on the deployment inputs —
    // the real validator enforces this via full recomputation, but the manifest re-checks the one
    // equality it copies from, so an injected or future validator cannot silently hand us a mix.
    if (JSON.stringify(report.deploymentInputs) !== JSON.stringify(report.selectedReceipt?.deploymentInputs)) {
        throw new Error('election report deploymentInputs disagree with its selected receipt; refusing a mixed profile')
    }

    const missing = [];
    const health  = await projectHealth({dir: cut.vectorGenerationDir});

    let vectorGeneration;

    if (health.status === 'committed' && health.elected && health.parked) {
        vectorGeneration = {
            bound   : true,
            status  : health.status,
            epoch   : health.epoch,
            current : health.elected,
            rollback: health.parked
        }
    } else {
        // A cutover ships while rollback authority still EXISTS: elected current + parked prior,
        // i.e. committed-not-yet-accepted. Anything else cannot name both generations.
        missing.push('vector-generation-committed-pair');
        vectorGeneration = {bound: false, status: health.status}
    }

    requireExactKeys(cut.receiptSlots, EVIDENCE_SLOT_NAMES.filter(name => name in cut.receiptSlots), 'receipt slots');

    const receiptSlots = {
        composition: {
            sha256: report.selectedReceiptDigest,
            source: 'election-report:selectedReceipt'
        },
        resourceElection: {
            path  : cut.electionReportPath,
            sha256: sha256OfBytes(reportBytes)
        }
    };

    for (const name of EVIDENCE_SLOT_NAMES) {
        const slotPath = cut.receiptSlots[name];

        if (typeof slotPath === 'string' && slotPath.length > 0) {
            receiptSlots[name] = {path: slotPath, sha256: sha256OfBytes(readFileBytes(slotPath))}
        } else {
            missing.push(name);
            receiptSlots[name] = null
        }
    }

    return {
        schemaVersion         : PROVIDER_LANE_CUTOVER_MANIFEST_SCHEMA_VERSION,
        status                : missing.length === 0 ? 'complete' : 'incomplete',
        missing,
        neoRevision           : revision,
        requiredPullRequests  : cut.requiredPullRequests.map(({number, mergeCommit}) => ({number, mergeCommit})),
        electionRepositoryHead: report.repositoryHead,
        deploymentInputs      : report.deploymentInputs,
        lanes                 : report.selectedReceipt.lanes,
        envelope              : report.selectedReceipt.envelope,
        roles                 : report.selectedReceipt.roles,
        selectedReceiptDigest : report.selectedReceiptDigest,
        electionReportDigest  : digestProviderLaneValue(report),
        vectorGeneration,
        receiptSlots,
        cutDeclarationDigest  : digestProviderLaneValue(cut)
    }
}

/**
 * @summary Validates one cutover manifest without touching the filesystem.
 * @param {Object} manifest Candidate manifest.
 * @param {Object} [options]
 * @param {Boolean} [options.requireComplete=true] Refuse manifests with empty evidence slots.
 * @returns {Object} The validated manifest.
 * @throws {Error} On schema drift, status inconsistency, or (when required) incompleteness.
 */
export function validateProviderLaneCutoverManifest(manifest, {requireComplete = true} = {}) {
    requireExactKeys(manifest, [
        'cutDeclarationDigest', 'deploymentInputs', 'electionReportDigest', 'electionRepositoryHead',
        'envelope', 'lanes', 'missing', 'neoRevision', 'receiptSlots', 'requiredPullRequests',
        'roles', 'schemaVersion', 'selectedReceiptDigest', 'status', 'vectorGeneration'
    ], 'cutover manifest');

    if (manifest.schemaVersion !== PROVIDER_LANE_CUTOVER_MANIFEST_SCHEMA_VERSION ||
        !['complete', 'incomplete'].includes(manifest.status) ||
        !REVISION_PATTERN.test(manifest.neoRevision ?? '') ||
        !REVISION_PATTERN.test(manifest.electionRepositoryHead ?? '') ||
        !DIGEST_PATTERN.test(manifest.selectedReceiptDigest ?? '') ||
        !DIGEST_PATTERN.test(manifest.electionReportDigest ?? '') ||
        !DIGEST_PATTERN.test(manifest.cutDeclarationDigest ?? '')) {
        throw new Error('cutover manifest has no complete canonical identity')
    }

    if (!Array.isArray(manifest.missing) || (manifest.status === 'complete') !== (manifest.missing.length === 0)) {
        throw new Error('cutover manifest status disagrees with its missing-evidence list')
    }

    requireExactKeys(manifest.receiptSlots, [...PROVIDER_LANE_CUTOVER_RECEIPT_SLOTS].sort(), 'manifest receipt slots');

    for (const name of PROVIDER_LANE_CUTOVER_RECEIPT_SLOTS) {
        const slot = manifest.receiptSlots[name];

        if (slot === null) {
            if (!manifest.missing.includes(name)) {
                throw new Error(`cutover manifest slot '${name}' is empty but not declared missing`)
            }
            continue
        }

        if (!DIGEST_PATTERN.test(slot?.sha256 ?? '') || !(typeof slot.path === 'string' || typeof slot.source === 'string')) {
            throw new Error(`cutover manifest slot '${name}' carries no checksum-bound evidence reference`)
        }
    }

    if (manifest.vectorGeneration?.bound !== true && !manifest.missing.includes('vector-generation-committed-pair')) {
        throw new Error('cutover manifest has no bound generation pair and does not declare it missing')
    }

    if (requireComplete && manifest.status !== 'complete') {
        throw new Error(`cutover manifest is incomplete (missing: ${manifest.missing.join(', ')}); handoff refused`)
    }

    return manifest
}

function defaultGitIsAncestor(ancestor, descendant) {
    try {
        execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {cwd: PROJECT_ROOT, stdio: 'ignore'});
        return true
    } catch {
        return false
    }
}

function defaultReadFileBytes(filePath) {
    return fs.readFileSync(path.resolve(PROJECT_ROOT, filePath))
}

function sha256OfBytes(bytes) {
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function requireExactKeys(value, keys, label) {
    const actual = Object.keys(value ?? {}).sort();

    if (JSON.stringify(actual) !== JSON.stringify([...keys].sort())) {
        throw new Error(`${label} must carry exactly [${[...keys].sort().join(', ')}], got [${actual.join(', ')}]`)
    }
}

/**
 * @summary Parses CLI arguments for the manifest generator.
 * @param {String[]} argv Arguments without node/script.
 * @returns {Object} `{cutPath, outPath}`.
 */
export function parseArgs(argv) {
    let cutPath = null,
        outPath = null;

    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];

        if (argument === '--cut') {
            cutPath = argv[++index];
            if (!cutPath) throw new Error('--cut requires a file path');
        } else if (argument === '--out') {
            outPath = argv[++index];
            if (!outPath) throw new Error('--out requires a file path');
        } else {
            throw new Error(`Unknown argument '${argument}'`)
        }
    }

    if (!cutPath) throw new Error('--cut <declaration.json> is required');

    return {cutPath, outPath}
}

/**
 * @summary Reads one cut declaration and emits exactly one manifest JSON.
 * @param {String[]} [argv] Arguments without node/script.
 * @returns {Promise<Object>} Emitted manifest.
 */
export async function main(argv = process.argv.slice(2)) {
    const {cutPath, outPath} = parseArgs(argv);
    const cut                = JSON.parse(fs.readFileSync(path.resolve(PROJECT_ROOT, cutPath), 'utf8'));
    const manifest           = await buildProviderLaneCutoverManifest({cut});
    const serialized         = `${JSON.stringify(manifest, null, 2)}\n`;

    if (outPath) {
        fs.writeFileSync(path.resolve(PROJECT_ROOT, outPath), serialized)
    } else {
        process.stdout.write(serialized)
    }

    if (manifest.status !== 'complete') process.exitCode = 1;
    return manifest
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        await main()
    } catch (error) {
        process.stderr.write(`providerLaneCutoverManifest: ${error.message}\n`);
        process.exitCode = 2;
    }
}
