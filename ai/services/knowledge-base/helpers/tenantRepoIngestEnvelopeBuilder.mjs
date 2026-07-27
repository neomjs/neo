import {createHash} from 'node:crypto';
import fs           from 'fs-extra';

import GitMirror from './gitMirror.mjs';
import {
    deriveTenantRepoMirrorPath,
    normalizeRepoSlug,
    redactTenantRepoSecrets
} from './tenantRepoAccessContract.mjs';

/**
 * @summary Builds `KnowledgeBaseIngestionService.ingestSourceFiles()` envelopes from tenant Git mirrors.
 *
 * `TenantRepoIngestEnvelopeBuilder` is the adapter between the low-level
 * persistent mirror primitive and the tenant KB ingestion payload contract.
 * Linear history advances emit bounded raw-file deltas plus tombstones; bootstrap,
 * missing-baseline, and force-push cases fall back to a full manifest-carrying
 * snapshot so the ingestion service can reconcile the claimed live path set without
 * relying on a stale revision boundary.
 *
 * @see https://github.com/neomjs/neo/issues/11789
 * @see https://github.com/neomjs/neo/issues/16045
 * @see ai/services/knowledge-base/KnowledgeBaseIngestionService.mjs
 */

/**
 * @summary Creates a stable envelope-builder error.
 * @param {String} code Stable `KB_INGEST_ENVELOPE_*` error code.
 * @param {String} message Human-readable message.
 * @param {Object} details={}
 * @returns {Error}
 * @private
 */
function createIngestEnvelopeError(code, message, details = {}) {
    const error = new Error(redactTenantRepoSecrets(message, details));

    error.code = code;

    if (details.stdout) {
        error.stdout = redactTenantRepoSecrets(details.stdout, details);
    }

    if (details.stderr) {
        error.stderr = redactTenantRepoSecrets(details.stderr, details);
    }

    if (details.exitCode !== undefined) {
        error.exitCode = details.exitCode;
    }

    if (details.cause) {
        error.cause = details.cause;
    }

    return error;
}

/**
 * @summary Creates the bounded identity digest for one manifest-bearing pull materialization.
 *
 * The Git head binds source bytes while the manifest and parser bindings distinguish
 * the corpus/parser shape being materialized. The digest intentionally excludes
 * credential and filesystem data so it is safe to persist in the shared manifest graph.
 *
 * @param {Object} envelope Manifest-bearing tenant-repo ingestion envelope.
 * @returns {String} Lowercase SHA-256 digest.
 */
export function createTenantRepoMaterializationDigest({
    repoSlug,
    headRevision,
    manifestSnapshot,
    files = []
} = {}) {
    const
        normalizedRepoSlug = normalizeRepoSlug(manifestSnapshot?.repoSlug || repoSlug),
        normalizedHead     = typeof headRevision === 'string' ? headRevision.trim() : '';

    if (!normalizedHead) {
        throw createIngestEnvelopeError(
            'KB_INGEST_ENVELOPE_REF_NOT_FOUND',
            'Tenant repo materialization identity requires a head revision'
        );
    }

    if (!Array.isArray(manifestSnapshot?.pathsAfterPush)) {
        throw createIngestEnvelopeError(
            'KB_INGEST_ENVELOPE_MANIFEST_INVALID',
            'Tenant repo materialization identity requires manifestSnapshot.pathsAfterPush'
        );
    }

    const
        pathsAfterPush = [...new Set(manifestSnapshot.pathsAfterPush
            .filter(sourcePath => typeof sourcePath === 'string' && sourcePath.length > 0))]
            .sort(),
        parserBindings = (Array.isArray(files) ? files : [])
            .filter(file => typeof file?.sourcePath === 'string' && file.sourcePath.length > 0)
            .map(file => ({
                sourcePath   : file.sourcePath,
                rootKind     : typeof file.rootKind === 'string' ? file.rootKind : null,
                parserId     : typeof file.parserId === 'string' ? file.parserId : null,
                parserVersion: typeof file.parserVersion === 'string' ? file.parserVersion : null
            }))
            .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

    return createHash('sha256')
        .update(JSON.stringify({
            formatVersion: 1,
            repoSlug     : normalizedRepoSlug,
            headRevision : normalizedHead,
            pathsAfterPush,
            parserBindings
        }))
        .digest('hex');
}

/**
 * @summary Returns the mirror path while converting contract errors into builder errors.
 * @param {Object} options
 * @returns {String}
 * @private
 */
function getMirrorPath({mirrorRoot, tenantId, repoSlug} = {}) {
    try {
        return deriveTenantRepoMirrorPath({mirrorRoot, tenantId, repoSlug});
    } catch (error) {
        throw createIngestEnvelopeError(
            'KB_INGEST_ENVELOPE_MIRROR_PATH_INVALID',
            error.message,
            {cause: error}
        );
    }
}

/**
 * @summary Resolves and validates a commit ref inside the mirror.
 * @param {Object} options
 * @returns {Promise<String|null>}
 * @private
 */
async function resolveRevision({gitMirror, identity, ref, fallbackToFull = false}) {
    if (!ref) {
        return null;
    }

    try {
        return await gitMirror.resolveHead({...identity, ref});
    } catch (error) {
        if (fallbackToFull && error.code === 'KB_GITMIRROR_REF_NOT_FOUND') {
            return null;
        }

        const code = error.code === 'KB_GITMIRROR_REF_NOT_FOUND'
            ? 'KB_INGEST_ENVELOPE_REF_NOT_FOUND'
            : error.code === 'KB_GITMIRROR_MIRROR_PATH_INVALID'
                ? 'KB_INGEST_ENVELOPE_MIRROR_INVALID'
                : 'KB_INGEST_ENVELOPE_REF_RESOLVE_FAILED';

        throw createIngestEnvelopeError(
            code,
            error.message,
            {cause: error}
        );
    }
}

/**
 * @summary Lists all repo-relative paths present at a revision.
 * @param {Object} options
 * @param {Object} options.gitMirror GitMirror-compatible primitive.
 * @param {Object} options.identity Tenant-repo mirror identity.
 * @param {String} options.revision Resolved revision.
 * @returns {Promise<Array<String>>}
 * @private
 */
async function listRevisionPaths({gitMirror, identity, revision}) {
    try {
        return await gitMirror.listRevisionPaths({...identity, revision});
    } catch (error) {
        throw createIngestEnvelopeError(
            'KB_INGEST_ENVELOPE_LIST_FAILED',
            'Tenant repo ingest envelope failed to list revision paths',
            {
                cause   : error,
                exitCode: error.exitCode,
                stdout  : error.stdout,
                stderr  : error.stderr
            }
        );
    }
}

/**
 * @summary Reads one text file from a revision.
 * @param {Object} options
 * @param {Object} options.gitMirror GitMirror-compatible primitive.
 * @param {Object} options.identity Tenant-repo mirror identity.
 * @param {String} options.revision Resolved revision.
 * @param {String} options.sourcePath Repo-relative source path.
 * @returns {Promise<String>}
 * @private
 */
async function readRevisionFile({gitMirror, identity, revision, sourcePath}) {
    if (!sourcePath || sourcePath.includes('\0')) {
        throw createIngestEnvelopeError(
            'KB_INGEST_ENVELOPE_PATH_INVALID',
            'Tenant repo ingest envelope received an invalid sourcePath'
        );
    }

    try {
        return await gitMirror.readRevisionFile({...identity, revision, sourcePath});
    } catch (error) {
        throw createIngestEnvelopeError(
            'KB_INGEST_ENVELOPE_FILE_READ_FAILED',
            `Tenant repo ingest envelope failed to read '${sourcePath}'`,
            {
                cause   : error,
                exitCode: error.exitCode,
                stdout  : error.stdout,
                stderr  : error.stderr
            }
        );
    }
}

/**
 * @summary Builds raw-file payload records from source paths.
 * @param {Object} options
 * @returns {Promise<Array<Object>>}
 * @private
 */
async function buildFilePayloads({gitMirror, identity, revision, paths, rootKind, parserId, parserVersion}) {
    const files = [];

    for (const sourcePath of paths) {
        files.push({
            sourcePath,
            repoSlug: identity.repoSlug,
            rootKind,
            content : await readRevisionFile({gitMirror, identity, revision, sourcePath}),
            ...(parserId ? {parserId} : {}),
            ...(parserVersion ? {parserVersion} : {})
        });
    }

    return files;
}

/**
 * @summary Builds a manifest-carrying full ingest envelope for bootstrap and non-linear history.
 * @param {Object} options
 * @returns {Promise<Object>}
 * @private
 */
async function buildFullEnvelope({gitMirror, identity, headRevision, rootKind, parserId, parserVersion}) {
    const paths = await listRevisionPaths({gitMirror, identity, revision: headRevision});
    const files = await buildFilePayloads({
        gitMirror,
        identity,
        revision: headRevision,
        paths,
        rootKind,
        parserId,
        parserVersion
    });

    return {
        tenantId        : identity.tenantId,
        repoSlug        : identity.repoSlug,
        files,
        headRevision,
        manifestSnapshot: {
            repoSlug      : identity.repoSlug,
            pathsAfterPush: paths
        }
    };
}

/**
 * @summary Builds a KnowledgeBaseIngestionService raw-file ingest envelope from a tenant repo mirror.
 * @param {Object} options
 * @param {String} options.tenantId Tenant id.
 * @param {String} options.repoSlug Clean tenant repository identity.
 * @param {String} options.mirrorRoot Root directory for tenant repo mirrors.
 * @param {String} [options.lastIngestedRev] Previously ingested commit SHA/ref.
 * @param {String} [options.newHead='HEAD'] New commit SHA/ref to ingest.
 * @param {String} [options.rootKind='external-source'] Raw-file root kind for parser metadata.
 * @param {String} [options.parserId] Optional server parser id.
 * @param {String} [options.parserVersion] Optional parser version.
 * @param {Object} [options.gitMirror=GitMirror] Injectable GitMirror implementation for tests.
 * @returns {Promise<Object>}
 */
export async function buildIngestEnvelope({
    tenantId,
    repoSlug,
    mirrorRoot,
    lastIngestedRev,
    newHead = 'HEAD',
    rootKind = 'external-source',
    parserId,
    parserVersion,
    gitMirror = GitMirror
} = {}) {
    const identity = {
        tenantId,
        repoSlug: normalizeRepoSlug(repoSlug),
        mirrorRoot
    };
    const mirrorPath = getMirrorPath(identity);

    if (!await fs.pathExists(mirrorPath)) {
        throw createIngestEnvelopeError(
            'KB_INGEST_ENVELOPE_MIRROR_MISSING',
            'Tenant repo ingest envelope requires an existing GitMirror mirror'
        );
    }

    const headRevision = await resolveRevision({gitMirror, identity, ref: newHead});
    const baseRevision = await resolveRevision({
        gitMirror,
        identity,
        ref           : lastIngestedRev,
        fallbackToFull: true
    });

    if (!baseRevision) {
        return await buildFullEnvelope({gitMirror, identity, headRevision, rootKind, parserId, parserVersion});
    }

    const linear = await gitMirror.isAncestor({
        ...identity,
        ancestor  : baseRevision,
        descendant: headRevision
    });

    if (!linear) {
        return await buildFullEnvelope({gitMirror, identity, headRevision, rootKind, parserId, parserVersion});
    }

    const diff = await gitMirror.diffRevisions({
        ...identity,
        baseRevision,
        headRevision
    });
    const paths = [...new Set(diff.addedOrChanged || [])].sort();

    return {
        tenantId: identity.tenantId,
        repoSlug: identity.repoSlug,
        files   : await buildFilePayloads({
            gitMirror,
            identity,
            revision: headRevision,
            paths,
            rootKind,
            parserId,
            parserVersion
        }),
        deleted: [...new Set(diff.deleted || [])]
            .sort()
            .map(sourcePath => ({sourcePath, repoSlug: identity.repoSlug})),
        baseRevision,
        headRevision
    };
}

const TenantRepoIngestEnvelopeBuilder = {
    buildIngestEnvelope,
    createTenantRepoMaterializationDigest
};

export default TenantRepoIngestEnvelopeBuilder;
