import {setup} from '../../../../setup.mjs';

const appName = 'KBBackupTest';

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

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Serial mode: specs in this file mutate the `KB_ChromaManager.getKnowledgeBaseCollection`
// singleton via beforeAll/afterAll. Running tests serially within this file prevents
// intra-file races during local multi-worker runs. CI uses `workers: 1` (see
// playwright.config.unit.mjs) so this is a local-DX-only safeguard.
test.describe.configure({mode: 'serial'});

test.describe('KB_DatabaseService — manageDatabaseBackup (#10129 Phase 1)', () => {
    let SDK, KB_DatabaseService, KB_ChromaManager;
    let originalGetCollection, tmpBackupDir;

    test.beforeAll(async () => {
        SDK                = await import('../../../../../../ai/services.mjs');
        KB_DatabaseService = SDK.KB_DatabaseService;
        KB_ChromaManager   = SDK.KB_ChromaManager;

        tmpBackupDir = path.resolve(process.cwd(), 'tmp', `kb-backup-test-${process.pid}-${Date.now()}`);
        fs.mkdirSync(tmpBackupDir, {recursive: true});

        originalGetCollection = KB_ChromaManager.getKnowledgeBaseCollection.bind(KB_ChromaManager);
    });

    test.afterAll(async () => {
        KB_ChromaManager.getKnowledgeBaseCollection = originalGetCollection;

        if (tmpBackupDir && fs.existsSync(tmpBackupDir)) {
            fs.rmSync(tmpBackupDir, {recursive: true, force: true});
        }
    });

    test('exports a populated collection as a timestamped JSONL artifact', async () => {
        const fakeRows = [
            {id: 'id-1', embedding: [0.1, 0.2], metadata: {kind: 'class'},  document: 'doc-1'},
            {id: 'id-2', embedding: [0.3, 0.4], metadata: {kind: 'method'}, document: 'doc-2'}
        ];

        const fakeCollection = {
            name : 'fake-kb-populated',
            count: async () => fakeRows.length,
            get  : async ({include = [], limit, offset = 0} = {}) => {
                if (include.length === 0) {
                    return {ids: fakeRows.map(r => r.id)};
                }

                const sliced = fakeRows.slice(offset, offset + (limit ?? fakeRows.length));

                return {
                    ids       : sliced.map(r => r.id),
                    documents : sliced.map(r => r.document),
                    metadatas : sliced.map(r => r.metadata),
                    embeddings: sliced.map(r => r.embedding)
                };
            }
        };

        KB_ChromaManager.getKnowledgeBaseCollection = async () => fakeCollection;

        const result = await KB_DatabaseService.manageDatabaseBackup({
            action    : 'export',
            backupPath: tmpBackupDir
        });

        expect(result.message).toMatch(/Exported 2 knowledge base chunks/);

        const produced = fs.readdirSync(tmpBackupDir)
            .filter(f => f.startsWith('knowledge-base-backup-') && f.endsWith('.jsonl'));
        expect(produced).toHaveLength(1);

        const jsonl   = fs.readFileSync(path.join(tmpBackupDir, produced[0]), 'utf8');
        const records = jsonl.trim().split('\n').map(line => JSON.parse(line));

        expect(records).toHaveLength(2);
        expect(records[0]).toEqual({id: 'id-1', embedding: [0.1, 0.2], metadata: {kind: 'class'},  document: 'doc-1'});
        expect(records[1]).toEqual({id: 'id-2', embedding: [0.3, 0.4], metadata: {kind: 'method'}, document: 'doc-2'});
    });

    test('returns gracefully without producing a JSONL when the collection is empty', async () => {
        const emptyCollection = {
            name : 'fake-kb-empty',
            count: async () => 0,
            get  : async () => { throw new Error('get() should not be called on empty collection'); }
        };

        KB_ChromaManager.getKnowledgeBaseCollection = async () => emptyCollection;

        const emptyDir = path.join(tmpBackupDir, 'empty-case');
        fs.mkdirSync(emptyDir, {recursive: true});

        const result = await KB_DatabaseService.manageDatabaseBackup({
            action    : 'export',
            backupPath: emptyDir
        });

        expect(result.message).toMatch(/Exported 0 knowledge base chunks/);

        const produced = fs.readdirSync(emptyDir).filter(f => f.endsWith('.jsonl'));
        expect(produced).toHaveLength(0);
    });

    test('rejects unsupported actions at the dispatcher layer', async () => {
        // No openapi operation is registered for `manage_database_backup` in KB (retired per
        // #10132 script-over-tool reduction), so `makeSafe` no-match passthrough forwards
        // args raw — the manual `throw new Error('Unknown action...')` inside the dispatcher
        // is the rejection path. `'import'` and `'truncate'` were added in #10871 AC-B; this
        // assertion uses an unambiguously-unsupported action to keep the dispatcher rejection
        // contract under test.
        await expect(
            KB_DatabaseService.manageDatabaseBackup({action: 'frobnicate'})
        ).rejects.toThrow(/Unknown action: frobnicate/);
    });
});
