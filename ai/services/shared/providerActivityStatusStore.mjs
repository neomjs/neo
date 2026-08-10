import fs      from 'node:fs';
import fsExtra from 'fs-extra';
import path    from 'node:path';
import {
    enterLifecycleGuard,
    exitLifecycleGuard,
    verifyLifecycleGuardOwnership
} from '../../daemons/shared/lifecycleGuard.mjs';

const
    STATUS_SCHEMA_VERSION       = 1,
    STATUS_GUARD_STALE_AFTER_MS = 2000,
    STATUS_PUBLICATION_ATTEMPTS = 3,
    STATUS_PUBLICATION_RETRY_MS = 25,
    RECORDER_KEYS               = Object.freeze(['knowledge-base', 'memory-core']),
    RECORDER_SET                = new Set(RECORDER_KEYS);

/**
 * @summary Resolves one allowlisted recorder's bounded status sidecar beside the shared SQLite artifact.
 * @param {String} dbPath Shared telemetry database path.
 * @param {'knowledge-base'|'memory-core'} recorder Recorder owner.
 * @returns {String|null}
 */
export function resolveProviderActivityStatusFile(dbPath, recorder) {
    if (!RECORDER_SET.has(recorder)) {
        throw new TypeError(`providerActivityStatusStore: unsupported recorder '${recorder}'`);
    }
    if (typeof dbPath !== 'string' || !dbPath.trim() || dbPath === ':memory:') return null;

    return `${dbPath}.provider-activity-${recorder}.json`;
}

/**
 * @summary Validates the exact non-sensitive status payload shape.
 * @param {*} value Candidate decoded payload.
 * @param {String} recorder Expected recorder owner.
 * @returns {Boolean}
 */
function isValidStatus(value, recorder) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

    const keys = Object.keys(value).sort();

    return keys.join(',') === 'lastFailureAt,lastSuccessAt,recorder,schemaVersion'
        && value.schemaVersion === STATUS_SCHEMA_VERSION
        && value.recorder === recorder
        && (value.lastSuccessAt === null || Number.isFinite(value.lastSuccessAt))
        && (value.lastFailureAt === null || Number.isFinite(value.lastFailureAt));
}

/**
 * @summary Loads one existing status payload without creating or repairing any artifact.
 * @param {String|null} file Status sidecar path.
 * @param {String} recorder Expected recorder owner.
 * @returns {Object|null}
 */
function loadStatus(file, recorder) {
    if (!file || !fs.existsSync(file)) return null;

    try {
        const value = JSON.parse(fs.readFileSync(file, 'utf8'));

        return isValidStatus(value, recorder) ? value : null;
    } catch {
        return null;
    }
}

/**
 * @summary Creates one serialized atomic writer for a recorder-owned provider status sidecar.
 *
 * Provider calls never await routine status publication. The writer retains monotonic pending maxima,
 * re-reads and merges the shared payload inside Neo's owner-token lifecycle guard, then replaces a 0600
 * temporary sibling atomically. The guard is PID-independent across container namespaces; a failed
 * publication therefore remains pending for the next attempt instead of being erased by later success.
 * No exception message, path, payload, label, or caller identity enters the sidecar.
 *
 * @param {Object} options Writer options.
 * @param {String} options.dbPath Shared telemetry database path.
 * @param {'knowledge-base'|'memory-core'} options.recorder Recorder owner.
 * @param {Function} [options.now=Date.now] Clock seam.
 * @returns {Object}
 */
export function createProviderActivityStatusWriter({dbPath, recorder, now = Date.now} = {}) {
    const file    = resolveProviderActivityStatusFile(dbPath, recorder);
    const pending = {
        lastSuccessAt: null,
        lastFailureAt: null
    };
    let writeChain = Promise.resolve(),
        sequence   = 0;

    const publish = (field, timestamp = now()) => {
        if (!file || !Number.isFinite(timestamp)) return Promise.resolve();

        pending[field] = Math.max(pending[field] ?? 0, timestamp);

        writeChain = writeChain.then(async () => {
            let lastError;

            for (let attempt = 0; attempt < STATUS_PUBLICATION_ATTEMPTS; attempt++) {
                try {
                    await fs.promises.mkdir(path.dirname(file), {recursive: true});

                    const guard = await enterLifecycleGuard({
                        leasePath        : file,
                        fsModule         : fsExtra,
                        guardStaleAfterMs: STATUS_GUARD_STALE_AFTER_MS
                    });

                    if (!guard) {
                        throw new Error('providerActivityStatusStore: status merge guard unavailable');
                    }

                    try {
                        const current = loadStatus(file, recorder) || {
                                  schemaVersion: STATUS_SCHEMA_VERSION,
                                  recorder,
                                  lastSuccessAt: null,
                                  lastFailureAt: null
                              },
                              snapshot = {
                                  ...current,
                                  lastSuccessAt: Math.max(current.lastSuccessAt ?? 0, pending.lastSuccessAt ?? 0) || null,
                                  lastFailureAt: Math.max(current.lastFailureAt ?? 0, pending.lastFailureAt ?? 0) || null
                              },
                              temp = `${file}.${process.pid}.${++sequence}.tmp`;

                        try {
                            await fs.promises.writeFile(temp, JSON.stringify(snapshot), {encoding: 'utf8', mode: 0o600});

                            if (!await verifyLifecycleGuardOwnership({
                                ownerFilePath: guard.ownerFilePath,
                                fsModule     : fsExtra
                            })) {
                                throw new Error('providerActivityStatusStore: status merge guard ownership lost');
                            }

                            // DELIBERATELY NOT the shared write-temp-then-rename primitive. The
                            // ownership check directly above is the only thing that binds this
                            // effect, and it must sit BETWEEN the scratch write and the rename. The
                            // primitive collapses those into one call, which would delete the fence
                            // and let a holder that has already lost the guard publish its merge.
                            await fs.promises.rename(temp, file); // atomic-write-ok: guard-ownership re-verify must fence between write and rename
                        } finally {
                            await fs.promises.unlink(temp).catch(() => {});
                        }
                    } finally {
                        await exitLifecycleGuard({
                            ownerFilePath: guard.ownerFilePath,
                            fsModule     : fsExtra
                        });
                    }

                    return;
                } catch (error) {
                    lastError = error;
                }

                if (attempt + 1 < STATUS_PUBLICATION_ATTEMPTS) {
                    await new Promise(resolve => setTimeout(resolve, STATUS_PUBLICATION_RETRY_MS));
                }
            }

            throw lastError || new Error('providerActivityStatusStore: status publication failed');
        }).catch(() => {
            // Retain pending maxima for the next publication attempt. The shared recorder file is
            // another process's authority too, so a writer that never acquired (or lost) the guard
            // must not delete it outside the owner-token critical section.
        });

        return writeChain;
    };

    return {
        file,
        flush         : () => writeChain,
        publishFailure: timestamp => publish('lastFailureAt', timestamp),
        publishSuccess: timestamp => publish('lastSuccessAt', timestamp)
    };
}

/**
 * @summary Reads recorder-owned status sidecars without creating, repairing, or updating them.
 * @param {Object} options Observer options.
 * @param {String} options.dbPath Shared telemetry database path.
 * @param {Number} options.sinceTs Effective observer-window start timestamp.
 * @param {String[]} [options.requiredRecorders=RECORDER_KEYS] Sidecars required for availability.
 * @returns {{status: 'ok'|'partial'|'unavailable'}}
 */
export function inspectProviderActivityStatus({
    dbPath,
    sinceTs,
    requiredRecorders = RECORDER_KEYS
} = {}) {
    if (dbPath === ':memory:') return {status: 'ok'};

    let recentFailure = false;

    for (const recorder of RECORDER_KEYS) {
        const file     = resolveProviderActivityStatusFile(dbPath, recorder),
              required = requiredRecorders.includes(recorder);

        if (!file || !fs.existsSync(file)) {
            if (required) return {status: 'unavailable'};
            continue;
        }

        const status = loadStatus(file, recorder);

        if (!status) return {status: required ? 'unavailable' : 'partial'};
        if (Number.isFinite(status.lastFailureAt) && status.lastFailureAt >= sinceTs) {
            recentFailure = true;
        }
    }

    return {status: recentFailure ? 'partial' : 'ok'};
}
