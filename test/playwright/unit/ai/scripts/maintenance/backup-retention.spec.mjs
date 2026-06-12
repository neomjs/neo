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
    async function seedBackup(ageInDays) {
        const ts      = new Date(Date.now() - ageInDays * 86400000);
        const isoTs   = ts.toISOString().replace(/:/g, '-');
        const dirName = `backup-${isoTs}`;
        const dirPath = path.join(tmpRoot, dirName);
        await fs.ensureDir(dirPath);
        await fs.writeFile(path.join(dirPath, 'placeholder'), 'test-marker');
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
            const match = name.match(/^backup-(.+?)(-suffix.*)?$/);
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
            const match = name.match(/^backup-(.+)$/);
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
        const aiConfig = {
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
