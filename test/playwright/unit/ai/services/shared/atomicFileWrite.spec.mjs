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
