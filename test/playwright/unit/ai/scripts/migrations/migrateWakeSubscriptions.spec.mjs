import {setup} from '../../../../setup.mjs';

const appName = 'MigrateWakeSubscriptionsTest';

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
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {auditWakeRoutes, runMigration} from '../../../../../../ai/scripts/migrations/migrateWakeSubscriptions.mjs';

/**
 * @summary Creates the minimal SQLite graph schema used by the wake-subscription migration.
 * @param {Object} db Open better-sqlite3 connection.
 */
function createGraphSchema(db) {
    db.exec(`
        CREATE TABLE Nodes (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL
        );
    `);
}

/**
 * @summary Inserts one graph node fixture into the in-memory database.
 * @param {Object} db Open better-sqlite3 connection.
 * @param {Object} node Node row.
 */
function insertNode(db, node) {
    db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)')
        .run(node.id, JSON.stringify(node.data));
}

/**
 * @summary Inserts an AgentIdentity fixture with a bridge-daemon subscription template.
 * @param {Object} db Open better-sqlite3 connection.
 * @param {String} id Agent identity id.
 * @param {Object} harnessTargetMetadata Route metadata template.
 */
function insertAgentIdentity(db, id, harnessTargetMetadata) {
    insertNode(db, {
        id,
        data: {
            id,
            label     : 'AgentIdentity',
            properties: {
                subscriptionTemplate: {
                    trigger      : 'SENT_TO_ME',
                    harnessTarget: 'bridge-daemon',
                    harnessTargetMetadata
                }
            }
        }
    });
}

/**
 * @summary Inserts a WAKE_SUBSCRIPTION fixture owned by an agent identity.
 * @param {Object} db Open better-sqlite3 connection.
 * @param {Object} config Subscription fixture config.
 */
function insertSubscription(db, config) {
    const {
        id,
        agentIdentity,
        harnessTargetMetadata,
        createdAt,
        updatedAt,
        filters,
        status = 'active',
        trigger = 'SENT_TO_ME'
    } = config;

    insertNode(db, {
        id,
        data: {
            id,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity,
                trigger,
                filters,
                harnessTarget: 'bridge-daemon',
                harnessTargetMetadata,
                status,
                createdAt,
                updatedAt
            }
        }
    });
}

/**
 * @summary Reads and parses a graph node fixture by id.
 * @param {Object} db Open better-sqlite3 connection.
 * @param {String} id Node id.
 * @returns {Object}
 */
function getNode(db, id) {
    return JSON.parse(db.prepare('SELECT data FROM Nodes WHERE id = ?').get(id).data);
}

test.describe('ai/scripts/migrations/migrateWakeSubscriptions', () => {
    test('migrates legacy Codex subscriptions from stale durable identity rows onto the source identity-root adapter (#13350)', () => {
        const db = new Database(':memory:');
        createGraphSchema(db);

        insertAgentIdentity(db, '@neo-gpt', {appName: 'Codex'});
        insertSubscription(db, {
            id                   : 'WAKE_SUB:codex-legacy',
            agentIdentity        : '@neo-gpt',
            harnessTargetMetadata: {
                appName: 'Codex',
                focusSeedKey: 'r'
            }
        });

        const stats = runMigration(db, {apply: true, cleanupGenericNamedPeer: false});
        const migrated = getNode(db, 'WAKE_SUB:codex-legacy');

        expect(stats.subscriptionsPatched).toBe(1);
        expect(migrated.properties.harnessTargetMetadata).toMatchObject({
            adapter: 'osascript',
            appName: 'Codex',
            tabShortcut: null,
            focusSeedKey: 'r'
        });
    });

    test('dry-run reports adapter drift without mutating durable subscription rows (#13350)', () => {
        const db = new Database(':memory:');
        createGraphSchema(db);

        insertAgentIdentity(db, '@neo-gpt', {
            adapter: 'codex-app-server',
            appName: 'Codex',
            tabShortcut: null
        });
        insertSubscription(db, {
            id                   : 'WAKE_SUB:codex-dry-run',
            agentIdentity        : '@neo-gpt',
            harnessTargetMetadata: {
                appName: 'Codex'
            }
        });

        const stats = runMigration(db, {apply: false, cleanupGenericNamedPeer: false});
        const unchanged = getNode(db, 'WAKE_SUB:codex-dry-run');

        expect(stats.subscriptionsPatched).toBe(1);
        expect(unchanged.properties.harnessTargetMetadata).toEqual({
            appName: 'Codex'
        });
    });

    test('dry-run reports generic named-peer cleanup without mutating durable route rows (#13744)', () => {
        const db = new Database(':memory:');
        createGraphSchema(db);
        insertAgentIdentity(db, '@neo-opus-ada', {appName: 'Claude'});
        insertSubscription(db, {
            id                   : 'WAKE_SUB:ada-generic',
            agentIdentity        : '@neo-opus-ada',
            harnessTargetMetadata: {appName: 'Claude'},
            updatedAt            : '2026-06-21T10:00:00.000Z'
        });

        const stats     = runMigration(db, {apply: false, now: '2026-06-21T12:00:00.000Z'}),
              unchanged = getNode(db, 'WAKE_SUB:ada-generic');

        expect(stats.genericDefaultMarked).toBe(1);
        expect(stats.genericDuplicatesRetired).toBe(0);
        expect(stats.genericNamedPeerUnresolved).toBe(1);
        expect(unchanged.properties.harnessTargetMetadata).toEqual({appName: 'Claude'});
        expect(unchanged.properties.status).toBe('active');
    });

    test('apply marks a generic named-peer keeper as default-instance and retires duplicate rows (#13744)', () => {
        const db = new Database(':memory:');
        createGraphSchema(db);
        insertAgentIdentity(db, '@neo-opus-ada', {appName: 'Claude'});
        insertSubscription(db, {
            id                   : 'WAKE_SUB:ada-old',
            agentIdentity        : '@neo-opus-ada',
            harnessTargetMetadata: {appName: 'Claude'},
            filters              : {channel: 'direct'},
            updatedAt            : '2026-06-21T09:00:00.000Z'
        });
        insertSubscription(db, {
            id                   : 'WAKE_SUB:ada-new',
            agentIdentity        : '@neo-opus-ada',
            harnessTargetMetadata: {appName: 'Claude'},
            filters              : {channel: 'direct'},
            updatedAt            : '2026-06-21T10:00:00.000Z'
        });

        const now   = '2026-06-21T12:00:00.000Z',
              stats = runMigration(db, {apply: true, now});

        const keeper  = getNode(db, 'WAKE_SUB:ada-new'),
              retired = getNode(db, 'WAKE_SUB:ada-old'),
              audit   = auditWakeRoutes(db);

        expect(stats.genericDefaultMarked).toBe(1);
        expect(stats.genericDuplicatesRetired).toBe(1);
        expect(stats.genericNamedPeerUnresolved).toBe(0);
        expect(keeper.properties.harnessTargetMetadata).toMatchObject({
            appName        : 'Claude',
            defaultInstance: true,
            routeResolution: 'default-instance',
            routeResolvedAt: now,
            routeResolvedBy: 'migrateWakeSubscriptions#genericNamedPeer'
        });
        expect(keeper.properties.harnessTargetMetadata.userDataDir).toBeUndefined();
        expect(keeper.properties.harnessTargetMetadata.instanceAddress).toBeUndefined();
        expect(keeper.properties.status).toBe('active');
        expect(retired.properties.status).toBe('inactive');
        expect(retired.properties.retiredReason).toBe('duplicate generic named-peer default-instance route (#13744)');
        expect(audit.genericNamedPeer).toEqual([]);
        expect(audit.defaultInstance).toEqual([{id: 'WAKE_SUB:ada-new', agentIdentity: '@neo-opus-ada', appName: 'Claude'}]);
    });

    test('does not default-mark instance-addressed named-peer routes during generic cleanup (#13744)', () => {
        const db = new Database(':memory:');
        createGraphSchema(db);
        insertAgentIdentity(db, '@neo-opus-ada', {appName: 'Claude'});
        insertSubscription(db, {
            id                   : 'WAKE_SUB:ada-instance',
            agentIdentity        : '@neo-opus-ada',
            harnessTargetMetadata: {
                appName        : 'Claude',
                addressType    : 'userDataDir',
                instanceAddress: '/tmp/test-claude-ada'
            }
        });

        const stats = runMigration(db, {apply: true, now: '2026-06-21T12:00:00.000Z'}),
              route = getNode(db, 'WAKE_SUB:ada-instance');

        expect(stats.genericDefaultMarked).toBe(0);
        expect(stats.genericDuplicatesRetired).toBe(0);
        expect(stats.genericNamedPeerUnresolved).toBe(0);
        expect(route.properties.harnessTargetMetadata.defaultInstance).toBeUndefined();
    });

    test.describe('auditWakeRoutes (read-only #13481 audit)', () => {
        const insertSub = (db, id, agentIdentity, harnessTargetMetadata) => insertSubscription(db, {id, agentIdentity, harnessTargetMetadata});

        test('flags an addressType route that resolves to no instance address (empty-address)', () => {
            const db = new Database(':memory:');
            createGraphSchema(db);
            insertSub(db, 'WAKE_SUB:empty', '@neo-opus-ada', {appName: 'Claude', addressType: 'userDataDir', userDataDir: ''});

            const audit = auditWakeRoutes(db);
            expect(audit.emptyAddress.length).toBe(1);
            expect(audit.emptyAddress[0].id).toBe('WAKE_SUB:empty');
            expect(audit.genericNamedPeer.length).toBe(0);
        });

        test('flags a named peer on an appName-only generic route', () => {
            const db = new Database(':memory:');
            createGraphSchema(db);
            insertSub(db, 'WAKE_SUB:generic', '@neo-opus-ada', {appName: 'Claude'});

            const audit = auditWakeRoutes(db);
            expect(audit.genericNamedPeer.length).toBe(1);
            expect(audit.genericNamedPeer[0].agentIdentity).toBe('@neo-opus-ada');
            expect(audit.emptyAddress.length).toBe(0);
        });

        test('reports an explicitly default-marked named-peer route separately from unresolved generic findings', () => {
            const db = new Database(':memory:');
            createGraphSchema(db);
            insertSub(db, 'WAKE_SUB:default', '@neo-opus-ada', {appName: 'Claude', defaultInstance: true, routeResolution: 'default-instance'});

            const audit = auditWakeRoutes(db);
            expect(audit.genericNamedPeer.length).toBe(0);
            expect(audit.defaultInstance).toEqual([{id: 'WAKE_SUB:default', agentIdentity: '@neo-opus-ada', appName: 'Claude'}]);
        });

        test('does not flag an instance-addressed route', () => {
            const db = new Database(':memory:');
            createGraphSchema(db);
            insertSub(db, 'WAKE_SUB:safe', '@neo-opus-ada', {appName: 'Claude', addressType: 'userDataDir', instanceAddress: '/Users/x/.claude-ada'});

            const audit = auditWakeRoutes(db);
            expect(audit.emptyAddress.length).toBe(0);
            expect(audit.genericNamedPeer.length).toBe(0);
            expect(audit.scanned).toBe(1);
        });

        test('does not flag a generic route owned by a non-roster identity', () => {
            const db = new Database(':memory:');
            createGraphSchema(db);
            insertSub(db, 'WAKE_SUB:alice', '@alice', {appName: 'Claude'});

            const audit = auditWakeRoutes(db);
            expect(audit.genericNamedPeer.length).toBe(0);
            expect(audit.emptyAddress.length).toBe(0);
        });

        test('treats a legacy userDataDir field as a resolvable address (not flagged)', () => {
            const db = new Database(':memory:');
            createGraphSchema(db);
            insertSub(db, 'WAKE_SUB:legacy', '@neo-opus-ada', {appName: 'Claude', userDataDir: '/Users/x/.claude-ada'});

            const audit = auditWakeRoutes(db);
            expect(audit.emptyAddress.length).toBe(0);
            expect(audit.genericNamedPeer.length).toBe(0);
        });
    });
});
