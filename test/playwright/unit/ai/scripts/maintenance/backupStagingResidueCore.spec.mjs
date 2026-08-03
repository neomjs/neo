import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import path           from 'path';
import {
    cleanStagingResidue,
    createStagingRoot,
    isStagingResidueName,
    listStagingResidue,
    selectStagingResidueForRemoval,
    STAGING_PREFIX,
    summarizeStagingResidue
} from '../../../../../../ai/scripts/maintenance/backupStagingResidueCore.mjs';

const HOUR_MS = 3600000;

/**
 * Builds a backup root holding published bundles and staging residue with controlled mtimes, so
 * "newest first" is a property of the fixture rather than of directory-creation timing.
 */
function createBackupRoot({partials = 0, bundles = 0, bytesPerPartial = 0} = {}) {
    const backupRoot = `/tmp/backup-staging-residue-${Date.now()}-${Math.random()}`;
    fs.ensureDirSync(backupRoot);

    const now     = Date.now(),
          created = [];

    for (let i = 0; i < partials; i++) {
        // Oldest first, so index 0 is the oldest and the LAST created is the newest.
        const dir = path.join(backupRoot, `${STAGING_PREFIX}backup-2026-08-0${i + 1}-abc${i}`);
        fs.ensureDirSync(dir);

        if (bytesPerPartial > 0) {
            fs.writeFileSync(path.join(dir, 'memories.jsonl'), 'x'.repeat(bytesPerPartial), 'utf8')
        }

        const mtime = new Date(now - (partials - i) * HOUR_MS);
        fs.utimesSync(dir, mtime, mtime);
        created.push(dir)
    }

    for (let i = 0; i < bundles; i++) {
        fs.ensureDirSync(path.join(backupRoot, `backup-2026-08-0${i + 1}T00-00-00.000Z`))
    }

    return {backupRoot, created};
}

test.describe('backupStagingResidueCore — the .backup-partial-* lifecycle (#16427)', () => {
    /**
     * AC1. The defect was unbounded growth: abrupt death cannot clean up after itself, and every
     * root-level enumerator is blind to the residue by design, so nothing ever reclaimed it. The
     * assertion is on the SURVIVING SET after repeated crashes, not on a single sweep's return.
     */
    test('residue cannot grow without bound across repeated abrupt terminations', async () => {
        const {backupRoot} = createBackupRoot({partials: 9}),
              logger       = {log: () => {}};

        await cleanStagingResidue(backupRoot, logger, {keepPartials: 2});

        const survivors = await listStagingResidue(backupRoot);
        expect(survivors).toHaveLength(2);

        // A second crash wave must not ratchet the floor upward.
        createBackupRoot({partials: 0});
        for (let i = 0; i < 5; i++) {
            fs.ensureDirSync(path.join(backupRoot, `${STAGING_PREFIX}wave2-${i}`))
        }

        await cleanStagingResidue(backupRoot, logger, {keepPartials: 2});
        expect(await listStagingResidue(backupRoot)).toHaveLength(2);
    });

    test('the survivors are the NEWEST partials, so the most recent failure stays inspectable', async () => {
        const {backupRoot, created} = createBackupRoot({partials: 5}),
              newest                = created.slice(-2).map(dir => path.basename(dir));

        await cleanStagingResidue(backupRoot, {log: () => {}}, {keepPartials: 2});

        const survivorNames = (await listStagingResidue(backupRoot)).map(entry => entry.name);
        expect(survivorNames.sort()).toEqual(newest.sort());
    });

    /**
     * AC2. Asserted EXPLICITLY rather than inferred from the heavy-maintenance lease that serialises
     * the lane, and rather than left to the accident that an in-flight staging root is also the
     * newest. `keepPartials: 0` removes that accidental protection, so only the explicit exclusion
     * can save it — which is exactly the condition under which the AC has teeth.
     */
    test('an in-flight staging directory is never reclaimed, even at keepPartials 0', async () => {
        const {backupRoot, created} = createBackupRoot({partials: 4}),
              inFlight              = created[0]; // the OLDEST — first to die without the exclusion

        await cleanStagingResidue(backupRoot, {log: () => {}}, {
            excludePath : inFlight,
            keepPartials: 0
        });

        expect(fs.existsSync(inFlight)).toBe(true);
        expect(await listStagingResidue(backupRoot)).toHaveLength(1);
    });

    /**
     * The safety property atomic publication delivered, and the most likely thing a careless fix
     * breaks. A leading dot is what keeps an incomplete bundle out of the restorability walk.
     */
    test('the staging namespace never overlaps the published `backup-` namespace', async () => {
        const {backupRoot} = createBackupRoot({partials: 3, bundles: 4});

        const residue         = await listStagingResidue(backupRoot),
              publishedByName = (await fs.readdir(backupRoot)).filter(name => name.startsWith('backup-'));

        expect(residue).toHaveLength(3);
        expect(publishedByName).toHaveLength(4);

        // The pin: nothing this module reports can be seen by a `startsWith('backup-')` enumerator,
        // and nothing a published-bundle enumerator sees can be reported here. Two disjoint sets.
        for (const entry of residue) {
            expect(entry.name.startsWith('backup-')).toBe(false);
            expect(publishedByName).not.toContain(entry.name)
        }

        expect(isStagingResidueName('backup-2026-08-01T00-00-00.000Z')).toBe(false);
        expect(isStagingResidueName(`${STAGING_PREFIX}anything`)).toBe(true);
    });

    test('a sweep leaves every published bundle untouched', async () => {
        const {backupRoot} = createBackupRoot({partials: 5, bundles: 3});

        await cleanStagingResidue(backupRoot, {log: () => {}}, {keepPartials: 0});

        const remaining = (await fs.readdir(backupRoot)).filter(name => name.startsWith('backup-'));
        expect(remaining).toHaveLength(3);
    });

    /**
     * AC5. The residue is the only surviving evidence of a termination that recorded no terminal
     * outcome, so a reclamation that leaves no trace is indistinguishable from one that never ran.
     */
    test('every reclamation is logged with the directory name and its age', async () => {
        const {backupRoot, created} = createBackupRoot({partials: 3}),
              lines                 = [],
              oldest                = path.basename(created[0]);

        await cleanStagingResidue(backupRoot, {log: line => lines.push(line)}, {keepPartials: 2});

        const removalLine = lines.find(line => line.includes(oldest));
        expect(removalLine).toBeTruthy();
        expect(removalLine).toMatch(/age: \d+h/);
    });

    /**
     * A stray FILE carrying the staging prefix is not residue. `mkdtemp` only ever creates
     * directories, so a prefixed file is something else entirely — and sweeping or counting it
     * would let an unrelated artifact drive a reclamation decision.
     */
    test('a non-directory entry carrying the prefix is neither swept nor counted', async () => {
        const {backupRoot, created} = createBackupRoot({partials: 3}),
              strayFile             = path.join(backupRoot, `${STAGING_PREFIX}stray-file`);

        await fs.writeFile(strayFile, 'not-a-directory', 'utf8');

        expect(await listStagingResidue(backupRoot)).toHaveLength(3);
        expect((await summarizeStagingResidue(backupRoot)).count).toBe(3);

        const result = await cleanStagingResidue(backupRoot, {log: () => {}}, {keepPartials: 2});

        expect(result.inspected).toBe(3);
        expect(result.removed).toEqual([path.basename(created[0])]);
        expect(fs.existsSync(strayFile)).toBe(true);
    });

    test('summarizeStagingResidue reports count and bytes for the observability surface', async () => {
        const {backupRoot} = createBackupRoot({partials: 3, bytesPerPartial: 128});

        const summary = await summarizeStagingResidue(backupRoot);

        expect(summary.status).toBe('ok');
        expect(summary.count).toBe(3);
        expect(summary.bytes).toBe(384);
        expect(summary.oldestMtimeMs).toBeLessThan(Date.now());
    });

    test('a clean root reports an OK zero rather than omitting the block', async () => {
        const {backupRoot} = createBackupRoot({bundles: 2});

        expect(await summarizeStagingResidue(backupRoot)).toMatchObject({
            bytes        : 0,
            count        : 0,
            errorCode    : null,
            oldestMtimeMs: null,
            status       : 'ok'
        });
    });

    /**
     * An absent root is an ANSWER — "no backup root" genuinely means "no residue" — so it resolves
     * `ok`, unlike an unreadable one below. This pair is the discriminator: without both, `ok` could
     * not be distinguished from "the catch swallowed everything".
     */
    test('a missing backup root is an OK zero, not a failed observation', async () => {
        expect(await listStagingResidue('/tmp/does-not-exist-16427')).toEqual([]);
        expect(await summarizeStagingResidue('/tmp/does-not-exist-16427')).toMatchObject({
            count : 0,
            status: 'ok'
        });
    });

    /**
     * The namespace-ownership coupling. Sharing a constant is not ownership — an earlier revision
     * exported `STAGING_PREFIX` as "the one owner" while the writer kept its own `.backup-partial-`
     * literal, so the two agreed only by coincidence and could diverge silently, blinding the sweep
     * and the snapshot to newly-created residue with every test still green. This drives the REAL
     * creator and asserts the round trip: what the producer makes, the consumers must see.
     */
    test('what createStagingRoot makes, the enumerator and the predicate both recognize', async () => {
        const {backupRoot} = createBackupRoot({bundles: 2}),
              created      = await createStagingRoot(backupRoot, 'backup-2026-08-03T00-00-00.000Z'),
              basename     = path.basename(created);

        expect(isStagingResidueName(basename)).toBe(true);
        expect(basename.startsWith('backup-')).toBe(false);

        const seen = await listStagingResidue(backupRoot);
        expect(seen.map(entry => entry.path)).toContain(created);

        // ...and the in-flight exclusion can address it, which is what `runBackup` relies on.
        expect(selectStagingResidueForRemoval(seen, {excludePath: created, keepPartials: 0})).toEqual([]);
    });

    /**
     * Error truth. `ENOENT` is an answer; every other code is a FAILED OBSERVATION. Returning `[]`
     * for both would make "I could not look" wear the same shape as "I looked and found nothing" —
     * the blind `count: 0` this module's own docstring warns about, committed by the module itself.
     */
    test('an unreadable root fails loudly instead of reporting a clean zero', async () => {
        const {backupRoot}  = createBackupRoot({partials: 2}),
              notADirectory = path.join(backupRoot, 'regular-file');

        fs.writeFileSync(notADirectory, 'x', 'utf8');

        // The enumerator throws rather than inventing an empty answer...
        await expect(listStagingResidue(notADirectory)).rejects.toThrow();

        // ...the observability surface reports the failure EXPLICITLY, with null counts so no
        // consumer can sum or threshold a measurement that never happened...
        const summary = await summarizeStagingResidue(notADirectory);
        expect(summary.status).toBe('unreadable');
        expect(summary.count).toBeNull();
        expect(summary.bytes).toBeNull();
        expect(summary.errorCode).toBe('ENOTDIR');

        // ...and the sweep propagates, reaching runBackup's warning path instead of silently no-oping.
        await expect(cleanStagingResidue(notADirectory, {log: () => {}}, {keepPartials: 0})).rejects.toThrow();
    });

    /**
     * The error-truth rule applies at EVERY observation site, not just the root `readdir`. The first
     * repair fixed one of four catch sites; an entry that could be listed but not stat'd was still
     * dropped silently, which removed it from the count AND from the sweep's work list — unreported
     * and unreclaimed at once.
     *
     * The failure is INJECTED rather than produced with real permissions on purpose: `chmod` does not
     * stop root, and CI runs as root, so a permission fixture would pass locally and prove nothing
     * where it counts. The thing under test is the error-code classification, which an injected code
     * exercises exactly.
     */
    test('an entry that can be listed but not stat-ed propagates, never vanishes (#16427)', async () => {
        const {backupRoot} = createBackupRoot({partials: 2}),
              eacces       = Object.assign(new Error('permission denied'), {code: 'EACCES'}),
              fsImpl       = {
                  readdir: (...args) => fs.readdir(...args),
                  stat   : () => Promise.reject(eacces)
              };

        await expect(listStagingResidue(backupRoot, {fsImpl})).rejects.toThrow('permission denied');

        const summary = await summarizeStagingResidue(backupRoot, {fsImpl});
        expect(summary.status).toBe('unreadable');
        expect(summary.count).toBeNull();
        expect(summary.errorCode).toBe('EACCES');

        // The sweep must reach runBackup's warning path rather than reporting a clean no-op.
        await expect(
            cleanStagingResidue(backupRoot, {log: () => {}}, {fsImpl, keepPartials: 0})
        ).rejects.toThrow('permission denied');

        // Positive control: the SAME shape with ENOENT is a genuine race and is still skipped, so
        // the assertions above are about the error CODE and not merely about stat failing at all.
        const enoent = Object.assign(new Error('gone'), {code: 'ENOENT'});
        const raced  = await summarizeStagingResidue(backupRoot, {
            fsImpl: {readdir: (...args) => fs.readdir(...args), stat: () => Promise.reject(enoent)}
        });
        expect(raced).toMatchObject({count: 0, status: 'ok'});
    });

    test('a partial whose payload cannot be sized propagates instead of reporting zero bytes (#16427)', async () => {
        const {backupRoot} = createBackupRoot({partials: 1, bytesPerPartial: 64}),
              eacces       = Object.assign(new Error('payload unreadable'), {code: 'EACCES'}),
              // The partial itself stats fine; only the recursive size walk fails — the exact shape
              // that previously produced `{status:'ok', count:1, bytes:0}`.
              fsImpl       = {
                  readdir: (target, opts) => target === backupRoot
                      ? fs.readdir(target, opts)
                      : Promise.reject(eacces),
                  stat   : (...args) => fs.stat(...args)
              };

        const summary = await summarizeStagingResidue(backupRoot, {fsImpl});

        expect(summary.status).toBe('unreadable');
        expect(summary.bytes).toBeNull();
        expect(summary.count).toBeNull();
        expect(summary.errorCode).toBe('EACCES');
    });

    test('selectStagingResidueForRemoval is pure and keeps the newest N', () => {
        const residue = [
            {name: 'c', path: '/r/c', mtimeMs: 300},
            {name: 'b', path: '/r/b', mtimeMs: 200},
            {name: 'a', path: '/r/a', mtimeMs: 100}
        ];

        expect(selectStagingResidueForRemoval(residue, {keepPartials: 1}).map(e => e.name)).toEqual(['b', 'a']);
        expect(selectStagingResidueForRemoval(residue, {keepPartials: 0}).map(e => e.name)).toEqual(['c', 'b', 'a']);
        expect(selectStagingResidueForRemoval(residue, {keepPartials: 9})).toEqual([]);

        // The exclusion is applied BEFORE the keep-count, so an in-flight entry never consumes one
        // of the forensic slots it is not competing for.
        expect(
            selectStagingResidueForRemoval(residue, {excludePath: '/r/c', keepPartials: 1}).map(e => e.name)
        ).toEqual(['a']);
    });
});
