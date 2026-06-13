import {setup} from '../../../../setup.mjs';

const appName = 'ExportMemoryQuarantineTest';

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
import InstanceManager from '../../../../../../src/manager/Instance.mjs';
import Database       from 'better-sqlite3';
import fsExtra        from 'fs-extra';
import os             from 'os';
import path           from 'path';

test.describe.configure({mode: 'serial'});

test.describe('exportMemoryQuarantine.mjs (#13093)', () => {
    let mod, workRoot;

    test.beforeAll(async () => {
        mod      = await import('../../../../../../ai/scripts/maintenance/exportMemoryQuarantine.mjs');
        workRoot = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'export-memory-quarantine-'));
    });

    test.afterAll(async () => {
        if (workRoot) await fsExtra.remove(workRoot);
    });

    test('parseArgs accepts inline ids, ids-file, graph path, and page size', () => {
        const args = mod.parseArgs([
            '--ids', 'mem-a,mem-b',
            '--ids-file', '/tmp/ids.json',
            '--output-dir', '/tmp/out',
            '--graph-db', '/tmp/graph.sqlite',
            '--page-size', '25',
            'mem-c'
        ], {});

        expect(args).toMatchObject({
            ids      : ['mem-a', 'mem-b', 'mem-c'],
            idsFile  : '/tmp/ids.json',
            outputDir: '/tmp/out',
            graphDb  : '/tmp/graph.sqlite',
            pageSize : 25
        });
    });

    test('parseIdsText reads public manifest-shaped JSON without raw payload assumptions', () => {
        expect(mod.parseIdsText('{"ids":["a","b,c"]}')).toEqual(['a', 'b', 'c']);
        expect(mod.parseIdsText('{"records":[{"id":"r1"},{"id":"r2"}]}')).toEqual(['r1', 'r2']);
        expect(mod.parseIdsText('one\ntwo,three')).toEqual(['one', 'two', 'three']);
    });

    test('classifyMemoryPayload keeps prompt-only separate from all-empty', () => {
        expect(mod.classifyMemoryPayload({prompt: '', thought: ' ', response: null})).toEqual({
            candidateClass: 'all-fields-empty',
            invalidFields : ['prompt', 'thought', 'response']
        });

        expect(mod.classifyMemoryPayload({prompt: ' ', thought: 'valuable thought', response: 'valuable response'})).toEqual({
            candidateClass: 'prompt-only-empty',
            invalidFields : ['prompt']
        });

        expect(mod.classifyMemoryPayload({prompt: 'p', thought: 't', response: 'r'})).toEqual({
            candidateClass: 'not-corrupt-by-payload-predicate',
            invalidFields : []
        });
    });

    test('runExport writes restore-compatible selected backups and redacted manifest', async () => {
        const
            graphPath = path.join(workRoot, 'graph.sqlite'),
            outputDir = path.join(workRoot, 'quarantine-out'),
            timestamp = '2026-06-13T12:00:00.000Z';

        seedGraph(graphPath);

        const collection = fakeCollection([
            {
                id       : 'mem-all-empty',
                embedding: [0.1, 0.2],
                metadata : {
                    prompt   : '',
                    thought  : ' ',
                    response : null,
                    timestamp: Date.parse('2026-04-02T03:04:05.000Z'),
                    sessionId: 'session-a'
                },
                document: 'rollback document for all-empty'
            },
            {
                id       : 'mem-prompt-only',
                embedding: [0.3, 0.4],
                metadata : {
                    prompt   : '',
                    thought  : 'valuable thought must not enter manifest',
                    response : 'valuable response must not enter manifest',
                    timestamp: '2025-10-06T10:43:04.945Z',
                    sessionId: 'session-b'
                },
                document: 'rollback document for prompt-only'
            }
        ]);

        const result = await mod.runExport({
            ids             : ['mem-all-empty', 'mem-prompt-only', 'mem-missing'],
            outputDir,
            graphDb         : graphPath,
            timestamp,
            memoryCollection: collection,
            logger          : {log: () => {}}
        });

        expect(result.files.memory).toBe(path.join(outputDir, 'mc', 'memory-backup-quarantine-2026-06-13T12-00-00.000Z.jsonl'));
        expect(result.files.graph).toBe(path.join(outputDir, 'graph', 'graph-backup-quarantine-2026-06-13T12-00-00.000Z.jsonl'));
        expect(await fsExtra.pathExists(result.files.manifest)).toBe(true);

        const memoryLines = (await fsExtra.readFile(result.files.memory, 'utf8')).trim().split('\n').map(JSON.parse);
        expect(memoryLines.map(row => row.id)).toEqual(['mem-all-empty', 'mem-prompt-only']);
        expect(memoryLines[1].metadata.thought).toBe('valuable thought must not enter manifest');

        const graphLines = (await fsExtra.readFile(result.files.graph, 'utf8')).trim().split('\n').map(JSON.parse);
        expect(graphLines).toEqual([
            {type: 'node', data: {id: 'mem-all-empty', label: 'AGENT_MEMORY'}},
            {
                type: 'edge',
                data: {
                    id    : 'edge-authored',
                    source: 'mem-all-empty',
                    target: '@neo-gpt',
                    type  : 'AUTHORED_BY',
                    weight: 1
                }
            }
        ]);

        expect(result.counts).toMatchObject({
            requested     : 3,
            memoryExported: 2,
            memoryMissing : 1,
            graphNodes    : 1,
            graphEdges    : 1
        });
        expect(result.counts.byCandidateClass).toMatchObject({
            'all-fields-empty'              : 1,
            'prompt-only-empty'             : 1,
            'missing-from-memory-collection': 1
        });

        const manifestText = await fsExtra.readFile(result.files.manifest, 'utf8');
        expect(manifestText).not.toContain('valuable thought must not enter manifest');
        expect(manifestText).not.toContain('valuable response must not enter manifest');

        const manifest = JSON.parse(manifestText);
        expect(manifest.safety).toMatchObject({
            mutationPerformed: false,
            destructiveAction: 'not-supported-by-this-script'
        });
        expect(manifest.entries.find(entry => entry.id === 'mem-all-empty')).toMatchObject({
            candidateClass   : 'all-fields-empty',
            graphMatch       : true,
            provenanceStatus : 'known',
            provenanceSources: ['graph.AUTHORED_BY']
        });
        expect(manifest.entries.find(entry => entry.id === 'mem-prompt-only')).toMatchObject({
            candidateClass  : 'prompt-only-empty',
            graphMatch      : false,
            provenanceStatus: 'unknown'
        });
    });
});

function fakeCollection(rows) {
    const byId = new Map(rows.map(row => [row.id, row]));

    return {
        get: async ({ids}) => {
            const selected = ids.map(id => byId.get(id)).filter(Boolean);
            return {
                ids       : selected.map(row => row.id),
                embeddings: selected.map(row => row.embedding),
                metadatas : selected.map(row => row.metadata),
                documents : selected.map(row => row.document)
            }
        }
    }
}

function seedGraph(dbPath) {
    const db = new Database(dbPath);

    try {
        db.exec(`
            CREATE TABLE Nodes (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
            CREATE TABLE Edges (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                target TEXT NOT NULL,
                type TEXT NOT NULL,
                data TEXT NOT NULL
            );
        `);

        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(
            'mem-all-empty',
            JSON.stringify({id: 'mem-all-empty', label: 'AGENT_MEMORY'})
        );
        db.prepare('INSERT INTO Edges (id, source, target, type, data) VALUES (?, ?, ?, ?, ?)').run(
            'edge-authored',
            'mem-all-empty',
            '@neo-gpt',
            'AUTHORED_BY',
            JSON.stringify({
                id    : 'edge-authored',
                source: 'mem-all-empty',
                target: '@neo-gpt',
                type  : 'AUTHORED_BY',
                weight: 1
            })
        );
    } finally {
        db.close();
    }
}
