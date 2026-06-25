import {test, expect} from '@playwright/test';
import {
    isPurgeableTestCollection,
    partitionCollections,
    listAllCollectionNames,
    cleanDaemonSqliteResidue,
    dropTestDatabase,
    decorateChromaTestCollectionRows,
    formatChromaTestCollectionDiagnosticRow,
    latestChromaTimestamp,
    readChromaTestCollectionDiagnostics,
    summarizeChromaTestCollectionDiagnostics
} from '../../../../../../ai/scripts/maintenance/purgeTestCollections.mjs';
import {
    CHROMA_PRODUCTION_DATABASE,
    CHROMA_TEST_DATABASE
} from '../../../../../../ai/services/shared/vector/chromaTestIsolation.mjs';

/**
 * Self-test for the test-collection purge: the on-demand reclaimer for leaked unit-test Chroma
 * collections + SQLite-daemon residue. Verifies the positive allowlist + protected-denylist guard
 * can never reach a production collection, the partition split, the paginated lister, and the
 * dry-run/apply behavior of the fs-residue cleaner (incl. that it never touches the real graph db).
 */
test.describe('purgeTestCollections guard', () => {
    test('purges test-memory-* / test-session-* but never a protected production collection', () => {
        expect(isPurgeableTestCollection('test-memory-1700000000000-abc')).toBe(true);
        expect(isPurgeableTestCollection('test-session-1700000000000-xyz')).toBe(true);

        for (const real of ['neo-agent-memory', 'neo-agent-sessions', 'neo-knowledge-base', 'neo-native-graph']) {
            expect(isPurgeableTestCollection(real)).toBe(false);
        }
        // Non-test, non-protected names (e.g. a KB shadow-swap collection) are also retained.
        expect(isPurgeableTestCollection('neo-knowledge-base-shadow-123')).toBe(false);
        expect(isPurgeableTestCollection('some-other-collection')).toBe(false);
    });

    test('does NOT purge a name that merely contains, but does not start with, the test prefix', () => {
        expect(isPurgeableTestCollection('neo-test-memory-1')).toBe(false);
        expect(isPurgeableTestCollection('prod-test-session')).toBe(false);
    });

    test('partitions a mixed list into purge vs keep', () => {
        const {purge, keep} = partitionCollections([
            'neo-agent-memory', 'test-memory-1-a', 'neo-knowledge-base',
            'test-session-2-b', 'neo-native-graph', 'test-memory-3-c'
        ]);

        expect(purge.sort()).toEqual(['test-memory-1-a', 'test-memory-3-c', 'test-session-2-b']);
        expect(keep.sort()).toEqual(['neo-agent-memory', 'neo-knowledge-base', 'neo-native-graph'])
    });

    test('listAllCollectionNames paginates until a short page', async () => {
        const calls = [];
        const page   = (n, count) => Array.from({length: count}, (_, i) => ({name: `c-${n}-${i}`}));
        const client = {
            listCollections: async ({limit, offset}) => {
                calls.push({limit, offset});
                if (offset === 0)     return page(0, limit); // full page → continue
                if (offset === limit) return page(1, 5);     // short page → stop
                return []
            }
        };

        const names = await listAllCollectionNames({client, limit: 1000});

        expect(names.length).toBe(1005);
        expect(calls).toEqual([{limit: 1000, offset: 0}, {limit: 1000, offset: 1000}])
    });

    test('cleanDaemonSqliteResidue dry-run lists residue without removing it', async () => {
        const removed  = [];
        const fsModule = {
            pathExists: async () => true,
            readdir   : async dir => dir.endsWith('sqlite')
                ? ['test-daemon-1.sqlite', 'memory-core-graph.sqlite', 'test-daemon-1.sqlite-wal']
                : ['wake-daemon-test-abc', 'backups', 'chroma'],
            remove    : async p => { removed.push(p) }
        };

        const wouldRemove = await cleanDaemonSqliteResidue({
            dataDir: '/fake/.neo-ai-data', apply: false, fsModule, log: () => {}
        });

        expect(wouldRemove.map(p => p.split('/').pop()).sort())
            .toEqual(['test-daemon-1.sqlite', 'test-daemon-1.sqlite-wal', 'wake-daemon-test-abc']);
        expect(removed).toEqual([])
    });

    test('cleanDaemonSqliteResidue --apply removes the residue but never the real graph db', async () => {
        const removed  = [];
        const fsModule = {
            pathExists: async () => true,
            readdir   : async dir => dir.endsWith('sqlite')
                ? ['test-daemon-1.sqlite', 'memory-core-graph.sqlite']
                : ['wake-daemon-test-abc'],
            remove    : async p => { removed.push(p) }
        };

        await cleanDaemonSqliteResidue({dataDir: '/fake/.neo-ai-data', apply: true, fsModule, log: () => {}});

        expect(removed.map(p => p.split('/').pop()).sort()).toEqual(['test-daemon-1.sqlite', 'wake-daemon-test-abc']);
        expect(removed.some(p => p.includes('memory-core-graph.sqlite'))).toBe(false)
    });

    test('dropTestDatabase dry-run does not invoke the drop seam', async () => {
        const calls  = [];
        const dropFn = async args => { calls.push(args) };

        const result = await dropTestDatabase({host: 'h', port: 1, apply: false, dropFn, log: () => {}});

        expect(calls).toEqual([]);
        expect(result).toBe(true)
    });

    test('dropTestDatabase --apply drops the isolated test database wholesale', async () => {
        const calls  = [];
        const dropFn = async args => { calls.push(args) };

        const result = await dropTestDatabase({host: 'h', port: 1, apply: true, dropFn, log: () => {}});

        expect(calls).toEqual([{host: 'h', port: 1, database: CHROMA_TEST_DATABASE}]);
        expect(result).toBe(true)
    });

    test('dropTestDatabase --apply reports false (not throw) when the test database is absent', async () => {
        const dropFn = async () => { throw new Error('database not found') };

        const result = await dropTestDatabase({host: 'h', port: 1, apply: true, dropFn, log: () => {}});

        expect(result).toBe(false)
    })
});

test.describe('purgeTestCollections catalog diagnostics (#14010)', () => {
    const rawRows = [{
        collectionId           : 'collection-prod',
        collectionName         : 'test-memory-prod',
        databaseName           : CHROMA_PRODUCTION_DATABASE,
        tenantId               : 'default_tenant',
        metadataSegmentId      : 'metadata-prod',
        vectorSegmentId        : 'vector-prod',
        metadataRows           : 2,
        vectorRows             : 2,
        queueRows              : 1,
        latestMetadataTimestamp: '2026-06-05 10:00:00',
        latestVectorTimestamp  : '2026-06-05 10:01:00',
        latestQueueTimestamp   : '2026-06-05 10:02:00'
    }, {
        collectionId           : 'collection-test',
        collectionName         : 'test-session-isolated',
        databaseName           : CHROMA_TEST_DATABASE,
        tenantId               : 'default_tenant',
        metadataSegmentId      : '',
        vectorSegmentId        : 'vector-test',
        metadataRows           : 0,
        vectorRows             : 0,
        queueRows              : 0,
        latestMetadataTimestamp: '',
        latestVectorTimestamp  : '',
        latestQueueTimestamp   : ''
    }];

    test('latestChromaTimestamp returns the newest present Chroma timestamp', () => {
        expect(latestChromaTimestamp('', '2026-06-05 10:01:00', '2026-06-05 10:02:00'))
            .toBe('2026-06-05 10:02:00');
        expect(latestChromaTimestamp('', null, undefined)).toBe('')
    });

    test('decorates catalog rows with vector segment path evidence', () => {
        const rows = decorateChromaTestCollectionRows({
            rows    : rawRows,
            dataDir : '/fake/chroma',
            fsModule: {
                pathExistsSync: path => path.endsWith('vector-prod')
            }
        });

        expect(rows[0]).toMatchObject({
            collectionName         : 'test-memory-prod',
            vectorSegmentPath      : '/fake/chroma/vector-prod',
            vectorSegmentPathExists: true,
            latestRelevantTimestamp: '2026-06-05 10:02:00'
        });
        expect(rows[1]).toMatchObject({
            collectionName         : 'test-session-isolated',
            vectorSegmentPathExists: false,
            latestRelevantTimestamp: ''
        })
    });

    test('summarizes production bleed separately from isolated test database residue', () => {
        const rows = decorateChromaTestCollectionRows({
            rows    : rawRows,
            dataDir : '/fake/chroma',
            fsModule: {
                pathExistsSync: () => false
            }
        });

        expect(summarizeChromaTestCollectionDiagnostics(rows)).toEqual({
            totalCollections             : 2,
            productionDatabaseCollections: 1,
            isolatedTestDatabaseRows     : 1,
            nonEmptyCollections          : 1,
            missingVectorSegmentPaths    : 2,
            latestRelevantTimestamp      : '2026-06-05 10:02:00'
        })
    });

    test('formats an operator-readable diagnostic row with tenant/database evidence', () => {
        const [row] = decorateChromaTestCollectionRows({
            rows    : rawRows,
            dataDir : '/fake/chroma',
            fsModule: {
                pathExistsSync: () => true
            }
        });

        expect(formatChromaTestCollectionDiagnosticRow(row))
            .toContain('tenant=default_tenant database=default_database metadataRows=2 vectorRows=2 queueRows=1')
    });

    test('readChromaTestCollectionDiagnostics opens sqlite read-only and closes the handle', () => {
        const calls = [];

        class FakeDatabase {
            constructor(sqlitePath, options) {
                calls.push({sqlitePath, options});
            }

            prepare(sql) {
                calls.push({sqlIncludesCollections: sql.includes('FROM collections c')});

                return {
                    all: () => rawRows
                }
            }

            close() {
                calls.push({closed: true})
            }
        }

        const rows = readChromaTestCollectionDiagnostics({
            sqlitePath   : '/fake/chroma/chroma.sqlite3',
            DatabaseClass: FakeDatabase,
            fsModule     : {
                pathExistsSync: () => true
            }
        });

        expect(rows).toHaveLength(2);
        expect(calls).toEqual([
            {sqlitePath: '/fake/chroma/chroma.sqlite3', options: {readonly: true, fileMustExist: true}},
            {sqlIncludesCollections: true},
            {closed: true}
        ])
    })
});
