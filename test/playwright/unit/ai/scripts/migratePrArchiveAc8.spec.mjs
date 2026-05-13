import {setup} from '../../../setup.mjs';

const appName = 'MigratePrArchiveAc8Test';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import fs             from 'fs/promises';
import matter         from 'gray-matter';
import os             from 'os';
import path           from 'path';

import {
    buildReleaseIndex,
    inferPrArchiveVersion,
    migratePrArchive,
    normalizeArchiveVersion,
    parseArgs
} from '../../../../../ai/scripts/migrate-pr-archive-ac8.mjs';

const releases = {
    '12.1.0': {
        publishedAt: '2026-03-27T19:52:55Z'
    },
    '13.0.0': {
        publishedAt: '2026-06-01T00:00:00Z'
    }
};

test.describe('ai/scripts/migrate-pr-archive-ac8', () => {
    let root;
    let legacyRoot;
    let archiveRoot;

    test.beforeEach(async () => {
        root        = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-pr-archive-ac8-'));
        legacyRoot  = path.join(root, 'resources/content/pr-archive');
        archiveRoot = path.join(root, 'resources/content/archive');
    });

    test.afterEach(async () => {
        await fs.rm(root, {recursive: true, force: true});
    });

    test('normalizes release buckets and maps explicit, milestone, mergedAt, and fallback sources', async () => {
        expect(normalizeArchiveVersion('13.0.0')).toBe('v13.0.0');
        expect(normalizeArchiveVersion('v13.0.0')).toBe('v13.0.0');

        const releaseIndex = buildReleaseIndex(releases);

        expect(inferPrArchiveVersion({archiveVersion: '11.0.0'}, releaseIndex))
            .toEqual({version: 'v11.0.0', source: 'archiveVersion'});

        expect(inferPrArchiveVersion({milestone: '12.1.0'}, releaseIndex))
            .toEqual({version: 'v12.1.0', source: 'milestone'});

        expect(inferPrArchiveVersion({state: 'MERGED', mergedAt: '2026-04-02T00:00:00Z'}, releaseIndex))
            .toEqual({version: 'v13.0.0', source: 'mergedAt'});

        expect(inferPrArchiveVersion({
            state   : 'MERGED',
            mergedAt: '2026-07-02T00:00:00Z'
        }, releaseIndex, {fallbackVersion: 'v14.0.0'})).toEqual({
            version: 'v14.0.0',
            source : 'fallbackVersion'
        });

        expect(inferPrArchiveVersion({state: 'CLOSED', mergedAt: null}, releaseIndex).anomaly)
            .toBe('closed-unmerged-pr');
    });

    test('dry-run lists planned moves, inference source, and anomalies without moving files', async () => {
        await writePr('102xx', 10287, {
            archiveVersion: 'v11.0.0',
            state         : 'MERGED',
            mergedAt      : '2026-04-24T17:34:54Z'
        });
        await writePr('103xx', 10303, {
            milestone: '12.1.0',
            state    : 'MERGED',
            mergedAt : '2026-04-24T21:16:01Z'
        });
        await writePr('106xx', 10688, {
            state   : 'MERGED',
            mergedAt: '2026-05-04T13:41:06Z'
        });
        await writePr('110xx', 11021, {
            state   : 'CLOSED',
            mergedAt: null
        });

        const report = await migratePrArchive({
            legacyRoot,
            archiveRoot,
            metadata: {releases},
            dryRun  : true
        });

        expect(report.legacyCount).toBe(4);
        expect(report.plannedCount).toBe(3);
        expect(report.movedCount).toBe(0);
        expect(report.anomalyCount).toBe(1);

        expect(report.plans.map(plan => [plan.number, plan.version, plan.inferenceSource]))
            .toEqual([
                [10287, 'v11.0.0', 'archiveVersion'],
                [10303, 'v12.1.0', 'milestone'],
                [10688, 'v13.0.0', 'mergedAt']
            ]);

        expect(report.anomalies[0]).toMatchObject({
            number: 11021,
            reason: 'closed-unmerged-pr'
        });

        await expectFileExists(path.join(legacyRoot, '102xx/pr-10287.md'));
        await expectMissing(path.join(archiveRoot, 'pulls/v11.0.0/pr-10287.md'));
    });

    test('uses the lazy archive chunking contract for version buckets', async () => {
        await writePr('110xx', 11001, {archiveVersion: 'v13.0.0', state: 'MERGED'});
        await writePr('110xx', 11002, {archiveVersion: 'v13.0.0', state: 'MERGED'});
        await writePr('110xx', 11003, {archiveVersion: 'v13.0.0', state: 'MERGED'});

        const report = await migratePrArchive({
            legacyRoot,
            archiveRoot,
            metadata             : {releases},
            dryRun               : true,
            ...runtimeOptions({
                archiveChunkThreshold: 2
            })
        });

        expect(report.plans.map(plan => plan.to.endsWith(path.join('resources/content/archive/pulls/v13.0.0/chunk-1/pr-11001.md')))).toEqual([true, false, false]);
        expect(report.plans.map(plan => plan.to.endsWith(path.join('resources/content/archive/pulls/v13.0.0/chunk-1/pr-11002.md')))).toEqual([false, true, false]);
        expect(report.plans.map(plan => plan.to.endsWith(path.join('resources/content/archive/pulls/v13.0.0/chunk-2/pr-11003.md')))).toEqual([false, false, true]);
    });

    test('parses archive chunk and version CLI options', () => {
        expect(parseArgs([
            '--apply',
            '--archive-chunk-threshold',
            '25',
            '--archive-chunk-prefix',
            'part-',
            '--version-directory-prefix',
            'release-'
        ])).toMatchObject({
            dryRun                : false,
            archiveChunkThreshold : 25,
            archiveChunkPrefix    : 'part-',
            versionDirectoryPrefix: 'release-'
        });
    });

    test('apply refuses anomalies by default', async () => {
        await writePr('110xx', 11001, {archiveVersion: 'v13.0.0', state: 'MERGED'});
        await writePr('110xx', 11021, {state: 'CLOSED', mergedAt: null});

        await expect(migratePrArchive({
            legacyRoot,
            archiveRoot,
            metadata: {releases},
            dryRun  : false
        })).rejects.toThrow(/Refusing to apply/);

        await expectFileExists(path.join(legacyRoot, '110xx/pr-11001.md'));
    });

    test('apply can move mapped files while preserving anomaly files when explicitly allowed', async () => {
        await writePr('110xx', 11001, {archiveVersion: 'v13.0.0', state: 'MERGED'});
        await writePr('110xx', 11021, {state: 'CLOSED', mergedAt: null});
        const metadataFile = await writeMetadata({releases});

        const report = await migratePrArchive({
            legacyRoot,
            archiveRoot,
            metadataFile,
            dryRun         : false,
            allowAnomalies : true,
            ...runtimeOptions()
        });

        expect(report.movedCount).toBe(1);
        expect(report.anomalyCount).toBe(1);
        expect(report.remainingLegacyCount).toBe(1);
        expect(report.targetCount).toBe(1);
        expect(report.metadataUpdatedCount).toBe(1);

        const metadata = JSON.parse(await fs.readFile(metadataFile, 'utf-8'));
        expect(metadata.pulls['11001']).toMatchObject({
            archiveVersion: 'v13.0.0',
            state         : 'MERGED'
        });
        expect(metadata.pulls['11001'].path.endsWith(path.join('resources/content/archive/pulls/v13.0.0/pr-11001.md'))).toBe(true);

        await expectFileExists(path.join(archiveRoot, 'pulls/v13.0.0/pr-11001.md'));
        await expectMissing(path.join(legacyRoot, '110xx/pr-11001.md'));
        await expectFileExists(path.join(legacyRoot, '110xx/pr-11021.md'));
    });

    async function writePr(chunk, number, data) {
        const dir = path.join(legacyRoot, chunk);
        await fs.mkdir(dir, {recursive: true});

        const body = matter.stringify(`# PR ${number}\n`, {
            number,
            title    : `PR ${number}`,
            author   : 'neo-test',
            state    : 'MERGED',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
            closedAt : data.closedAt ?? data.mergedAt ?? null,
            mergedAt : data.mergedAt ?? null,
            head     : 'test',
            base     : 'dev',
            url      : `https://github.com/neomjs/neo/pull/${number}`,
            ...data
        });

        await fs.writeFile(path.join(dir, `pr-${number}.md`), body, 'utf-8');
    }

    async function writeMetadata(metadata) {
        const metadataFile = path.join(root, 'resources/content/.sync-metadata.json');
        await fs.mkdir(path.dirname(metadataFile), {recursive: true});
        await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2), 'utf-8');
        return metadataFile
    }
});

function runtimeOptions(overrides = {}) {
    return {
        archiveChunkThreshold : 100,
        archiveChunkPrefix    : 'chunk-',
        versionDirectoryPrefix: 'v',
        ...overrides
    }
}

async function expectFileExists(filePath) {
    await expect(fs.access(filePath).then(() => true).catch(() => false)).resolves.toBe(true);
}

async function expectMissing(filePath) {
    await expect(fs.access(filePath).then(() => true).catch(() => false)).resolves.toBe(false);
}
