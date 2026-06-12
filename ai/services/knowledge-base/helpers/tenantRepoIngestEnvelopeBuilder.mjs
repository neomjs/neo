import {execFile}  from 'child_process';
import fs          from 'fs-extra';
import {promisify} from 'util';

import GitMirror from './gitMirror.mjs';
import {
    deriveTenantRepoMirrorPath,
    normalizeRepoSlug,
    redactTenantRepoSecrets
} from './tenantRepoAccessContract.mjs';

const execFileAsync = promisify(execFile);
const GIT_MAX_BUFFER = 50 * 1024 * 1024;

/**
 * @summary Builds `KnowledgeBaseIngestionService.ingestSourceFiles()` envelopes from tenant Git mirrors.
 *
 * `TenantRepoIngestEnvelopeBuilder` is the #11789 adapter between the low-level
 * persistent mirror primitive (#11788) and the tenant KB ingestion payload contract.
 * Linear history advances emit bounded raw-file deltas plus tombstones; bootstrap,
 * missing-baseline, and force-push cases fall back to a full manifest-carrying
 * snapshot so the ingestion service can reconcile the claimed live path set without
 * relying on a stale revision boundary.
 *
 * @see https://github.com/neomjs/neo/issues/11789
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
 * @summary Runs read-only git commands against an existing bare mirror.
 * @param {String} mirrorPath Local mirror path.
 * @param {String[]} args Git arguments.
 * @param {Object} options={}
 * @returns {Promise<String>}
 * @private
 */
async function runMirrorGit(mirrorPath, args, {
    failureCode = 'KB_INGEST_ENVELOPE_GIT_FAILED',
    failureMessage = 'Tenant repo ingest envelope git command failed'
} = {}) {
    try {
        const {stdout} = await execFileAsync('git', args, {
            cwd      : mirrorPath,
            maxBuffer: GIT_MAX_BUFFER
        });

        return stdout;
    } catch (error) {
        throw createIngestEnvelopeError(failureCode, failureMessage, {
            cause   : error,
            exitCode: error.code,
            stdout  : error.stdout,
            stderr  : error.stderr
        });
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
 * @returns {Promise<Array<String>>}
 * @private
 */
async function listRevisionPaths({mirrorPath, revision}) {
    const stdout = await runMirrorGit(
        mirrorPath,
        ['ls-tree', '-r', '-z', '--name-only', revision],
        {
            failureCode   : 'KB_INGEST_ENVELOPE_LIST_FAILED',
            failureMessage: 'Tenant repo ingest envelope failed to list revision paths'
        }
    );

    return stdout.split('\0').filter(Boolean).sort();
}

/**
 * @summary Reads one text file from a revision.
 * @param {Object} options
 * @returns {Promise<String>}
 * @private
 */
async function readRevisionFile({mirrorPath, revision, sourcePath}) {
    if (!sourcePath || sourcePath.includes('\0')) {
        throw createIngestEnvelopeError(
            'KB_INGEST_ENVELOPE_PATH_INVALID',
            'Tenant repo ingest envelope received an invalid sourcePath'
        );
    }

    return await runMirrorGit(
        mirrorPath,
        ['show', `${revision}:${sourcePath}`],
        {
            failureCode   : 'KB_INGEST_ENVELOPE_FILE_READ_FAILED',
            failureMessage: `Tenant repo ingest envelope failed to read '${sourcePath}'`
        }
    );
}

/**
 * @summary Builds raw-file payload records from source paths.
 * @param {Object} options
 * @returns {Promise<Array<Object>>}
 * @private
 */
async function buildFilePayloads({mirrorPath, revision, paths, repoSlug, rootKind, parserId, parserVersion}) {
    const files = [];

    for (const sourcePath of paths) {
        files.push({
            sourcePath,
            repoSlug,
            rootKind,
            content: await readRevisionFile({mirrorPath, revision, sourcePath}),
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
async function buildFullEnvelope({identity, mirrorPath, headRevision, rootKind, parserId, parserVersion}) {
    const paths = await listRevisionPaths({mirrorPath, revision: headRevision});
    const files = await buildFilePayloads({
        mirrorPath,
        revision: headRevision,
        paths,
        repoSlug: identity.repoSlug,
        rootKind,
        parserId,
        parserVersion
    });

    return {
        tenantId: identity.tenantId,
        repoSlug : identity.repoSlug,
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
        return await buildFullEnvelope({identity, mirrorPath, headRevision, rootKind, parserId, parserVersion});
    }

    const linear = await gitMirror.isAncestor({
        ...identity,
        ancestor  : baseRevision,
        descendant: headRevision
    });

    if (!linear) {
        return await buildFullEnvelope({identity, mirrorPath, headRevision, rootKind, parserId, parserVersion});
    }

    const diff = await gitMirror.diffRevisions({
        ...identity,
        baseRevision,
        headRevision
    });
    const paths = [...new Set(diff.addedOrChanged || [])].sort();

    return {
        tenantId: identity.tenantId,
        repoSlug : identity.repoSlug,
        files: await buildFilePayloads({
            mirrorPath,
            revision: headRevision,
            paths,
            repoSlug: identity.repoSlug,
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
    buildIngestEnvelope
};

export default TenantRepoIngestEnvelopeBuilder;
