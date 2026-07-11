import {setup} from '../../../../setup.mjs';

const appName = 'CanonicalizeStoredAgentIdentitiesMigrationTest';

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
import Database       from 'better-sqlite3';
import {spawnSync}    from 'node:child_process';
import path           from 'node:path';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {
    auditCanonicalStorage,
    getCanonicalDirectIdentityCandidate,
    parseArgs,
    PERMISSION_IDENTITY_EDGE_TYPES,
    planCanonicalStorageMigration,
    runCanonicalStorageMigration
} from '../../../../../../ai/scripts/migrations/canonicalizeStoredAgentIdentities.mjs';

const PERMISSION_SCOPES = [
    'BLOCKED_BY',
    'CAN_READ_INBOX_OF',
    'CAN_READ_MEMORIES_OF',
    'CAN_READ_SESSIONS_OF',
    'CAN_REPLY_TO'
];

/**
 * @summary Creates a production-shaped in-memory graph schema for the canonical storage migration.
 * @param {Object} db Open better-sqlite3 connection.
 */
function createGraphSchema(db) {
    db.pragma('foreign_keys = ON');
    db.exec(`
        CREATE TABLE Nodes (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            data TEXT NOT NULL
        );
        CREATE TABLE Edges (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            source TEXT NOT NULL,
            target TEXT NOT NULL,
            type TEXT NOT NULL,
            data TEXT NOT NULL,
            FOREIGN KEY (source) REFERENCES Nodes(id) ON DELETE CASCADE,
            FOREIGN KEY (target) REFERENCES Nodes(id) ON DELETE CASCADE
        );
    `);
}

/**
 * @summary Inserts one graph node fixture.
 * @param {Object} db Open better-sqlite3 connection.
 * @param {Object} node Node fixture.
 */
function insertNode(db, node) {
    const data = node.data || {
        id        : node.id,
        label     : node.label || 'NODE',
        properties: node.properties || {}
    };

    db.prepare('INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?)')
        .run(node.id, node.user_id ?? null, JSON.stringify(data));
}

/**
 * @summary Inserts one AgentIdentity or identity-lookalike fixture.
 * @param {Object} db Open better-sqlite3 connection.
 * @param {String} id Node id.
 * @param {String} [label='AgentIdentity'] Stored graph label.
 */
function insertIdentity(db, id, label = 'AgentIdentity') {
    insertNode(db, {
        id,
        label,
        properties: {
            accountType: label === 'AgentIdentity' ? 'agent' : 'fixture'
        }
    });
}

/**
 * @summary Inserts one graph edge fixture with mirrored structural JSON.
 * @param {Object} db Open better-sqlite3 connection.
 * @param {Object} edge Edge fixture.
 */
function insertEdge(db, edge) {
    const data = edge.data || {
        id        : edge.id,
        source    : edge.source,
        target    : edge.target,
        type      : edge.type,
        properties: edge.properties || {}
    };

    db.prepare('INSERT INTO Edges (id, user_id, source, target, type, data) VALUES (?, ?, ?, ?, ?, ?)')
        .run(edge.id, edge.user_id ?? null, edge.source, edge.target, edge.type, JSON.stringify(data));
}

/**
 * @summary Reads and parses one graph node's stored JSON.
 * @param {Object} db Open better-sqlite3 connection.
 * @param {String} id Node id.
 * @returns {Object}
 */
function getNodeData(db, id) {
    const row = db.prepare('SELECT data FROM Nodes WHERE id = ?').get(id);
    return row ? JSON.parse(row.data) : null;
}

/**
 * @summary Reads one edge row and parses its mirrored JSON payload.
 * @param {Object} db Open better-sqlite3 connection.
 * @param {String} id Edge id.
 * @returns {Object|null}
 */
function getEdge(db, id) {
    const row = db.prepare('SELECT id, user_id, source, target, type, data FROM Edges WHERE id = ?').get(id);
    return row ? {...row, data: JSON.parse(row.data)} : null;
}

/**
 * @summary Captures deterministic raw storage truth for mutation and rollback assertions.
 * @param {Object} db Open better-sqlite3 connection.
 * @returns {{nodes: Object[], edges: Object[]}}
 */
function snapshotGraph(db) {
    return {
        nodes: db.prepare('SELECT id, user_id, data FROM Nodes ORDER BY id').all(),
        edges: db.prepare('SELECT id, user_id, source, target, type, data FROM Edges ORDER BY id').all()
    };
}

test.describe('ai/scripts/migrations/canonicalizeStoredAgentIdentities', () => {
    test('CLI help stays bootstrap-free and malformed --db overrides fail closed (#15038)', () => {
        const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../../..'),
            result   = spawnSync(process.execPath, ['ai/scripts/migrations/canonicalizeStoredAgentIdentities.mjs', '--help'], {
                cwd     : repoRoot,
                encoding: 'utf-8',
                timeout : 30_000
            });

        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('Usage:');
        expect(() => parseArgs(['node', 'script', '--apply', '--db'])).toThrow(/non-flag path/);
        expect(() => parseArgs(['node', 'script', '--db', '--apply'])).toThrow(/non-flag path/);
    });

    test('permission-edge inventory remains executable against PermissionService.validScopes (#15038)', async () => {
        const {default: PermissionService} = await import('../../../../../../ai/services/memory-core/PermissionService.mjs');

        expect([...PERMISSION_IDENTITY_EDGE_TYPES].sort()).toEqual([...PermissionService.validScopes].sort());
        expect([...PERMISSION_IDENTITY_EDGE_TYPES].sort()).toEqual([...PERMISSION_SCOPES].sort());
    });

    test('dry-run is mutation-free and apply canonicalizes only safe direct identity storage (#15038)', () => {
        const db = new Database(':memory:');
        createGraphSchema(db);

        for (const id of ['@alice', '@bob', '@charlie', '@dock-motion-nl']) insertIdentity(db, id);
        for (const id of ['alice', '@@bob', 'AGENT:@charlie']) insertIdentity(db, id);

        insertIdentity(db, 'missing-peer');
        insertIdentity(db, 'wrong-peer');
        insertIdentity(db, '@wrong-peer', 'CLASS');

        const nonDirectTargets = [
            ['AGENT:*', 'BroadcastSentinel'],
            ['AGENT:claude/opus', 'AddressingAlias'],
            ['role:librarian', 'ROLE'],
            ['human:tobiu', 'HUMAN']
        ];
        for (const [id, label] of nonDirectTargets) insertIdentity(db, id, label);
        insertIdentity(db, 'dock-motion-nl', 'CLASS');
        insertIdentity(db, 'ISSUE:blocked', 'ISSUE');
        insertEdge(db, {
            id    : 'work-blocked-by',
            source: 'ISSUE:blocked',
            target: 'dock-motion-nl',
            type  : 'BLOCKED_BY'
        });

        insertNode(db, {
            id     : 'MESSAGE:direct',
            user_id: 'legacy-user-id',
            label  : 'MESSAGE',
            properties: {
                bodyText: 'historical prose keeps alice and @@bob exactly',
                from    : 'alice',
                subject : 'legacy alice to @@bob',
                to      : '@@bob'
            }
        });
        insertEdge(db, {
            id     : 'direct-sent-by',
            user_id: 'legacy-user-id',
            source : 'MESSAGE:direct',
            target : 'alice',
            type   : 'SENT_BY'
        });
        insertEdge(db, {
            id     : 'direct-sent-to',
            user_id: 'legacy-user-id',
            source : 'MESSAGE:direct',
            target : '@@bob',
            type   : 'SENT_TO'
        });
        insertNode(db, {
            id   : 'MESSAGE:mirror-only',
            label: 'MESSAGE',
            properties: {
                bodyText: 'damaged routing edges stay absent while safe mirrors converge',
                from    : 'alice',
                to      : '@@bob'
            }
        });

        insertNode(db, {
            id   : 'MESSAGE:broadcast',
            label: 'MESSAGE',
            properties: {
                bodyText: 'broadcast prose keeps AGENT:@charlie',
                from    : 'alice',
                to      : 'AGENT:*'
            }
        });
        insertEdge(db, {id: 'broadcast-sent-by', source: 'MESSAGE:broadcast', target: 'alice', type: 'SENT_BY'});
        insertEdge(db, {id: 'broadcast-sent-to', source: 'MESSAGE:broadcast', target: 'AGENT:*', type: 'SENT_TO'});
        insertEdge(db, {id: 'broadcast-delivered', source: 'MESSAGE:broadcast', target: 'AGENT:@charlie', type: 'DELIVERED_TO'});

        nonDirectTargets.forEach(([target], index) => {
            const messageId = `MESSAGE:non-direct-${index}`;
            insertNode(db, {
                id        : messageId,
                label     : 'MESSAGE',
                properties: {bodyText: `preserve ${target}`, from: '@alice', to: target}
            });
            insertEdge(db, {id: `non-direct-${index}`, source: messageId, target, type: 'SENT_TO'});
        });

        PERMISSION_SCOPES.forEach((type, index) => {
            insertEdge(db, {
                id    : `permission-${index}`,
                source: index % 2 ? 'alice' : '@@bob',
                target: index % 2 ? '@@bob' : 'alice',
                type
            });
        });
        insertEdge(db, {id: 'missing-target-skip', source: 'missing-peer', target: '@alice', type: 'CAN_REPLY_TO'});
        insertEdge(db, {id: 'wrong-type-skip', source: 'wrong-peer', target: '@alice', type: 'CAN_READ_INBOX_OF'});

        expect(getCanonicalDirectIdentityCandidate(' bob ')).toBe('@bob');
        expect(getCanonicalDirectIdentityCandidate('AGENT:@bob')).toBe('@bob');
        expect(getCanonicalDirectIdentityCandidate('AGENT:*')).toBe('AGENT:*');
        expect(getCanonicalDirectIdentityCandidate('AGENT:claude/opus')).toBe('AGENT:claude/opus');
        expect(getCanonicalDirectIdentityCandidate('role:librarian')).toBe('role:librarian');
        expect(getCanonicalDirectIdentityCandidate('human:tobiu')).toBe('human:tobiu');

        const before        = snapshotGraph(db),
            beforeCensus  = auditCanonicalStorage(db),
            firstPlan     = planCanonicalStorageMigration(db),
            repeatedPlan  = planCanonicalStorageMigration(db),
            dryRun        = runCanonicalStorageMigration(db, false);

        expect(beforeCensus).toEqual({aliasNodes: 5, identityEdgeEndpoints: 16, messageProperties: 5});
        expect(repeatedPlan).toEqual(firstPlan);
        expect(firstPlan.blockers).toEqual([]);
        expect(dryRun).toMatchObject({
            applied            : false,
            aliasNodes         : 3,
            clean              : false,
            duplicateCollisions: 0,
            edgesDeleted       : 0,
            edgesUpdated       : 9,
            messageNodesUpdated: 3,
            before             : beforeCensus,
            after              : beforeCensus
        });
        expect(dryRun.skipped).toEqual([
            'canonical-target-missing:missing-peer->@missing-peer',
            'canonical-target-wrong-type:wrong-peer->@wrong-peer'
        ]);
        expect(snapshotGraph(db)).toEqual(before);

        const applied = runCanonicalStorageMigration(db, true);

        expect(applied).toMatchObject({
            applied            : true,
            aliasNodes         : 3,
            clean              : false,
            duplicateCollisions: 0,
            edgesDeleted       : 0,
            edgesUpdated       : 9,
            messageNodesUpdated: 3,
            after              : {aliasNodes: 2, identityEdgeEndpoints: 2, messageProperties: 0}
        });
        expect(applied.skipped).toEqual(dryRun.skipped);

        expect(getNodeData(db, 'alice')).toBeNull();
        expect(getNodeData(db, '@@bob')).toBeNull();
        expect(getNodeData(db, 'AGENT:@charlie')).toBeNull();
        expect(getNodeData(db, 'missing-peer')).not.toBeNull();
        expect(getNodeData(db, 'wrong-peer')).not.toBeNull();

        const directNode = getNodeData(db, 'MESSAGE:direct');
        expect(directNode.properties).toMatchObject({
            bodyText: 'historical prose keeps alice and @@bob exactly',
            from    : '@alice',
            subject : 'legacy alice to @@bob',
            to      : '@bob'
        });
        expect(db.prepare('SELECT user_id FROM Nodes WHERE id = ?').get('MESSAGE:direct').user_id).toBe('legacy-user-id');
        expect(getEdge(db, 'direct-sent-by')).toMatchObject({user_id: 'legacy-user-id', target: '@alice'});
        expect(getEdge(db, 'direct-sent-to')).toMatchObject({user_id: 'legacy-user-id', target: '@bob'});
        expect(getEdge(db, 'direct-sent-to').data).toMatchObject({source: 'MESSAGE:direct', target: '@bob', type: 'SENT_TO'});
        expect(getNodeData(db, 'MESSAGE:mirror-only').properties).toMatchObject({
            bodyText: 'damaged routing edges stay absent while safe mirrors converge',
            from    : '@alice',
            to      : '@bob'
        });

        const broadcastNode = getNodeData(db, 'MESSAGE:broadcast');
        expect(broadcastNode.properties).toMatchObject({
            bodyText: 'broadcast prose keeps AGENT:@charlie',
            from    : '@alice',
            to      : 'AGENT:*'
        });
        expect(getEdge(db, 'broadcast-sent-to').target).toBe('AGENT:*');
        expect(getEdge(db, 'broadcast-delivered').target).toBe('@charlie');

        for (let index = 0; index < PERMISSION_SCOPES.length; index++) {
            const edge = getEdge(db, `permission-${index}`);
            expect(edge.type).toBe(PERMISSION_SCOPES[index]);
            expect(edge.source.startsWith('@')).toBe(true);
            expect(edge.target.startsWith('@')).toBe(true);
            expect(edge.data).toMatchObject({source: edge.source, target: edge.target, type: edge.type});
        }

        nonDirectTargets.forEach(([target], index) => {
            expect(getEdge(db, `non-direct-${index}`).target).toBe(target);
            expect(getNodeData(db, `MESSAGE:non-direct-${index}`).properties).toMatchObject({
                bodyText: `preserve ${target}`,
                to      : target
            });
        });

        expect(getEdge(db, 'missing-target-skip').source).toBe('missing-peer');
        expect(getEdge(db, 'wrong-type-skip').source).toBe('wrong-peer');
        expect(getEdge(db, 'work-blocked-by')).toMatchObject({
            source: 'ISSUE:blocked',
            target: 'dock-motion-nl',
            type  : 'BLOCKED_BY'
        });

        db.close();
    });

    test('duplicate convergence preserves delivery state and deterministically retains canonical edges (#15038)', () => {
        const db = new Database(':memory:');
        createGraphSchema(db);

        for (const id of ['@alice', '@bob', 'alice', 'bob']) insertIdentity(db, id);
        insertNode(db, {
            id        : 'MESSAGE:collision',
            label     : 'MESSAGE',
            properties: {from: '@alice', to: 'AGENT:*'}
        });

        insertEdge(db, {
            id        : 'delivery-canonical',
            source    : 'MESSAGE:collision',
            target    : '@bob',
            type      : 'DELIVERED_TO',
            properties: {
                archivedAt : '2026-07-11T12:00:00.000Z',
                canonicalKey: 'keep-canonical',
                deliveredAt : '2026-07-11T10:00:00.000Z',
                readAt      : null,
                weight      : 1
            }
        });
        insertEdge(db, {
            id        : 'delivery-legacy',
            source    : 'MESSAGE:collision',
            target    : 'bob',
            type      : 'DELIVERED_TO',
            properties: {
                archivedAt: null,
                legacyKey : 'preserve-legacy-state',
                readAt    : '2026-07-11T11:00:00.000Z',
                weight    : 4.5
            }
        });
        insertEdge(db, {
            id        : 'permission-canonical',
            source    : '@alice',
            target    : '@bob',
            type      : 'CAN_REPLY_TO',
            properties: {grantedAt: '2026-07-11T10:00:00.000Z'}
        });
        insertEdge(db, {
            id        : 'permission-legacy',
            source    : 'alice',
            target    : 'bob',
            type      : 'CAN_REPLY_TO',
            properties: {legacyAudit: 'retain-me'}
        });
        insertEdge(db, {
            id        : 'blocked-canonical',
            source    : '@alice',
            target    : '@bob',
            type      : 'BLOCKED_BY',
            properties: {blockedAt: '2026-07-11T10:00:00.000Z'}
        });
        insertEdge(db, {
            id        : 'blocked-legacy',
            source    : 'alice',
            target    : 'bob',
            type      : 'BLOCKED_BY',
            properties: {legacyAudit: 'retain-block-audit'}
        });

        const result = runCanonicalStorageMigration(db, true);

        expect(result).toMatchObject({
            aliasNodes         : 2,
            clean              : true,
            duplicateCollisions: 3,
            edgesDeleted       : 3,
            edgesUpdated       : 3,
            after              : {aliasNodes: 0, identityEdgeEndpoints: 0, messageProperties: 0}
        });
        expect(getEdge(db, 'delivery-legacy')).toBeNull();
        expect(getEdge(db, 'permission-legacy')).toBeNull();
        expect(getEdge(db, 'blocked-legacy')).toBeNull();

        const delivery = getEdge(db, 'delivery-canonical');
        expect(delivery).toMatchObject({source: 'MESSAGE:collision', target: '@bob', type: 'DELIVERED_TO'});
        expect(delivery.data.properties).toMatchObject({
            archivedAt : '2026-07-11T12:00:00.000Z',
            canonicalKey: 'keep-canonical',
            legacyKey  : 'preserve-legacy-state',
            readAt     : '2026-07-11T11:00:00.000Z',
            weight     : 4.5
        });

        const permission = getEdge(db, 'permission-canonical');
        expect(permission).toMatchObject({source: '@alice', target: '@bob', type: 'CAN_REPLY_TO'});
        expect(permission.data.properties).toMatchObject({
            grantedAt  : '2026-07-11T10:00:00.000Z',
            legacyAudit: 'retain-me'
        });
        expect(db.prepare(`SELECT COUNT(*) AS count FROM Edges WHERE source = '@alice' AND target = '@bob' AND type = 'CAN_REPLY_TO'`).get().count).toBe(1);
        expect(getEdge(db, 'blocked-canonical').data.properties).toMatchObject({
            blockedAt  : '2026-07-11T10:00:00.000Z',
            legacyAudit: 'retain-block-audit'
        });
        expect(db.prepare(`SELECT COUNT(*) AS count FROM Edges WHERE source = '@alice' AND target = '@bob' AND type = 'BLOCKED_BY'`).get().count).toBe(1);
        expect(db.prepare(`SELECT COUNT(*) AS count FROM Edges WHERE source = 'MESSAGE:collision' AND target = '@bob' AND type = 'DELIVERED_TO'`).get().count).toBe(1);

        db.close();
    });

    test('refuses message-property disagreement instead of inventing sender history (#15038)', () => {
        const db = new Database(':memory:');
        createGraphSchema(db);

        insertIdentity(db, '@alice');
        insertIdentity(db, '@bob');
        insertNode(db, {
            id        : 'MESSAGE:disagreement',
            label     : 'MESSAGE',
            properties: {from: '@bob', to: '@alice'}
        });
        insertEdge(db, {id: 'disagreement-sent-by', source: 'MESSAGE:disagreement', target: '@alice', type: 'SENT_BY'});
        insertEdge(db, {id: 'disagreement-sent-to', source: 'MESSAGE:disagreement', target: '@alice', type: 'SENT_TO'});

        const before = snapshotGraph(db),
            plan   = planCanonicalStorageMigration(db);

        expect(plan.blockers).toEqual([
            'message-from-edge-disagreement:MESSAGE:disagreement:@bob!=@alice'
        ]);
        expect(() => runCanonicalStorageMigration(db, true)).toThrow(/message-from-edge-disagreement/);
        expect(snapshotGraph(db)).toEqual(before);

        db.close();
    });

    test('refuses duplicate convergence across different RLS user_id scopes (#15038)', () => {
        const db = new Database(':memory:');
        createGraphSchema(db);

        insertIdentity(db, '@alice');
        insertIdentity(db, '@bob');
        insertIdentity(db, 'bob');
        insertEdge(db, {
            id     : 'rls-canonical',
            user_id: 'tenant-a',
            source : '@alice',
            target : '@bob',
            type   : 'CAN_REPLY_TO'
        });
        insertEdge(db, {
            id     : 'rls-legacy',
            user_id: 'tenant-b',
            source : '@alice',
            target : 'bob',
            type   : 'CAN_REPLY_TO'
        });

        const before = snapshotGraph(db),
            plan   = planCanonicalStorageMigration(db);

        expect(plan.blockers).toEqual([
            'edge-user-id-disagreement:@alice->@bob:CAN_REPLY_TO'
        ]);
        expect(() => runCanonicalStorageMigration(db, true)).toThrow(/edge-user-id-disagreement/);
        expect(snapshotGraph(db)).toEqual(before);

        db.close();
    });

    test('refuses alias-node convergence across different RLS user_id scopes (#15038)', () => {
        const db = new Database(':memory:');
        createGraphSchema(db);

        insertNode(db, {
            id     : '@alice',
            user_id: 'tenant-a',
            label  : 'AgentIdentity'
        });
        insertNode(db, {
            id     : 'alice',
            user_id: 'tenant-b',
            label  : 'AgentIdentity'
        });

        const before = snapshotGraph(db),
            plan   = planCanonicalStorageMigration(db);

        expect(plan.blockers).toEqual([
            'node-user-id-disagreement:alice->@alice'
        ]);
        expect(() => runCanonicalStorageMigration(db, true)).toThrow(/node-user-id-disagreement/);
        expect(snapshotGraph(db)).toEqual(before);

        db.close();
    });

    test('apply rolls back every preceding write when a later edge update fails (#15038)', () => {
        const db = new Database(':memory:');
        createGraphSchema(db);

        for (const id of ['@alice', '@bob', 'alice', 'bob']) insertIdentity(db, id);
        insertNode(db, {
            id        : 'MESSAGE:rollback',
            label     : 'MESSAGE',
            properties: {bodyText: 'must survive byte-for-byte', from: 'alice', to: 'bob'}
        });
        insertEdge(db, {id: 'edge-01', source: 'MESSAGE:rollback', target: 'alice', type: 'SENT_BY'});
        insertEdge(db, {id: 'edge-02', source: 'MESSAGE:rollback', target: 'bob', type: 'SENT_TO'});

        const before       = snapshotGraph(db),
            beforeAudit = auditCanonicalStorage(db);

        db.exec(`
            CREATE TRIGGER force_canonical_migration_failure
            BEFORE UPDATE ON Edges
            WHEN OLD.id = 'edge-02'
            BEGIN
                SELECT RAISE(ABORT, 'forced canonical rollback');
            END;
        `);

        expect(() => runCanonicalStorageMigration(db, true)).toThrow(/forced canonical rollback/);
        expect(snapshotGraph(db)).toEqual(before);
        expect(auditCanonicalStorage(db)).toEqual(beforeAudit);
        expect(getEdge(db, 'edge-01').target).toBe('alice');
        expect(getNodeData(db, 'alice')).not.toBeNull();
        expect(getNodeData(db, 'bob')).not.toBeNull();

        db.close();
    });

    test('a second apply is a byte-stable no-op after canonical convergence (#15038)', () => {
        const db = new Database(':memory:');
        createGraphSchema(db);

        insertIdentity(db, '@bob');
        insertIdentity(db, 'bob');
        insertNode(db, {
            id        : 'MESSAGE:idempotent',
            label     : 'MESSAGE',
            properties: {bodyText: 'keep bob in prose', to: 'bob'}
        });
        insertEdge(db, {id: 'idempotent-sent-to', source: 'MESSAGE:idempotent', target: 'bob', type: 'SENT_TO'});

        const first = runCanonicalStorageMigration(db, true);
        expect(first.after).toEqual({aliasNodes: 0, identityEdgeEndpoints: 0, messageProperties: 0});

        const converged = snapshotGraph(db),
            plan      = planCanonicalStorageMigration(db),
            second    = runCanonicalStorageMigration(db, true);

        expect(plan).toEqual({
            aliasNodes       : [],
            blockers         : [],
            edgeDeletes      : [],
            edgeUpdates      : [],
            messageNodeUpdates: [],
            skipped          : []
        });
        expect(second).toMatchObject({
            applied            : true,
            aliasNodes         : 0,
            clean              : true,
            duplicateCollisions: 0,
            edgesDeleted       : 0,
            edgesUpdated       : 0,
            messageNodesUpdated: 0,
            before             : {aliasNodes: 0, identityEdgeEndpoints: 0, messageProperties: 0},
            after              : {aliasNodes: 0, identityEdgeEndpoints: 0, messageProperties: 0},
            blockers           : [],
            skipped            : []
        });
        expect(snapshotGraph(db)).toEqual(converged);
        expect(getNodeData(db, 'MESSAGE:idempotent').properties).toMatchObject({
            bodyText: 'keep bob in prose',
            to      : '@bob'
        });

        db.close();
    });
});
