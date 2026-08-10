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
 * @param {Boolean} [options.fsync=false] Also flush the file and its directory to disk before
 * returning. Atomic without it; durable across power loss with it.
 * @param {Object} [options.fsModule=fsPromises] Injection seam for tests and for callers that hold a
 * pre-bound fs module.
 * @returns {Promise<String>} The absolute path written.
 */
export async function writeFileAtomic(filePath, content, options = {}) {
    const {
        encoding = 'utf8',
        fsModule = fsPromises,
        fsync    = false,
        mode     = 0o600
    } = options;

    const absolute = path.resolve(filePath),
          scratch  = scratchPathFor(absolute);

    await fsModule.mkdir(path.dirname(absolute), {recursive: true});

    try {
        // `flag: 'wx'` fails loud if the scratch somehow exists rather than silently adopting it —
        // with a UUID in the name that should be impossible, so a throw here is a real signal.
        await fsModule.writeFile(scratch, content, {encoding, flag: 'wx', mode});

        if (fsync) {
            await fsyncPath(scratch, fsModule)
        }

        await fsModule.rename(scratch, absolute);

        if (fsync) {
            // The rename itself is a directory mutation; flushing the file alone leaves the
            // directory entry unflushed, so a crash can lose the name while keeping the bytes.
            await fsyncPath(path.dirname(absolute), fsModule)
        }
    } finally {
        // Runs on the success path too, where the scratch no longer exists — `force` makes that a
        // no-op rather than a second failure mode.
        await fsModule.rm(scratch, {force: true}).catch(() => {})
    }

    return absolute
}

/**
 * @summary Flushes one path to disk, tolerating fs modules without an `open` seam.
 * @param {String} target
 * @param {Object} fsModule
 * @returns {Promise<void>}
 * @private
 */
async function fsyncPath(target, fsModule) {
    if (typeof fsModule.open !== 'function') return;

    let handle = null;

    try {
        handle = await fsModule.open(target, 'r');
        await handle.sync()
    } catch (error) {
        // A directory fsync is not permitted on every platform (Windows notably). The rename has
        // already happened and is atomic; only the durability upgrade is unavailable, so this must
        // not fail the write.
        if (error?.code !== 'EPERM' && error?.code !== 'EISDIR' && error?.code !== 'EBADF') throw error
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
 * @param {Boolean} [options.fsync=false]
 * @param {Object} [options.fsModule=fs] Injection seam; the SYNC fs surface, not `fs/promises`.
 * @returns {String} The absolute path written.
 */
export function writeFileAtomicSync(filePath, content, options = {}) {
    const {
        encoding = 'utf8',
        fsModule = fs,
        fsync    = false,
        mode     = 0o600
    } = options;

    const absolute = path.resolve(filePath),
          scratch  = scratchPathFor(absolute);

    fsModule.mkdirSync(path.dirname(absolute), {recursive: true});

    try {
        fsModule.writeFileSync(scratch, content, {encoding, flag: 'wx', mode});

        if (fsync) {
            fsyncPathSync(scratch, fsModule)
        }

        fsModule.renameSync(scratch, absolute);

        if (fsync) {
            fsyncPathSync(path.dirname(absolute), fsModule)
        }
    } finally {
        try { fsModule.rmSync(scratch, {force: true}) } catch {}
    }

    return absolute
}

/**
 * @summary Synchronous {@link fsyncPath}.
 * @param {String} target
 * @param {Object} fsModule
 * @returns {void}
 * @private
 */
function fsyncPathSync(target, fsModule) {
    if (typeof fsModule.openSync !== 'function') return;

    let fd = null;

    try {
        fd = fsModule.openSync(target, 'r');
        fsModule.fsyncSync(fd)
    } catch (error) {
        if (error?.code !== 'EPERM' && error?.code !== 'EISDIR' && error?.code !== 'EBADF') throw error
    } finally {
        if (fd !== null) {
            try { fsModule.closeSync(fd) } catch {}
        }
    }
}
