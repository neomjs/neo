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

        insertNode(db, {
            id  : '@neo-gpt',
            data: {
                id        : '@neo-gpt',
                label     : 'AgentIdentity',
                properties: {
                    subscriptionTemplate: {
                        trigger: 'SENT_TO_ME',
                        harnessTarget: 'bridge-daemon',
                        harnessTargetMetadata: {
                            appName: 'Codex'
                        }
                    }
                }
            }
        });
        insertNode(db, {
            id  : 'WAKE_SUB:codex-legacy',
            data: {
                id        : 'WAKE_SUB:codex-legacy',
                label     : 'WAKE_SUBSCRIPTION',
                properties: {
                    agentIdentity: '@neo-gpt',
                    trigger: 'SENT_TO_ME',
                    harnessTarget: 'bridge-daemon',
                    harnessTargetMetadata: {
                        appName: 'Codex',
                        focusSeedKey: 'r'
                    },
                    status: 'active'
                }
            }
        });

        const stats = runMigration(db, true);
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

        insertNode(db, {
            id  : '@neo-gpt',
            data: {
                id        : '@neo-gpt',
                label     : 'AgentIdentity',
                properties: {
                    subscriptionTemplate: {
                        trigger: 'SENT_TO_ME',
                        harnessTarget: 'bridge-daemon',
                        harnessTargetMetadata: {
                            adapter: 'codex-app-server',
                            appName: 'Codex',
                            tabShortcut: null
                        }
                    }
                }
            }
        });
        insertNode(db, {
            id  : 'WAKE_SUB:codex-dry-run',
            data: {
                id        : 'WAKE_SUB:codex-dry-run',
                label     : 'WAKE_SUBSCRIPTION',
                properties: {
                    agentIdentity: '@neo-gpt',
                    trigger: 'SENT_TO_ME',
                    harnessTarget: 'bridge-daemon',
                    harnessTargetMetadata: {
                        appName: 'Codex'
                    },
                    status: 'active'
                }
            }
        });

        const stats = runMigration(db, false);
        const unchanged = getNode(db, 'WAKE_SUB:codex-dry-run');

        expect(stats.subscriptionsPatched).toBe(1);
        expect(unchanged.properties.harnessTargetMetadata).toEqual({
            appName: 'Codex'
        });
    });

    test.describe('auditWakeRoutes (read-only #13481 audit)', () => {
        const insertSub = (db, id, agentIdentity, harnessTargetMetadata) => insertNode(db, {
            id,
            data: {
                id,
                label     : 'WAKE_SUBSCRIPTION',
                properties: {agentIdentity, trigger: 'SENT_TO_ME', harnessTarget: 'bridge-daemon', harnessTargetMetadata, status: 'active'}
            }
        });

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
