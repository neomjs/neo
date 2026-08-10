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
    // Durability is required, not best-effort. Treating fsync as optional meant an fs that merely
    // implemented mkdir/write/rename published successfully with no flush — and a test double lacking
    // it silently blessed that downgrade rather than failing. If a caller cannot flush, it cannot
    // publish; a complete-looking file with a torn body is the one outcome a reader cannot detect.
    for (const method of ['mkdirSync', 'writeFileSync', 'renameSync', 'openSync', 'fsyncSync', 'closeSync', 'unlinkSync', 'readdirSync']) {
        if (typeof fs?.[method] !== 'function') {
            throw new TypeError(`[hookProjectionTransport] the injected fs must implement ${method} — durability is not optional`)
        }
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
     * @param {Object}   payload.envelope The canonical `live-lane-awareness-projection.v1` envelope.
     * @returns {{file: String}}
     */
    const writeAtomic = ({targetId, envelope, assertDeadline} = {}) => {
        const {dir, file} = resolveTargetPath(targetId),
              temp        = `${file}.${uniqueSuffix()}.tmp`;

        fs.mkdirSync(dir, {recursive: true});

        try {
            // The canonical envelope, verbatim. The transport does not reshape it: the writer owns the
            // contract, and a transport that rebuilt the payload would be a second, silent author of it.
            fs.writeFileSync(temp, JSON.stringify(envelope), 'utf8');

            // Durability before visibility, unconditionally. A rename that beats its own data to disk
            // publishes a complete-LOOKING file with a torn body after a crash.
            const handle = fs.openSync(temp, 'r');

            try {
                fs.fsyncSync(handle)
            } finally {
                fs.closeSync(handle)
            }

            // The deadline is asserted HERE, after the flush and immediately before the rename, because
            // the rename IS the mutation. Checking it earlier only proved the lease was live before the
            // I/O — and the I/O is the part that takes time. A write that crossed its no-renewal TTL
            // during write+fsync would still have published, which is the bound not holding at the one
            // instant it exists to hold.
            assertDeadline?.();

            // DELIBERATELY NOT the shared write-temp-then-rename primitive, for the reason the block
            // above states: the deadline assertion has to land between the flush and the rename,
            // because the rename IS the mutation. A primitive that owns both ends removes the one
            // instant this bound exists to hold.
            fs.renameSync(temp, file); // atomic-write-ok: assertDeadline() must fence between flush and rename

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

    /**
     * @summary Removes temp siblings a previous holder left behind.
     *
     * A holder that crashed mid-write never reached its own cleanup, so its temp sibling survives under
     * a root the reader also scans. One is harmless; unbounded accumulation across every crash is not,
     * and nothing else will ever remove them — the crashed process is gone, and the next holder is the
     * only party that knows the target is now unowned.
     *
     * Best-effort by design: a sweep failure must not deny a publication. Orphans are litter, and
     * refusing to publish because litter could not be removed would let a cleanup problem masquerade as
     * an availability one.
     *
     * @param {String} targetId Server-derived target id.
     * @returns {{swept: String[]}} The temp siblings removed.
     */
    const sweepOrphans = targetId => {
        const {dir} = resolveTargetPath(targetId),
              swept = [];

        try {
            for (const entry of fs.readdirSync(dir)) {
                if (entry.startsWith('current.json.') && entry.endsWith('.tmp')) {
                    try {
                        fs.unlinkSync(`${dir}/${entry}`);
                        swept.push(entry)
                    } catch {}
                }
            }
        } catch {
            // No directory yet, or an unreadable one: nothing to sweep, and nothing worth failing over.
        }

        return {swept}
    };

    return {writeAtomic, resolveTargetPath, sweepOrphans}
}
