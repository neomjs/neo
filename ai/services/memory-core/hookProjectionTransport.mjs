/**
 * @module ai/services/memory-core/hookProjectionTransport
 * @summary The atomic resource write behind hook projections: derive the path, flush a unique temp
 * sibling, rename over the target.
 *
 * Two properties, and neither is optional:
 *
 * - **The path is derived, never supplied.** A producer submits an envelope for an admitted target; it
 *   does not get to say where that lands. Accepting a caller-supplied path would make every producer a
 *   potential arbitrary-write primitive, and the target id is already server-derived precisely so the
 *   location follows from admission rather than from a caller's argument.
 * - **A reader sees old-complete or new-complete, never in-between.** The temp sibling is unique per
 *   attempt and lives in the same directory, so the rename is same-filesystem and atomic. A reader
 *   polling this file has no lock and no retry — a torn read would be indistinguishable to it from a
 *   real projection, which is the failure a hook cannot detect.
 *
 * This is the transport ONLY. It is handed to the lease's publication step and called inside the
 * serialized transaction that fences it: the rename being atomic stops a torn read, while the
 * transaction around it stops a stale holder. Those are different problems, and the rename alone
 * solves only the first.
 */

/**
 * @summary Builds the atomic transport bound to one Memory-Core-owned runtime root.
 *
 * `fs` and the uniqueness source are injected so the transport is testable without touching a real
 * disk, and so the runtime root stays a boot/config decision rather than a per-call argument.
 *
 * @param {Object}   params
 * @param {Object}   params.fs Node fs-like: `mkdirSync`, `writeFileSync`, `renameSync`, `openSync`,
 *   `fsyncSync`, `closeSync`, `unlinkSync`.
 * @param {String}   params.runtimeRoot The Memory-Core-owned projection root (from config).
 * @param {Function} params.uniqueSuffix `() => String` — injected, so a retry never collides with an
 *   in-flight attempt and tests stay deterministic.
 * @returns {{writeAtomic: Function, resolveTargetPath: Function}}
 * @throws {TypeError} When an injection is missing — a wiring bug must not degrade to a guessed path.
 */
export function makeAtomicProjectionTransport({fs, runtimeRoot, uniqueSuffix} = {}) {
    if (!fs || typeof fs.writeFileSync !== 'function' || typeof fs.renameSync !== 'function') {
        throw new TypeError('[hookProjectionTransport] an fs with writeFileSync and renameSync must be injected')
    }
    if (typeof runtimeRoot !== 'string' || !runtimeRoot.length) {
        throw new TypeError('[hookProjectionTransport] runtimeRoot is required from config — this primitive has no default')
    }
    if (typeof uniqueSuffix !== 'function') {
        throw new TypeError('[hookProjectionTransport] a uniqueSuffix source must be injected')
    }

    /**
     * @summary Resolves the server-derived output path for one target.
     * @param {String} targetId Server-derived target id.
     * @returns {{dir: String, file: String}}
     */
    const resolveTargetPath = targetId => {
        // The id is server-derived from an attested tuple, but this is the boundary where it becomes a
        // filesystem path, so it is re-checked here rather than trusted: a separator or traversal
        // segment reaching this point would escape the owned root.
        if (typeof targetId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(targetId)) {
            throw new TypeError(`[hookProjectionTransport] targetId must be an opaque server-derived token; got ${JSON.stringify(targetId)}`)
        }

        // The injected root IS the projection root. Appending a `hook-projections` segment here
        // duplicated the one the config leaf already carries, writing to `<root>/hook-projections/...`
        // under a root that already ended in it — a path no reader would look at.
        const dir = `${runtimeRoot}/${targetId}`;

        return {dir, file: `${dir}/current.json`}
    };

    /**
     * @summary Writes the payload so a concurrent reader sees old-complete or new-complete.
     *
     * Flushed before the rename: a rename that beats its own data to disk publishes a complete-looking
     * file with a torn body after a crash, which is the one outcome a reader cannot detect. A failed
     * attempt removes its temp sibling rather than leaving it to accumulate under a root the reader
     * also scans.
     *
     * @param {Object}   payload
     * @param {String}   payload.targetId Server-derived target id.
     * @param {Object}   payload.publication The publication envelope (contract version, target, epoch,
     *   publish time, per-channel watermarks, degraded channels, `notAuthority`).
     * @param {Object[]} payload.channels The composed channel rows.
     * @returns {{file: String}}
     */
    const writeAtomic = ({targetId, publication, channels} = {}) => {
        const {dir, file} = resolveTargetPath(targetId),
              temp        = `${file}.${uniqueSuffix()}.tmp`;

        fs.mkdirSync(dir, {recursive: true});

        try {
            // The envelope, not a bare channel list: a reader binds to the contract version and needs
            // the epoch, publish time, and watermarks to judge what it is holding.
            fs.writeFileSync(temp, JSON.stringify({...publication, channels}), 'utf8');

            // Durability before visibility. Skipped only if the injected fs cannot fsync — a test double
            // has nothing to flush, and requiring it would force every caller to fake a kernel.
            if (typeof fs.openSync === 'function' && typeof fs.fsyncSync === 'function') {
                const handle = fs.openSync(temp, 'r');

                try {
                    fs.fsyncSync(handle)
                } finally {
                    fs.closeSync?.(handle)
                }
            }

            fs.renameSync(temp, file);

            return {file}
        } catch (error) {
            // Best-effort cleanup: the original failure is what the caller needs, so a cleanup failure
            // must not replace it with a less informative one.
            try {
                fs.unlinkSync?.(temp)
            } catch {}

            throw error
        }
    };

    return {writeAtomic, resolveTargetPath}
}
