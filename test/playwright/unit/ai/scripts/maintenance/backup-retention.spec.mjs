import {setup} from '../../../../setup.mjs';

const appName = 'BackupRetentionTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import fs             from 'fs-extra';
import path           from 'path';

/**
 * Verifies the configurable bundle retention policy in
 * `ai/scripts/maintenance/backup.mjs#cleanOldBackups`. Two-axis policy:
 *   - `keepMinimum` — newest N bundles retained unconditionally
 *   - `maxDays`     — bundles older than N days are eligible for deletion
 *
 * Default values (`K=3, N_DAYS=30`) are now owned by the top-level
 * `aiConfig.maintenance.backup.retention` subtree and match the previous
 * hardcoded constants.
 */
// Serial mode: this spec exercises a shared `cleanOldBackups` import + tmp filesystem
// state. Running serially within the file avoids cross-test parallel-worker contention
// for the imported module symbol and produces deterministic backup-directory mtime
// ordering. CI uses workers=1 in playwright.config.unit.mjs; this is a local-DX safeguard.
test.describe.configure({mode: 'serial'});

test.describe('cleanOldBackups — configurable retention', () => {
    let cleanOldBackups;
    let loadTopLevelAiConfig;
    let resolveBackupRetention;
    let tmpRoot;
    let mtimeNudge = 0;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/scripts/maintenance/backup.mjs');
        cleanOldBackups        = mod.cleanOldBackups;
        loadTopLevelAiConfig   = mod.loadTopLevelAiConfig;
        resolveBackupRetention = mod.resolveBackupRetention;
    });

    test.beforeEach(async () => {
        // Per-test fresh tmp root + unique offset to avoid cross-test interference
        // when Playwright runs the file in parallel workers.
        tmpRoot = path.resolve(process.cwd(), 'tmp', `backup-retention-${process.pid}-${Date.now()}-${++mtimeNudge}`);
        await fs.ensureDir(tmpRoot);
    });

    test.afterEach(async () => {
        if (tmpRoot && await fs.pathExists(tmpRoot)) {
            await fs.remove(tmpRoot);
        }
    });

    /**
     * Synthetic backup-* directory creator. Encodes the simulated age in the directory
     * timestamp so `cleanOldBackups`'s production regex parser recognizes it. The actual
     * timestamp values are millisecond-unique (ageInDays accepts fractional days), which
     * keeps directory names distinct under rapid-fire seeding.
     */
    async function seedBackup(ageInDays, {restorable = true, meta = true, substrates = ['kb'], statuses = {}} = {}) {
        const ts      = new Date(Date.now() - ageInDays * 86400000);
        const isoTs   = ts.toISOString().replace(/:/g, '-');
        const dirName = `backup-${isoTs}`;
        const dirPath = path.join(tmpRoot, dirName);
        await fs.ensureDir(dirPath);
        await fs.writeFile(path.join(dirPath, 'placeholder'), 'test-marker');

        // A published bundle carries a meta receipt and non-empty substrate payloads. The fixture
        // defaults to that shape because retention now reads recoverability, and a payload-less
        // directory models the empty bundle rather than the normal one — which is exactly the
        // conflation the policy change removes. `restorable: false` opts into the empty shape.
        if (meta) {
            // The fixture must satisfy the REAL receipt contract, not merely be an object: a completed
            // capture carries `completedAt` plus an `integrity` array. A `{timestamp}`-only stub used
            // to pass, which is exactly the object-shaped-but-invalid receipt that certified a bundle.
            await fs.writeJson(path.join(dirPath, 'bundle-meta.json'), {
                timestamp  : isoTs,
                completedAt: ts.toISOString(),
                // `statuses` overrides one substrate's verdict so a fixture can carry a legitimate
                // MIXED or UNVERIFIED receipt — the shapes the producer really emits.
                integrity  : substrates.map(substrate => ({
                    subsystem  : substrate,
                    status     : statuses[substrate] ?? 'pass',
                    sourceCount: restorable ? 1 : 0
                }))
            });
        }

        for (const substrate of substrates) {
            const dir = path.join(dirPath, substrate);
            await fs.ensureDir(dir);
            // An empty DIRECTORY, not an absent one: six real bundles had `kb/` present and empty,
            // and that is the shape the guard has to classify.
            if (restorable) {
                await fs.writeFile(path.join(dir, `${substrate}-backup-${isoTs}.jsonl`), '{"id":"row-1"}\n');
            }
        }

        return dirName;
    }

    async function listBackups() {
        const entries = await fs.readdir(tmpRoot);
        return entries.filter(name => name.startsWith('backup-'));
    }

    test('default config (K=3, N=30 days) matches previous hardcoded behavior — byte-equivalence anchor', async () => {
        // Seed 5 bundles spanning the retention thresholds:
        //   1d, 10d, 25d, 40d, 60d old
        // Previous hardcoded expected outcome: newest 3 (1d, 10d, 25d) retained unconditionally;
        // 40d + 60d eligible for deletion (both > 30 days AND outside newest-3 window).
        await seedBackup(1);
        await seedBackup(10);
        await seedBackup(25);
        await seedBackup(40);
        await seedBackup(60);

        await cleanOldBackups(tmpRoot, {log: () => {}});

        const remaining = await listBackups();
        expect(remaining).toHaveLength(3);
        // Survivor set = newest 3
        for (const name of remaining) {
            const match   = name.match(/^backup-(.+?)(-suffix.*)?$/);
            const isoTime = match[1].replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3');
            const ageDays = (Date.now() - new Date(isoTime).getTime()) / 86400000;
            expect(ageDays).toBeLessThan(30);
        }
    });

    test('explicit default config object {keepMinimum: 3, maxDays: 30} matches no-argument behavior', async () => {
        await seedBackup(1);
        await seedBackup(10);
        await seedBackup(40);

        await cleanOldBackups(tmpRoot, {log: () => {}}, {keepMinimum: 3, maxDays: 30});

        const remaining = await listBackups();
        // 3 backups, newest-3 floor protects all of them (40d would normally be eligible
        // but keepMinimum=3 holds it).
        expect(remaining).toHaveLength(3);
    });

    test('tighter config (K=1, N=7) deletes more aggressively', async () => {
        // 5 bundles: 1d, 3d, 10d, 30d, 60d
        // K=1 → newest 1 retained unconditionally (1d survives)
        // N=7 → bundles >7d eligible for deletion (10d, 30d, 60d eligible)
        // Final survivor set: 1d + 3d (3d retained because <7d, even though outside newest-1)
        await seedBackup(1);
        await seedBackup(3);
        await seedBackup(10);
        await seedBackup(30);
        await seedBackup(60);

        await cleanOldBackups(tmpRoot, {log: () => {}}, {keepMinimum: 1, maxDays: 7});

        const remaining = await listBackups();
        expect(remaining).toHaveLength(2);
        for (const name of remaining) {
            const match   = name.match(/^backup-(.+)$/);
            const isoTime = match[1].replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3');
            const ageDays = (Date.now() - new Date(isoTime).getTime()) / 86400000;
            expect(ageDays).toBeLessThan(7.1);  // 7 + tiny epsilon for rounding
        }
    });

    test('higher-cadence config (K=24, N=2) preserves rolling 24-hour history regardless of age threshold', async () => {
        // Seed 30 bundles with sub-day-unique offsets — each call gets a distinct timestamp.
        // Ages span 0.5d to 15d (positions 0-29 at ages 0.5, 1.0, 1.5, ..., 15.0d).
        // K=24 → newest 24 retained unconditionally (ages 0.5d-12.0d).
        // N=2 → bundles >2d eligible for deletion, but K=24 wins for the newest 24.
        // Of the remaining 6 (positions 24-29, ages 12.5-15d), all >2d, all deleted.
        // Expected final survivor count = 24.
        for (let i = 0; i < 30; i++) {
            await seedBackup(0.5 + i * 0.5);
        }

        await cleanOldBackups(tmpRoot, {log: () => {}}, {keepMinimum: 24, maxDays: 2});

        const remaining = await listBackups();
        expect(remaining).toHaveLength(24);
    });

    test('missing cleanOldBackups retention argument uses function defaults', async () => {
        await seedBackup(1);
        await seedBackup(40);
        await seedBackup(60);

        await cleanOldBackups(tmpRoot, {log: () => {}}, undefined);

        const remaining = await listBackups();
        // Function-level K=3 default — all 3 backups retained unconditionally despite
        // 40d + 60d being >30d.
        expect(remaining).toHaveLength(3);
    });

    test('empty cleanOldBackups retention object uses property defaults', async () => {
        await seedBackup(1);
        await seedBackup(40);
        await seedBackup(60);
        await seedBackup(90);

        await cleanOldBackups(tmpRoot, {log: () => {}}, {});

        const remaining = await listBackups();
        // K=3 default — newest 3 retained (1d, 40d, 60d); 90d eligible for deletion (outside K=3, >N=30d)
        expect(remaining).toHaveLength(3);
    });

    test('keepMinimum floor protects even ancient bundles when bundle count is low', async () => {
        // Single ancient bundle — keepMinimum=3 should retain it unconditionally
        await seedBackup(365);

        await cleanOldBackups(tmpRoot, {log: () => {}}, {keepMinimum: 3, maxDays: 30});

        const remaining = await listBackups();
        expect(remaining).toHaveLength(1);
    });

    test('the floor counts RESTORABLE bundles — three empty ones do not displace the only real one', async () => {
        // The live defect, reduced. Measured 2026-08-07: six of ten kept bundles held zero KB rows,
        // each with a valid bundle-meta.json, so the three newest — the entire "kept minimum" —
        // could restore nothing, and the one 59,754-row bundle survived on age alone.
        const populated = await seedBackup(40);                          // old but RESTORABLE
        await seedBackup(1, {restorable: false});
        await seedBackup(2, {restorable: false});
        await seedBackup(3, {restorable: false});

        await cleanOldBackups(tmpRoot, {log: () => {}}, {keepMinimum: 3, maxDays: 30});

        const remaining = await listBackups();

        // Under a directory-counting floor the three empty bundles fill it and the 40d populated one
        // is age-eligible — the exact displacement the operator called "REPLACED right away".
        expect(remaining, 'the only restorable bundle must survive').toContain(populated);
    });

    test('the floor is PER SUBSTRATE — bundles restorable for mc only cannot fill kb\'s slots', async () => {
        // My first implementation failed exactly here, and a dry-run against the live set caught it.
        // An any-substrate floor read the three newest as `[kb,mc]`, `[mc]`, `[mc]`, called itself
        // satisfied while holding ONE kb-bearing bundle, and left the only full corpus on age alone.
        //
        // TWO kb bundles is what makes this discriminate, and the first version of this test had one.
        // With a single kb bundle the newest-per-substrate rule rescues it under BOTH floor designs,
        // so the assertion passed against the implementation it was written to reject — proven by
        // mutation. `recentKb` absorbs that rule; `oldKb` can only be saved by the per-substrate floor.
        const recentKb = await seedBackup(1,  {substrates: ['kb', 'mc']});
        const oldKb    = await seedBackup(40, {substrates: ['kb', 'mc']});
        await seedBackup(2, {substrates: ['mc']});
        await seedBackup(3, {substrates: ['mc']});
        await seedBackup(4, {substrates: ['mc']});

        await cleanOldBackups(tmpRoot, {log: () => {}}, {keepMinimum: 3, maxDays: 30});

        const remaining = await listBackups();

        // Fixture guard: an any-substrate floor of 3 is entirely consumed by the mc-only bundles plus
        // `recentKb`, so `oldKb` sits outside it and is past maxDays. If this pair were not both
        // present the assertion below would be satisfied by the design it exists to reject.
        expect(remaining, 'the newest kb bundle is the control, held by the per-substrate rule').toContain(recentKb);
        expect(remaining, 'kb needs its OWN slots; mc-only bundles must not consume them').toContain(oldKb);
    });

    test('the newest restorable bundle per substrate outlives maxDays', async () => {
        // Age is the wrong axis for a last-known-good artifact: a 40-day-old full corpus beats a
        // one-day-old empty one. Nothing else here is restorable, so if this bundle goes, the
        // substrate has no recovery source at all.
        const ancientButReal = await seedBackup(400);
        await seedBackup(1, {restorable: false});

        await cleanOldBackups(tmpRoot, {log: () => {}}, {keepMinimum: 1, maxDays: 30});

        expect(await listBackups(), 'the last artifact that can restore kb must not age out').toContain(ancientButReal);
    });

    test('a MALFORMED bundle-meta cannot fill the floor — his probe deleted an older VALID bundle', async () => {
        // @neo-gpt's exact probe, reproduced: newer malformed-meta + older valid, K=1, maxDays=30.
        // `pathExists` alone answered "is there a file", so a corrupt receipt passed as a valid one,
        // filled the floor, displaced the older valid bundle — and that bundle was DELETED. Data loss
        // caused by the guard written to prevent data loss.
        const newerMalformed = await seedBackup(1);
        const olderValid     = await seedBackup(40);

        await fs.writeFile(path.join(tmpRoot, newerMalformed, 'bundle-meta.json'), '{ this is not json');

        await cleanOldBackups(tmpRoot, {log: () => {}, warn: () => {}}, {keepMinimum: 1, maxDays: 30});

        const remaining = await listBackups();

        expect(remaining, 'the older VALID bundle must survive a newer corrupt one').toContain(olderValid);
        // And malformed is a HARD KEEP, not merely floor-ineligible: unknown state cannot be certified
        // as a recovery source OR as disposable. Deliberately asymmetric with an ABSENT receipt, which
        // stays age-deletable because absent is a known-incomplete capture.
        expect(remaining, 'unknown state must not be destroyed on an age clock either').toContain(newerMalformed);
    });

    test('a per-substrate FAIL cannot certify that substrate — bytes are non-empty, pass is parity', async () => {
        // @neo-gpt's cycle-4 destructive probe. A newer bundle recording `kb: fail` with NON-ZERO
        // bytes was certified `restorableFor: [kb, mc]` on bytes alone, filled K=1, and deleted the
        // older `kb: pass` bundle — a partial capture outranking a complete one.
        //
        // Bytes establish non-empty; `pass` establishes parity. Neither is sufficient alone.
        const {classifyBundleRecoverability} = await import('../../../../../../ai/scripts/maintenance/backup.mjs');

        const newerPartial = await seedBackup(1,  {substrates: ['kb', 'mc']});
        const olderPass    = await seedBackup(40, {substrates: ['kb', 'mc']});

        // Rewrite the newer receipt so kb FAILS parity while its payload stays non-empty.
        await fs.writeJson(path.join(tmpRoot, newerPartial, 'bundle-meta.json'), {
            timestamp  : 'x',
            completedAt: new Date().toISOString(),
            integrity  : [
                {subsystem: 'kb', status: 'fail', sourceCount: 2, bundleCount: 1},
                {subsystem: 'mc', status: 'pass', sourceCount: 1, bundleCount: 1}
            ]
        });

        const verdict = await classifyBundleRecoverability(path.join(tmpRoot, newerPartial));

        // A mixed receipt is legitimate and still certifies what DID pass — collapsing it to a
        // whole-bundle verdict would either discard a usable MC source or certify an unusable KB one.
        expect(verdict.metaState, 'a partial receipt is still a valid receipt').toBe('valid');
        expect(verdict.restorableFor, 'kb failed parity and must not be certified').not.toContain('kb');
        expect(verdict.restorableFor, 'mc passed and is certified independently').toContain('mc');
        expect(verdict.substrates.kb, 'the bytes are genuinely non-zero — that is the point').toBeGreaterThan(0);

        await cleanOldBackups(tmpRoot, {log: () => {}, warn: () => {}}, {keepMinimum: 1, maxDays: 30});

        expect(
            await listBackups(),
            'the older kb:pass bundle must outrank a newer kb:fail one'
        ).toContain(olderPass);
    });

    test('an UNRECOGNIZED status hard-keeps the bundle — not-certifiable is not the same as deletable', async () => {
        // @neo-gpt's cycle-5 destructive probe, and the fifth reproduction of one mechanism. The
        // cycle-4 repair certified only on `pass`, which is right — but it left deletion as the
        // NEGATION of certification. For `fail` that negation is correct. For a status this reader
        // cannot interpret it is data loss: an aged bundle holding real bytes, whose receipt is
        // perfectly valid, deleted beside a fresh one because nobody could say what it contained.
        const olderUnknown = await seedBackup(40, {substrates: ['kb'], statuses: {kb: 'future-v2'}});
        const newerPass    = await seedBackup(1,  {substrates: ['kb']});

        const {classifyBundleRecoverability} = await import('../../../../../../ai/scripts/maintenance/backup.mjs');
        const verdict                        = await classifyBundleRecoverability(path.join(tmpRoot, olderUnknown));

        expect(verdict.metaState, 'the receipt is well-formed — that is what makes this dangerous').toBe('valid');
        expect(verdict.restorableFor, 'an uninterpretable status cannot certify anything').not.toContain('kb');
        expect(verdict.unevaluated, 'but it MUST be recorded as unevaluated, which is what saves it').toContain('kb');
        expect(verdict.substrates.kb, 'the payload is real; only the verdict is unknown').toBeGreaterThan(0);

        await cleanOldBackups(tmpRoot, {log: () => {}, warn: () => {}}, {keepMinimum: 1, maxDays: 30});

        const remaining = await listBackups();

        expect(remaining, 'a bundle nobody verified must not be destroyed on an age clock').toContain(olderUnknown);
        expect(remaining, 'and the pass bundle is of course kept').toContain(newerPass);
    });

    test('a SKIPPED status hard-keeps too — the producer already emits it, so this is reachable today', async () => {
        // `skipped` is not a hypothetical future value. `verifyBundleIntegrity` emits it whenever the
        // SDK returns a non-numeric source count, so parity was never established in either
        // direction. It was inside the deletable set until this fix.
        const {INTEGRITY_STATUS} = await import('../../../../../../ai/scripts/maintenance/backup.mjs');
        const olderSkipped       = await seedBackup(40, {substrates: ['kb'], statuses: {kb: INTEGRITY_STATUS.skipped}});

        await seedBackup(1, {substrates: ['kb']});
        await cleanOldBackups(tmpRoot, {log: () => {}, warn: () => {}}, {keepMinimum: 1, maxDays: 30});

        expect(await listBackups(), 'an unverified capture is not a disposable one').toContain(olderSkipped);
    });

    test('DESTRUCTIVE CONTROL: an EMPTY status is evaluated, so it stays reclaimable', async () => {
        // The control that stops the fix above from degenerating into keep-everything. `empty` and
        // `fail` are evaluated verdicts — the verifier looked and reported nothing to restore — so
        // they must remain deletable. Without this test, hard-keeping every non-`pass` status would
        // pass every assertion above while quietly disabling retention altogether.
        const {INTEGRITY_STATUS} = await import('../../../../../../ai/scripts/maintenance/backup.mjs');
        const olderEmpty         = await seedBackup(40, {substrates: ['kb'], statuses: {kb: INTEGRITY_STATUS.empty}});

        await seedBackup(1, {substrates: ['kb']});
        await cleanOldBackups(tmpRoot, {log: () => {}, warn: () => {}}, {keepMinimum: 1, maxDays: 30});

        expect(
            await listBackups(),
            'an EVALUATED "nothing to restore" verdict is still reclaimable — retention must keep working'
        ).not.toContain(olderEmpty);
    });

    test('the status partition is derived from the frozen producer enum, not a literal', async () => {
        const {INTEGRITY_STATUS, INTEGRITY_STATUS_DISPOSITION, classifyIntegrityStatus} =
            await import('../../../../../../ai/scripts/maintenance/backup.mjs');

        // Every value the producer can emit must have an explicit disposition. A new status added to
        // the enum without a decision here fails THIS test rather than silently becoming deletable.
        for (const status of Object.values(INTEGRITY_STATUS)) {
            expect(
                ['certifying', 'evaluatedUnusable', 'indeterminate'],
                `${status} must carry an explicit retention disposition`
            ).toContain(classifyIntegrityStatus(status));
        }

        expect(classifyIntegrityStatus(INTEGRITY_STATUS.pass)).toBe('certifying');
        expect(classifyIntegrityStatus(INTEGRITY_STATUS.fail)).toBe('evaluatedUnusable');
        expect(classifyIntegrityStatus(INTEGRITY_STATUS.empty)).toBe('evaluatedUnusable');
        expect(classifyIntegrityStatus(INTEGRITY_STATUS.skipped)).toBe('indeterminate');
        // Absent carries no parity claim in either direction — the case that must not authorize deletion.
        expect(classifyIntegrityStatus(undefined)).toBe('indeterminate');
        expect(Object.isFrozen(INTEGRITY_STATUS_DISPOSITION.certifying)).toBe(true);
    });

    test('an OBJECT-SHAPED invalid receipt cannot certify a bundle either — shape is not validity', async () => {
        // @neo-gpt's cycle-3 probe. My first fix required only `typeof parsed === 'object'`, so `{}`
        // and `{garbage: 1}` still certified a bundle, filled the floor, and deleted the older valid
        // one. Same defect as trusting `pathExists`, one level in: I checked that something was THERE
        // rather than that it was a RECEIPT.
        const {classifyBundleRecoverability} = await import('../../../../../../ai/scripts/maintenance/backup.mjs');

        for (const [label, body] of [
            ['empty object',        {}],
            ['unrelated keys',      {garbage: 1}],
            ['timestamp only',      {timestamp: 'x'}],
            ['completedAt only',    {completedAt: '2026-08-07T00:00:00.000Z'}],
            ['integrity only',      {integrity: []}],
            ['integrity not array', {completedAt: '2026-08-07T00:00:00.000Z', integrity: {}}],
            ['array at the root',   [{completedAt: 'x', integrity: []}]]
        ]) {
            const name = await seedBackup(1);
            await fs.writeJson(path.join(tmpRoot, name, 'bundle-meta.json'), body);

            const verdict = await classifyBundleRecoverability(path.join(tmpRoot, name));

            expect(verdict.metaState, `${label} must not read as a valid receipt`).toBe('malformed');
            expect(verdict.hasMeta, `${label} must not satisfy hasMeta`).toBe(false);
        }
    });

    test('an object-shaped invalid receipt does not delete the older valid bundle', async () => {
        const newerInvalid = await seedBackup(1);
        const olderValid   = await seedBackup(40);

        await fs.writeJson(path.join(tmpRoot, newerInvalid, 'bundle-meta.json'), {garbage: 1});

        await cleanOldBackups(tmpRoot, {log: () => {}, warn: () => {}}, {keepMinimum: 1, maxDays: 30});

        const remaining = await listBackups();

        expect(remaining, 'the older VALID bundle must survive an object-shaped invalid receipt').toContain(olderValid);
        expect(remaining, 'unknown state is still a hard keep').toContain(newerInvalid);
    });

    test('a JSON scalar is not a receipt — "null" parses cleanly and must not certify a bundle', async () => {
        const {classifyBundleRecoverability} = await import('../../../../../../ai/scripts/maintenance/backup.mjs');

        const scalarMeta = await seedBackup(1);
        await fs.writeFile(path.join(tmpRoot, scalarMeta, 'bundle-meta.json'), 'null');

        const verdict = await classifyBundleRecoverability(path.join(tmpRoot, scalarMeta));

        // A try/catch around `readJson` alone would call this valid: `null` parses without throwing,
        // so the bundle would be certified on the strength of four characters.
        expect(verdict.metaState).toBe('malformed');
        expect(verdict.hasMeta, 'a scalar must not satisfy hasMeta').toBe(false);
    });

    test('an UNREADABLE payload is a hard keep — unknown recoverability is not empty', async () => {
        // The classifier's zero-bytes fallback once carried a comment claiming "under-counting keeps a
        // bundle, which is the safe error" — the opposite of what the code did. Under-counting made the
        // bundle non-restorable, which excluded it from the floor, which made it age-DELETABLE. The
        // guard would have destroyed exactly the bundle whose contents it could not verify.
        const {classifyBundleRecoverability} = await import('../../../../../../ai/scripts/maintenance/backup.mjs');

        const unreadable = await seedBackup(400);
        await seedBackup(1);
        await seedBackup(2);
        await seedBackup(3);

        // Make the payload genuinely unreadable rather than mocking the failure: chmod the substrate
        // directory so `readdir` throws. A stubbed error would test the branch; this tests the path.
        const kbDir = path.join(tmpRoot, unreadable, 'kb');
        await fs.chmod(kbDir, 0o000);

        try {
            const verdict = await classifyBundleRecoverability(path.join(tmpRoot, unreadable));

            // Skip on any environment where the chmod does not actually deny us (e.g. running as
            // root). Asserting into a non-hazard is how a guard becomes vacuous.
            test.skip(verdict.unreadable.length === 0, 'chmod did not deny access in this environment');

            expect(verdict.unreadable, 'the failure must be REPORTED, not silently read as empty').toContain('kb');

            await cleanOldBackups(tmpRoot, {log: () => {}, warn: () => {}}, {keepMinimum: 3, maxDays: 30});

            expect(
                await listBackups(),
                'a bundle whose payload could not be read must never be deleted'
            ).toContain(unreadable);
        } finally {
            await fs.chmod(kbDir, 0o755);
        }
    });

    test('the sweep logs every keep with its REASON, including age-held ones', async () => {
        // The AC is that the sweep says what it keeps and drops. A silent `continue` on the age branch
        // left the largest keep category invisible, so an auditor could not distinguish an age-held
        // bundle from one the sweep never saw — which is how six empty bundles accumulated unnoticed.
        const lines = [];

        // `keepMinimum: 1` is what makes this discriminate. My first fixture used `keepMinimum: 3`
        // with two bundles, so BOTH landed in the floor and the age branch never executed — the test
        // would have passed against a build with no age logging at all. With a floor of one, the
        // second bundle is outside it, younger than `maxDays`, and therefore genuinely age-held.
        await seedBackup(1);    // floor-held + newest-restorable
        await seedBackup(2);    // outside the floor, under maxDays → AGE-held

        await cleanOldBackups(tmpRoot, {log: line => lines.push(line), warn: line => lines.push(line)}, {keepMinimum: 1, maxDays: 30});

        const joined = lines.join('\n');

        expect(joined, 'age-held keeps must be logged').toMatch(/younger than 30d/);
        expect(joined, 'floor-held keeps must be logged').toMatch(/restorable floor/);
        // Per-substrate bytes on every line, so the log is auditable after the fact rather than
        // requiring someone to have been watching.
        expect(joined).toMatch(/kb=\d+B/);
        expect(lines.length, 'every bundle gets a line').toBeGreaterThanOrEqual(2);
    });

    test('a bundle with no meta receipt cannot fill the floor, but stays age-deletable', async () => {
        // A real bundle in this shape existed: 2,001 rows, no bundle-meta.json, sitting in the
        // retention set as a peer of complete captures. It must not count toward the recovery floor —
        // and it must still be reclaimable, or residue accumulates forever and one unbounded-growth
        // bug is traded for another.
        const metaless  = await seedBackup(40, {meta: false});
        const populated = await seedBackup(50);

        await cleanOldBackups(tmpRoot, {log: () => {}}, {keepMinimum: 1, maxDays: 30});

        const remaining = await listBackups();

        expect(remaining, 'the meta-bearing restorable bundle holds the floor').toContain(populated);
        expect(remaining, 'a partial capture is not a recovery source and is reclaimable').not.toContain(metaless);
    });

    test('CONTROL — with every bundle restorable, retention prunes exactly as before', async () => {
        // The negative control, and the reason it matters: every assertion above is satisfied by a
        // "never delete anything" implementation. This is what proves the change is a re-ranking
        // rather than a disabling.
        await seedBackup(1);
        await seedBackup(10);
        await seedBackup(25);
        await seedBackup(40);
        await seedBackup(60);

        await cleanOldBackups(tmpRoot, {log: () => {}}, {keepMinimum: 3, maxDays: 30});

        // Same outcome as the byte-equivalence anchor above: newest 3 held by the floor, the two
        // beyond it are under nothing that protects them.
        expect(await listBackups()).toHaveLength(3);
    });

    test('classifyBundleRecoverability reports per-substrate payload, and an empty dir is not absent', async () => {
        const {classifyBundleRecoverability, RECOVERY_SUBSTRATES} =
            await import('../../../../../../ai/scripts/maintenance/backup.mjs');

        const realName  = await seedBackup(1, {substrates: ['kb', 'mc']}),
              emptyName = await seedBackup(2, {restorable: false});

        const real  = await classifyBundleRecoverability(path.join(tmpRoot, realName)),
              empty = await classifyBundleRecoverability(path.join(tmpRoot, emptyName));

        expect(real.hasMeta).toBe(true);
        expect(real.restorableFor.sort()).toEqual(['kb', 'mc']);
        expect(real.substrates.kb).toBeGreaterThan(0);
        expect(real.substrates.graph, 'an absent substrate reads as zero, not undefined').toBe(0);

        // The load-bearing distinction: `kb/` EXISTS and is empty. A presence check would call this
        // bundle restorable, which is how six of them passed as valid recovery sources.
        expect(empty.hasMeta).toBe(true);
        expect(empty.restorableFor, 'a present-but-empty payload is not a recovery source').toEqual([]);

        expect(RECOVERY_SUBSTRATES, 'optional substrates must not gate recoverability').not.toContain('ledgers');
    });

    test('keepMinimum=0 + maxDays=0 deletes everything older than now', async () => {
        await seedBackup(0.001);  // ~86s old
        await seedBackup(1);
        await seedBackup(7);

        await cleanOldBackups(tmpRoot, {log: () => {}}, {keepMinimum: 0, maxDays: 0});

        const remaining = await listBackups();
        // K=0 → no unconditional retention; N=0 → anything older than 0 days (any age) eligible
        expect(remaining).toHaveLength(0);
    });

    test('resolves backup retention from top-level maintenance config', () => {
        expect(resolveBackupRetention({
            aiConfig: {
                maintenance: {
                    backup: {
                        retention: {
                            keepMinimum: 7,
                            maxDays    : 14
                        }
                    }
                }
            }
        })).toEqual({
            keepMinimum: 7,
            maxDays    : 14
        });
    });

    test('fails loud when top-level maintenance subtree is absent', () => {
        expect(() => resolveBackupRetention({
            aiConfig: {}
        })).toThrow('backup');
    });

    test('loads gitignored top-level AI config only when present', async () => {
        const loadedPaths = [];
        const aiConfig    = {
            async load(configPath) {
                loadedPaths.push(configPath);
            }
        };
        const fsModule = {
            async pathExists(configPath) {
                return configPath.endsWith('/present-config.mjs');
            }
        };

        await expect(loadTopLevelAiConfig({
            configPath: '/tmp/missing-config.mjs',
            aiConfig,
            fsModule
        })).resolves.toEqual({
            loaded    : false,
            configPath: '/tmp/missing-config.mjs'
        });

        await expect(loadTopLevelAiConfig({
            configPath: '/tmp/present-config.mjs',
            aiConfig,
            fsModule
        })).resolves.toEqual({
            loaded    : true,
            configPath: '/tmp/present-config.mjs'
        });

        expect(loadedPaths).toEqual(['/tmp/present-config.mjs']);
    });
});

test.describe('defragChromaDB cleanOldBackups — configurable snapshot retention', () => {
    let cleanOldDefragBackups;
    let resolveDefragSnapshotRetention;
    let tmpRoot;
    let timestampNudge = 0;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/scripts/maintenance/defragChromaDB.mjs');
        cleanOldDefragBackups        = mod.cleanOldBackups;
        resolveDefragSnapshotRetention = mod.resolveDefragSnapshotRetention;
    });

    test.beforeEach(async () => {
        tmpRoot = path.resolve(process.cwd(), 'tmp', `defrag-retention-${process.pid}-${Date.now()}-${++timestampNudge}`);
        await fs.ensureDir(tmpRoot);
    });

    test.afterEach(async () => {
        if (tmpRoot && await fs.pathExists(tmpRoot)) {
            await fs.remove(tmpRoot);
        }
    });

    async function seedDefragBackup(ageInDays) {
        const timestamp = Math.floor(Date.now() - ageInDays * 86400000 - ++timestampNudge);
        const dirName   = `backup-${timestamp}`;
        const dirPath   = path.join(tmpRoot, dirName);

        await fs.ensureDir(dirPath);
        await fs.writeFile(path.join(dirPath, 'placeholder'), 'test-marker');

        return dirName;
    }

    async function listDefragBackups() {
        const entries = await fs.readdir(tmpRoot);
        return entries.filter(name => name.startsWith('backup-'));
    }

    test('default snapshot config (K=3, N=7 days) matches previous hardcoded behavior', async () => {
        await seedDefragBackup(1);
        await seedDefragBackup(3);
        await seedDefragBackup(5);
        await seedDefragBackup(10);
        await seedDefragBackup(20);

        await cleanOldDefragBackups(tmpRoot, undefined);

        const remaining = await listDefragBackups();
        expect(remaining).toHaveLength(3);
    });

    test('tighter snapshot config deletes old extras outside the keepMinimum floor', async () => {
        await seedDefragBackup(1);
        await seedDefragBackup(3);
        await seedDefragBackup(10);
        await seedDefragBackup(20);

        await cleanOldDefragBackups(tmpRoot, {keepMinimum: 1, maxDays: 7});

        const remaining = await listDefragBackups();
        expect(remaining).toHaveLength(2);
    });

    test('resolves defrag snapshot retention from top-level maintenance config', () => {
        expect(resolveDefragSnapshotRetention({
            aiConfig: {
                maintenance: {
                    defrag: {
                        snapshotRetention: {
                            keepMinimum: 2,
                            maxDays    : 5
                        }
                    }
                }
            }
        })).toEqual({
            keepMinimum: 2,
            maxDays    : 5
        });
    });
});
