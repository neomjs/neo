import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'ValidateCodexWakeMatrixTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Database       from 'better-sqlite3';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';
import crypto         from 'crypto';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {
    createGraphSchema,
    insertIsolatedSubscription,
    loadCodexSubscription,
    parseArgs,
    runValidation
} from '../../../../../../ai/scripts/lifecycle/validateCodexWakeMatrix.mjs';

function createSourceDb(dbPath, {
    identity = '@test-codex',
    subId = 'WAKE_SUB:test-codex',
    status = 'active',
    harnessTarget = 'bridge-daemon',
    metadata = {appName: 'Codex', focusSeedKey: 'r'}
} = {}) {
    const db = new Database(dbPath);
    createGraphSchema(db);

    db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(identity, JSON.stringify({
        id        : identity,
        label     : 'AGENT',
        properties: {name: identity}
    }));

    db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
        id        : subId,
        label     : 'WAKE_SUBSCRIPTION',
        properties: {
            agentIdentity        : identity,
            harnessTarget,
            status,
            trigger              : 'SENT_TO_ME',
            harnessTargetMetadata: metadata
        }
    }));
    db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');
    db.close();

    return {identity, subId};
}

test.describe('validateCodexWakeMatrix', () => {
    let tmpRoot;

    test.beforeEach(() => {
        tmpRoot = path.join(os.tmpdir(), `validate-codex-wake-${crypto.randomUUID()}`);
        fs.ensureDirSync(tmpRoot);
    });

    test.afterEach(() => {
        fs.removeSync(tmpRoot);
    });

    test('parseArgs defaults to dry direct-message validation', () => {
        const parsed = parseArgs([]);

        expect(parsed.scenario).toBe('direct-message');
        expect(parsed.live).toBe(false);
        expect(parsed.coalesceWindowMs).toBe(1000);
    });

    test('loadCodexSubscription finds the active Codex subscription for an identity', () => {
        const sourceDbPath = path.join(tmpRoot, 'source.sqlite');
        const {identity, subId} = createSourceDb(sourceDbPath);
        const db = new Database(sourceDbPath, {readonly: true});

        try {
            const sub = loadCodexSubscription(db, {identity});
            expect(sub.id).toBe(subId);
            expect(sub.properties.harnessTargetMetadata.appName).toBe('Codex');
        } finally {
            db.close();
        }
    });

    test('loadCodexSubscription rejects inactive explicit subscriptions', () => {
        const sourceDbPath = path.join(tmpRoot, 'source.sqlite');
        const {identity, subId} = createSourceDb(sourceDbPath, {
            status: 'inactive'
        });
        const db = new Database(sourceDbPath, {readonly: true});

        try {
            expect(() => loadCodexSubscription(db, {identity, subscriptionId: subId}))
                .toThrow('is not an active wake subscription');
        } finally {
            db.close();
        }
    });

    test('insertIsolatedSubscription uses test adapter unless live is explicit', () => {
        const sourceDbPath = path.join(tmpRoot, 'source.sqlite');
        const {identity} = createSourceDb(sourceDbPath, {
            metadata: {appName: 'Codex', focusSeedKey: 'r', adapter: 'osascript'}
        });
        const sourceDb = new Database(sourceDbPath, {readonly: true});
        const sourceSub = loadCodexSubscription(sourceDb, {identity});
        sourceDb.close();

        const isolatedDbPath = path.join(tmpRoot, 'isolated.sqlite');
        const isolatedDb = new Database(isolatedDbPath);
        createGraphSchema(isolatedDb);

        const copied = insertIsolatedSubscription(isolatedDb, sourceSub, {
            identity,
            live            : false,
            coalesceWindowMs: 1234
        });
        isolatedDb.close();

        expect(copied.properties.harnessTargetMetadata.adapter).toBe('test');
        expect(copied.properties.harnessTargetMetadata.appName).toBe('Codex');
        expect(copied.properties.harnessTargetMetadata.coalesceWindow).toBeCloseTo(1.234);
    });

    test('runValidation emits exactly one dry-run direct-message artifact from an isolated graph', async () => {
        const sourceDbPath = path.join(tmpRoot, 'source.sqlite');
        const workDir      = path.join(tmpRoot, 'work');
        const artifactPath = path.join(tmpRoot, 'artifact.json');
        const {identity, subId} = createSourceDb(sourceDbPath);

        const artifact = await runValidation({
            scenario        : 'direct-message',
            identity,
            sourceDb        : sourceDbPath,
            subscriptionId  : subId,
            workDir,
            artifact        : artifactPath,
            live            : false,
            timeoutMs       : 15000,
            coalesceWindowMs: 250,
            notes           : 'unit-test'
        });

        expect(artifact.scenario).toBe('direct-message');
        expect(artifact.live).toBe(false);
        expect(artifact.subscription.id).toBe(subId);
        expect(artifact.subscription.harnessTargetMetadata.adapter).toBe('test');
        expect(artifact.isolation.productionCursorUsed).toBe(false);
        expect(artifact.isolation.productionBacklogRead).toBe(false);
        expect(artifact.inserted.messages).toHaveLength(1);
        expect(artifact.inserted.heartbeats).toHaveLength(0);
        expect(artifact.backendEvidence.line).toContain('scenario=direct-message');
        expect(artifact.backendEvidence.line).toContain('route=test');
        expect(artifact.liveCodexAssertions.promptPayloadLands).toBe('not-run-dry-adapter');
        expect(fs.existsSync(artifactPath)).toBe(true);

        const persisted = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        expect(persisted.backendEvidence.line).toContain('scenario=direct-message');
    });

    test('runValidation emits dry-run mixed message + heartbeat evidence', async () => {
        const sourceDbPath = path.join(tmpRoot, 'source.sqlite');
        const {identity, subId} = createSourceDb(sourceDbPath);

        const artifact = await runValidation({
            scenario        : 'mixed-message-heartbeat',
            identity,
            sourceDb        : sourceDbPath,
            subscriptionId  : subId,
            workDir         : path.join(tmpRoot, 'mixed-work'),
            artifact        : null,
            live            : false,
            timeoutMs       : 15000,
            coalesceWindowMs: 250,
            notes           : ''
        });

        expect(artifact.inserted.messages).toHaveLength(1);
        expect(artifact.inserted.heartbeats).toHaveLength(1);
        expect(artifact.backendEvidence.line).toContain('scenario=mixed-message-heartbeat');
        expect(artifact.backendEvidence.line).toContain('counts=messages:1,tasks:0,permissions:0,heartbeats:1');
    });
});
