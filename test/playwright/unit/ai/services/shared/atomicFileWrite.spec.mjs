import {test, expect}                         from '@playwright/test'
import fs                                     from 'fs'
import fsPromises                             from 'fs/promises'
import os                                     from 'os'
import path                                   from 'path'
import {writeFileAtomic, writeFileAtomicSync} from '../../../../../../ai/services/shared/atomicFileWrite.mjs'

/**
 * @summary Contract suite for the owned write-temp-then-rename primitive.
 *
 * The load-bearing tests are the ones a hand-rolled copy FAILS: concurrent writers against one
 * target (a fixed `${filePath}.tmp` scratch makes them collide), and scratch cleanup after a failed
 * rename (without a `finally`, the partial file outlives the error). Everything else here is the
 * behaviour those two depend on.
 */

let workDir;

test.beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-atomic-write-'))
});

test.afterEach(() => {
    fs.rmSync(workDir, {force: true, recursive: true})
});

const scratchLeftIn = dir => fs.readdirSync(dir).filter(name => name.endsWith('.tmp'));

test.describe('writeFileAtomic (async surface)', () => {
    test('writes the content and returns the absolute path', async () => {
        const target   = path.join(workDir, 'plain.json'),
              returned = await writeFileAtomic(target, '{"ok":true}\n');

        expect(returned).toBe(path.resolve(target));
        expect(fs.readFileSync(target, 'utf8')).toBe('{"ok":true}\n')
    });

    test('creates missing parent directories', async () => {
        const target = path.join(workDir, 'a', 'b', 'c', 'deep.txt');

        await writeFileAtomic(target, 'deep');

        expect(fs.readFileSync(target, 'utf8')).toBe('deep')
    });

    test('overwrites an existing file without leaving scratch behind', async () => {
        const target = path.join(workDir, 'twice.txt');

        await writeFileAtomic(target, 'first');
        await writeFileAtomic(target, 'second');

        expect(fs.readFileSync(target, 'utf8')).toBe('second');
        expect(scratchLeftIn(workDir)).toEqual([])
    });

    /*
     * THE discriminating cell. A hand-rolled `${filePath}.tmp` gives both writers the same scratch
     * path: with `flag:'wx'` the loser throws EEXIST, and without it the two interleave and `rename`
     * promotes a torn file. A unique scratch makes concurrent writers independent, so both resolve
     * and the target holds exactly one of the two payloads — never a blend.
     */
    test('concurrent writers to one target do not collide, and the result is never torn', async () => {
        const target   = path.join(workDir, 'contended.txt'),
              payloads = Array.from({length: 8}, (_, index) => `payload-${index}`.padEnd(4096, '.'));

        await Promise.all(payloads.map(content => writeFileAtomic(target, content)));

        expect(payloads).toContain(fs.readFileSync(target, 'utf8'));
        expect(scratchLeftIn(workDir)).toEqual([])
    });

    test('a failed rename leaves no scratch file behind', async () => {
        const target  = path.join(workDir, 'doomed.txt'),
              failing = {
                  ...fsPromises,
                  rename: async () => { throw new Error('rename refused by the probe') }
              };

        await expect(writeFileAtomic(target, 'never lands', {fsModule: failing}))
            .rejects.toThrow('rename refused by the probe');

        expect(fs.existsSync(target), 'the target must not exist after a failed rename').toBe(false);
        expect(scratchLeftIn(workDir), 'the scratch must be cleaned up by the finally').toEqual([])
    });

    test('the scratch never occupies the target path, so a reader cannot observe a partial write', async () => {
        const target  = path.join(workDir, 'observed.txt'),
              seen    = [],
              probing = {
                  ...fsPromises,
                  writeFile: async (file, ...rest) => {
                      seen.push(file);
                      return fsPromises.writeFile(file, ...rest)
                  }
              };

        await writeFileAtomic(target, 'final', {fsModule: probing});

        expect(seen.length).toBe(1);
        expect(seen[0], 'content is written to a sibling, never to the target').not.toBe(path.resolve(target));
        expect(seen[0].startsWith(path.resolve(target))).toBe(true)
    });

    test('fsync:true still produces the file (durability upgrade, not a behaviour change)', async () => {
        const target = path.join(workDir, 'durable.txt');

        await writeFileAtomic(target, 'flushed', {fsync: true});

        expect(fs.readFileSync(target, 'utf8')).toBe('flushed');
        expect(scratchLeftIn(workDir)).toEqual([])
    });
});

test.describe('writeFileAtomicSync (sync surface)', () => {
    test('matches the async surface: content, parent creation, no scratch', () => {
        const target = path.join(workDir, 'x', 'sync.txt');

        expect(writeFileAtomicSync(target, 'sync-body')).toBe(path.resolve(target));
        expect(fs.readFileSync(target, 'utf8')).toBe('sync-body');
        expect(scratchLeftIn(path.dirname(target))).toEqual([])
    });

    test('a failed rename leaves no scratch file behind', () => {
        const target  = path.join(workDir, 'sync-doomed.txt'),
              failing = {
                  ...fs,
                  renameSync: () => { throw new Error('sync rename refused by the probe') }
              };

        expect(() => writeFileAtomicSync(target, 'never lands', {fsModule: failing}))
            .toThrow('sync rename refused by the probe');

        expect(fs.existsSync(target)).toBe(false);
        expect(scratchLeftIn(workDir)).toEqual([])
    });

    test('fsync:true still produces the file', () => {
        writeFileAtomicSync(path.join(workDir, 'sync-durable.txt'), 'flushed', {fsync: true});

        expect(fs.readFileSync(path.join(workDir, 'sync-durable.txt'), 'utf8')).toBe('flushed')
    });
});

/**
 * @summary The durability contract, proven by ORDER and by REFUSAL rather than by "the file exists".
 *
 * The first version of this suite asserted only that `fsync:true` produced the file — an outcome
 * identical whether both flushes ran or neither did. @neo-gpt falsified it at exact head: an async
 * seam whose `open` always threw `EBADF` resolved as success, and the sync surface resolved with a
 * seam carrying no `openSync` at all. A durability option that reports success without doing the work
 * is worse than no option, because callers stop carrying their own flush.
 *
 * So these assert the sequence `write → file sync → rename → directory sync` and every way it can
 * fail. Deleting either flush call from the primitive fails the order tests below.
 */
test.describe('fsync contract — strict, ordered, and mutation-sensitive', () => {
    /**
     * @summary Wraps a real fs surface, recording ordered `[op, basename]` pairs and optionally
     * failing one specific flush.
     */
    function recordingAsyncSeam({failFileSync = false, failDirSync = false, dropOpen = false} = {}) {
        const calls = [];

        const seam = {
            ...fsPromises,
            mkdir    : async (...args) => { calls.push(['mkdir', path.basename(args[0])]);     return fsPromises.mkdir(...args) },
            writeFile: async (...args) => { calls.push(['writeFile', path.basename(args[0])]); return fsPromises.writeFile(...args) },
            rename   : async (...args) => { calls.push(['rename', path.basename(args[1])]);    return fsPromises.rename(...args) },
            rm       : async (...args) => fsPromises.rm(...args)
        };

        if (dropOpen) {
            // `...fsPromises` above already spread a working `open` in, so the seam must have it
            // DELETED to model a module without the capability. Omitting the wrapper is not enough —
            // an earlier draft of this test did exactly that and passed against a real flush.
            delete seam.open
        } else {
            seam.open = async (target, flags) => {
                const isFile = target.endsWith('.tmp'),
                      handle = await fsPromises.open(target, flags);

                return {
                    sync: async () => {
                        calls.push([isFile ? 'fileSync' : 'dirSync', path.basename(target)]);

                        if (isFile && failFileSync) throw new Error('probe: file sync refused');
                        if (!isFile && failDirSync) throw new Error('probe: directory sync refused');

                        return handle.sync()
                    },
                    close: () => handle.close()
                }
            }
        }

        return {seam, calls};
    }

    test('ORDER: write → file sync → rename → directory sync', async () => {
        const target        = path.join(workDir, 'ordered.txt'),
              {seam, calls} = recordingAsyncSeam();

        await writeFileAtomic(target, 'ordered', {fsModule: seam, fsync: true});

        const ops = calls.map(([op]) => op).filter(op => op !== 'mkdir');

        expect(ops, 'the flush order is the whole durability guarantee').toEqual([
            'writeFile', 'fileSync', 'rename', 'dirSync'
        ]);

        // The file flush targets the SCRATCH (pre-rename); the directory flush targets the directory.
        expect(calls.find(([op]) => op === 'fileSync')[1].endsWith('.tmp')).toBe(true);
        expect(calls.find(([op]) => op === 'dirSync')[1]).toBe(path.basename(workDir))
    });

    test('a missing open seam REFUSES rather than reporting durability it did not perform', async () => {
        const {seam} = recordingAsyncSeam({dropOpen: true});

        await expect(writeFileAtomic(path.join(workDir, 'no-seam.txt'), 'x', {fsModule: seam, fsync: true}))
            .rejects.toThrow(/exposes no "open"/);
    });

    test('a failed PRE-RENAME file sync refuses, and the target is never created', async () => {
        const target        = path.join(workDir, 'file-sync-fails.txt'),
              {seam, calls} = recordingAsyncSeam({failFileSync: true});

        await expect(writeFileAtomic(target, 'x', {fsModule: seam, fsync: true}))
            .rejects.toThrow('probe: file sync refused');

        expect(fs.existsSync(target), 'refusing before the rename means nothing was published').toBe(false);
        expect(calls.map(([op]) => op)).not.toContain('rename');
        expect(scratchLeftIn(workDir)).toEqual([])
    });

    test('a failed POST-RENAME directory sync refuses — the write is committed but NOT durable', async () => {
        const target        = path.join(workDir, 'dir-sync-fails.txt'),
              {seam, calls} = recordingAsyncSeam({failDirSync: true});

        await expect(writeFileAtomic(target, 'committed', {fsModule: seam, fsync: true}))
            .rejects.toThrow('probe: directory sync refused');

        // This is the honest, documented asymmetry: the rename ALREADY happened, so the content is
        // visible. The throw says "you asked for durable and did not get it", not "nothing happened".
        expect(calls.map(([op]) => op)).toContain('rename');
        expect(fs.readFileSync(target, 'utf8')).toBe('committed');
        expect(scratchLeftIn(workDir)).toEqual([])
    });

    test('NESTED: every directory this call created is flushed, not just the leaf', async () => {
        const target        = path.join(workDir, 'p', 'q', 'r', 'deep.txt'),
              {seam, calls} = recordingAsyncSeam();

        await writeFileAtomic(target, 'deep', {fsModule: seam, fsync: true});

        const flushed = calls.filter(([op]) => op === 'dirSync').map(([, name]) => name);

        expect(flushed, 'flushing only the leaf leaves new ancestor entries unflushed').toEqual(
            expect.arrayContaining(['r', 'q', 'p'])
        );
    });

    test('FD-STYLE seam: an fs module whose open resolves a NUMBER flushes via fsModule.fsync', async () => {
        const target = path.join(workDir, 'fd-style.txt'),
              synced = [];

        // The shape the lease-renewal callers inject: open -> fd number, fsync(fd), close(fd).
        // The real handle is retained so `close` can release it — returning only `.fd` and dropping
        // the handle leaks it to GC, which Node now treats as an error.
        const handles = new Map();

        const fdSeam = {
            ...fsPromises,
            open : async (file, flags) => {
                const handle = await fsPromises.open(file, flags);
                handles.set(handle.fd, handle);
                return handle.fd
            },
            fsync: async fd => { synced.push(fd) },
            close: async fd => { await handles.get(fd)?.close(); handles.delete(fd) }
        };

        await writeFileAtomic(target, 'fd-flushed', {fsModule: fdSeam, fsync: true});

        expect(fs.readFileSync(target, 'utf8')).toBe('fd-flushed');
        expect(synced.length, 'file flush + directory flush both routed through fsModule.fsync').toBe(2)
    });

    test('FD-STYLE seam WITHOUT fsync refuses rather than reporting durability', async () => {
        const handles = new Map();

        const noFsyncSeam = {
            ...fsPromises,
            open : async (file, flags) => {
                const handle = await fsPromises.open(file, flags);
                handles.set(handle.fd, handle);
                return handle.fd
            },
            close: async fd => { await handles.get(fd)?.close(); handles.delete(fd) }
        };

        delete noFsyncSeam.fsync;

        await expect(writeFileAtomic(path.join(workDir, 'fd-no-fsync.txt'), 'x', {
            fsModule: noFsyncSeam, fsync: true
        })).rejects.toThrow(/exposes no "fsync"/);
    });

    test('SYNC surface: a seam without openSync/fsyncSync refuses instead of silently skipping', () => {
        const {openSync, fsyncSync, ...withoutFlushSeam} = fs;

        expect(() => writeFileAtomicSync(path.join(workDir, 'sync-no-seam.txt'), 'x', {
            fsModule: withoutFlushSeam, fsync: true
        })).toThrow(/exposes no "openSync"\/"fsyncSync"/);
    });

    /**
     * @summary Sync twin of the recording seam.
     *
     * These exist because @neo-gpt's re-review found the async proof did not cover the sync surface:
     * deleting the sync post-rename directory flush left all 21 tests green. Mutation-sensitivity
     * proven on one surface says nothing about the other, and the untested half is the half that
     * silently stops flushing.
     */
    function recordingSyncSeam({failDirSync = false} = {}) {
        const calls  = [],
              isFile = new Map();

        const seam = {
            ...fs,
            mkdirSync    : (...args) => { calls.push(['mkdir', path.basename(args[0])]);     return fs.mkdirSync(...args) },
            writeFileSync: (...args) => { calls.push(['writeFile', path.basename(args[0])]); return fs.writeFileSync(...args) },
            renameSync   : (...args) => { calls.push(['rename', path.basename(args[1])]);    return fs.renameSync(...args) },
            openSync     : (target, flags) => {
                const fd = fs.openSync(target, flags);
                isFile.set(fd, target.endsWith('.tmp'));
                return fd
            },
            fsyncSync: fd => {
                const fileFlush = isFile.get(fd);
                calls.push([fileFlush ? 'fileSync' : 'dirSync', String(fd)]);

                if (!fileFlush && failDirSync) throw new Error('probe: sync directory flush refused');

                return fs.fsyncSync(fd)
            }
        };

        return {seam, calls}
    }

    test('SYNC ORDER: write → file sync → rename → directory sync', () => {
        const target        = path.join(workDir, 'sync-ordered.txt'),
              {seam, calls} = recordingSyncSeam();

        writeFileAtomicSync(target, 'ordered', {fsModule: seam, fsync: true});

        expect(calls.map(([op]) => op).filter(op => op !== 'mkdir'))
            .toEqual(['writeFile', 'fileSync', 'rename', 'dirSync']);
        expect(fs.readFileSync(target, 'utf8')).toBe('ordered')
    });

    test('SYNC: a failed POST-RENAME directory sync refuses — committed but NOT durable', () => {
        const target        = path.join(workDir, 'sync-dir-fails.txt'),
              {seam, calls} = recordingSyncSeam({failDirSync: true});

        expect(() => writeFileAtomicSync(target, 'committed', {fsModule: seam, fsync: true}))
            .toThrow('probe: sync directory flush refused');

        // Same asymmetry the async surface pins: the rename already landed, so the content IS
        // visible. The throw reports a missing durability upgrade, never a rollback.
        expect(calls.map(([op]) => op)).toContain('rename');
        expect(fs.readFileSync(target, 'utf8')).toBe('committed');
        expect(scratchLeftIn(workDir)).toEqual([])
    });

    test('SYNC NESTED: every directory this call created is flushed, not just the leaf', () => {
        const target        = path.join(workDir, 'sy', 'nc', 'deep.txt'),
              {seam, calls} = recordingSyncSeam();

        writeFileAtomicSync(target, 'deep', {fsModule: seam, fsync: true});

        expect(calls.filter(([op]) => op === 'dirSync').length).toBeGreaterThan(1)
    });

    test('SYNC surface: a failed file sync refuses and publishes nothing', () => {
        const target  = path.join(workDir, 'sync-flush-fails.txt'),
              failing = {...fs, fsyncSync: () => { throw new Error('probe: sync flush refused') }};

        expect(() => writeFileAtomicSync(target, 'x', {fsModule: failing, fsync: true}))
            .toThrow('probe: sync flush refused');

        expect(fs.existsSync(target)).toBe(false);
        expect(scratchLeftIn(workDir)).toEqual([])
    });
});
