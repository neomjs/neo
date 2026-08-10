import fs           from 'fs';
import fsPromises   from 'fs/promises';
import path         from 'path';
import {randomUUID} from 'crypto';

/**
 * @summary The owned write-temp-then-rename primitive — one implementation for the whole Brain.
 *
 * Every hand-rolled copy of this shape gets the same three details wrong in the same order, which is
 * why this exists as a primitive rather than a convention:
 *
 * 1. **A fixed `${filePath}.tmp` scratch name collides.** Two processes (or two async writers in one
 *    process) racing the same target both write the same scratch path, and the loser's partial
 *    content is what `rename` promotes. The scratch name here carries pid + a UUID, so concurrent
 *    writers cannot select the same sibling.
 * 2. **A leaked scratch file survives the failure that created it.** Without a `finally`, a throw
 *    between write and rename leaves a `.tmp` next to the real file forever — and the next reader
 *    that globs the directory sees it.
 * 3. **Atomic is not durable.** `rename` is atomic *within* the filesystem: a reader sees the old
 *    file or the new one, never a torn one. It says nothing about surviving power loss. Callers that
 *    need the bytes on the platter after a crash pass `fsync: true`, which costs a real disk round
 *    trip and is therefore opt-in rather than the default.
 *
 * **The scratch sits beside the target, deliberately, not in `os.tmpdir()`.** `rename` is only
 * atomic within one filesystem; a scratch on a different mount degrades to copy-then-delete and
 * loses the property the primitive is named for.
 *
 * The async surface is primary because most callers are already inside `await` paths — several
 * inside daemon transaction commits, where switching to sync would be a behaviour change rather than
 * a refactor. {@link writeFileAtomicSync} exists for the callers that genuinely are synchronous.
 */

/**
 * @summary Builds the unique scratch sibling path for a target.
 * @param {String} absolute Absolute target path.
 * @returns {String}
 * @private
 */
function scratchPathFor(absolute) {
    return `${absolute}.${process.pid}.${randomUUID()}.tmp`
}

/**
 * @summary Writes a file through a unique sibling and an atomic rename.
 * @param {String} filePath Target path; relative paths resolve against `process.cwd()`.
 * @param {String|Buffer} content
 * @param {Object} [options]
 * @param {String} [options.encoding='utf8']
 * @param {Number} [options.mode=0o600] Mode for the scratch file, inherited by the target on rename.
 * @param {Boolean} [options.fsync=false] Flush the file AND every directory entry this call created,
 * in the order `write → file sync → rename → directory sync`. **Strict**: if any required flush
 * cannot be performed, this THROWS rather than resolving. See the durability note below.
 * @param {Object} [options.fsModule=fsPromises] Injection seam for tests and for callers that hold a
 * pre-bound fs module.
 * @returns {Promise<String>} The absolute path written.
 * @throws {Error} When `fsync:true` and any required flush is unavailable or fails.
 */
export async function writeFileAtomic(filePath, content, options = {}) {
    const {
        encoding = 'utf8',
        fsModule = fsPromises,
        fsync    = false,
        mode     = 0o600
    } = options;

    const absolute  = path.resolve(filePath),
          directory = path.dirname(absolute),
          scratch   = scratchPathFor(absolute);

    // `recursive: true` returns the FIRST directory it created, or undefined when none were. That is
    // the anchor for durability: flushing only the leaf leaves every newly created ancestor entry
    // unflushed, so a crash could lose the whole chain while the leaf's own bytes survived.
    const firstCreatedDir = await fsModule.mkdir(directory, {recursive: true});

    try {
        // `flag: 'wx'` fails loud if the scratch somehow exists rather than silently adopting it —
        // with a UUID in the name that should be impossible, so a throw here is a real signal.
        await fsModule.writeFile(scratch, content, {encoding, flag: 'wx', mode});

        if (fsync) {
            await fsyncPath(scratch, fsModule)
        }

        await fsModule.rename(scratch, absolute);

        if (fsync) {
            // The rename is a DIRECTORY mutation; flushing the file alone leaves the directory entry
            // unflushed, so a crash can lose the name while keeping the bytes.
            for (const dir of directoryChainToFlush(directory, firstCreatedDir)) {
                await fsyncPath(dir, fsModule)
            }
        }
    } finally {
        // Runs on the success path too, where the scratch no longer exists — `force` makes that a
        // no-op rather than a second failure mode.
        await fsModule.rm(scratch, {force: true}).catch(() => {})
    }

    return absolute
}

/**
 * @summary The directories whose entries must be flushed: the target's own directory, plus every
 * ancestor this call created, deepest first.
 * @param {String} directory Absolute directory holding the target.
 * @param {String|undefined} firstCreatedDir `mkdir(recursive)`'s return — the shallowest new dir.
 * @returns {String[]}
 * @private
 */
function directoryChainToFlush(directory, firstCreatedDir) {
    const chain = [directory];

    if (typeof firstCreatedDir !== 'string' || firstCreatedDir.length === 0) return chain;

    // Walk up from the target's directory to the shallowest directory this call created, and include
    // that one's PARENT too — the parent is where the new chain's top entry actually appears.
    let current = directory;

    while (current !== firstCreatedDir && path.dirname(current) !== current) {
        current = path.dirname(current);
        chain.push(current)
    }

    const parentOfNewChain = path.dirname(firstCreatedDir);

    if (!chain.includes(parentOfNewChain)) chain.push(parentOfNewChain);

    return chain
}

/**
 * @summary Flushes one path to disk. STRICT — a missing seam or a failed sync throws.
 *
 * The earlier version returned early when `fsModule.open` was absent and swallowed `EPERM`/`EISDIR`/
 * `EBADF`, so `fsync:true` could resolve having performed **zero** flushes while the contract
 * promised power-loss durability. A durability option that reports success without doing the work is
 * worse than no option, because callers stop carrying their own flush.
 *
 * The platform concern that motivated the tolerance is real — directory `fsync` is not permitted
 * everywhere — but the honest response is to FAIL a requested guarantee we cannot provide, not to
 * report it as delivered. `fsync` is opt-in, so no caller pays for this unless it asked.
 * @param {String} target
 * @param {Object} fsModule
 * @returns {Promise<void>}
 * @throws {Error} When the seam is missing or the flush fails.
 * @private
 */
async function fsyncPath(target, fsModule) {
    if (typeof fsModule.open !== 'function') {
        throw new Error(`atomicFileWrite: fsync was requested but this fs module exposes no "open"; refusing to report "${target}" as durable.`)
    }

    let handle = null;

    try {
        handle = await fsModule.open(target, 'r');
        await handle.sync()
    } finally {
        await handle?.close().catch(() => {})
    }
}

/**
 * @summary Synchronous {@link writeFileAtomic}, for callers that genuinely are synchronous.
 * @param {String} filePath Target path; relative paths resolve against `process.cwd()`.
 * @param {String|Buffer} content
 * @param {Object} [options]
 * @param {String} [options.encoding='utf8']
 * @param {Number} [options.mode=0o600]
 * @param {Boolean} [options.fsync=false] Same STRICT contract as {@link writeFileAtomic}: throws
 * rather than resolving when a required flush is unavailable or fails.
 * @param {Object} [options.fsModule=fs] Injection seam; the SYNC fs surface, not `fs/promises`.
 * @returns {String} The absolute path written.
 * @throws {Error} When `fsync:true` and any required flush is unavailable or fails.
 */
export function writeFileAtomicSync(filePath, content, options = {}) {
    const {
        encoding = 'utf8',
        fsModule = fs,
        fsync    = false,
        mode     = 0o600
    } = options;

    const absolute  = path.resolve(filePath),
          directory = path.dirname(absolute),
          scratch   = scratchPathFor(absolute);

    const firstCreatedDir = fsModule.mkdirSync(directory, {recursive: true});

    try {
        fsModule.writeFileSync(scratch, content, {encoding, flag: 'wx', mode});

        if (fsync) {
            fsyncPathSync(scratch, fsModule)
        }

        fsModule.renameSync(scratch, absolute);

        if (fsync) {
            for (const dir of directoryChainToFlush(directory, firstCreatedDir)) {
                fsyncPathSync(dir, fsModule)
            }
        }
    } finally {
        try { fsModule.rmSync(scratch, {force: true}) } catch {}
    }

    return absolute
}

/**
 * @summary Synchronous {@link fsyncPath}. STRICT for the same reason — a missing `openSync`/
 * `fsyncSync` seam or a failed flush throws rather than letting the caller believe it got durability.
 * @param {String} target
 * @param {Object} fsModule
 * @returns {void}
 * @throws {Error} When the seam is missing or the flush fails.
 * @private
 */
function fsyncPathSync(target, fsModule) {
    if (typeof fsModule.openSync !== 'function' || typeof fsModule.fsyncSync !== 'function') {
        throw new Error(`atomicFileWrite: fsync was requested but this fs module exposes no "openSync"/"fsyncSync"; refusing to report "${target}" as durable.`)
    }

    let fd = null;

    try {
        fd = fsModule.openSync(target, 'r');
        fsModule.fsyncSync(fd)
    } finally {
        if (fd !== null) {
            try { fsModule.closeSync(fd) } catch {}
        }
    }
}
