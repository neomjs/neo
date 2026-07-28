import {test, expect} from '@playwright/test';
import Database       from 'better-sqlite3';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {
    inspectMailboxReadState,
    parseArgs,
    runCli
} from '../../../../../../ai/scripts/diagnostics/mailboxReadStateProbe.mjs';

/**
 * The read-state probe exists to distinguish a lost receipt from looking at the wrong carrier.
 * These tests therefore build real SQLite graph rows for both carrier shapes and retain the
 * negative controls: a direct message has no delivery edge, while a broadcast recipient must.
 */
test.describe.configure({mode: 'serial'});

test.describe('mailboxReadStateProbe — carrier-first durable read-state classification', () => {
    let db, dbPath, workRoot;

    /**
     * @summary Inserts one graph node using the production SQLite JSON shape.
     * @param {Object} node Graph node.
     * @returns {void}
     */
    function insertNode(node) {
        db.prepare('INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?)')
            .run(node.id, node.properties?.userId || null, JSON.stringify(node));
    }

    /**
     * @summary Inserts one graph edge using the production SQLite JSON shape.
     * @param {Object} edge Graph edge.
     * @returns {void}
     */
    function insertEdge(edge) {
        db.prepare('INSERT INTO Edges (id, user_id, source, target, type, data) VALUES (?, ?, ?, ?, ?, ?)')
            .run(
                edge.id,
                edge.properties?.userId || null,
                edge.source,
                edge.target,
                edge.type,
                JSON.stringify(edge)
            );
    }

    /**
     * @summary Inserts one MESSAGE row with an explicit direct-carrier `readAt` value.
     * @param {*} readAt Null or an ISO timestamp.
     * @param {Object} [overrides] Message record overrides.
     * @returns {Object}
     */
    function insertMessage(readAt=null, overrides={}) {
        const message = {
            id        : 'MESSAGE:probe',
            label     : 'MESSAGE',
            properties: {
                subject: 'probe',
                readAt
            },
            ...overrides
        };

        insertNode(message);
        return message
    }

    /**
     * @summary Inserts one SENT_TO or DELIVERED_TO edge for the probe message.
     * @param {Object} options
     * @param {String} options.id Edge id.
     * @param {String} options.target Edge target.
     * @param {String} options.type Edge type.
     * @param {Object} [options.properties] Edge properties.
     * @returns {Object}
     */
    function insertRoute({id, target, type, properties={}}) {
        const edge = {
            id,
            source: 'MESSAGE:probe',
            target,
            type,
            properties
        };

        insertEdge(edge);
        return edge
    }

    /**
     * @summary Runs the probe against the current temporary database and canonical recipient.
     * @returns {Object}
     */
    function inspect() {
        db.close();
        db = null;

        return inspectMailboxReadState({
            dbPath,
            messageId: 'MESSAGE:probe',
            recipient: '@neo-gpt'
        })
    }

    test.beforeEach(() => {
        workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-mailbox-read-state-'));
        dbPath   = path.join(workRoot, 'graph.sqlite');
        db       = new Database(dbPath);

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
                data TEXT NOT NULL
            );
        `);
    });

    test.afterEach(() => {
        db?.close();
        fs.rmSync(workRoot, {recursive: true, force: true});
    });

    test('requires all three explicit CLI inputs', () => {
        expect(() => parseArgs(['--db-path', dbPath])).toThrow(/--message-id/);
        expect(() => parseArgs([
            '--db-path', dbPath,
            '--message-id', 'MESSAGE:probe',
            '--recipient', '@neo-gpt'
        ])).not.toThrow();
    });

    test('reports a missing MESSAGE row separately from a missing recipient carrier', () => {
        const result = inspect();

        expect(result).toMatchObject({
            ok     : true,
            state  : 'message-missing',
            route  : null,
            carrier: null
        });
    });

    test('classifies a direct MESSAGE with readAt:null as unread without inventing a delivery edge', () => {
        insertMessage(null);
        insertRoute({id: 'EDGE:sent-to', target: '@neo-gpt', type: 'SENT_TO'});

        const result = inspect();

        expect(result).toMatchObject({
            ok     : true,
            state  : 'unread',
            route  : 'direct',
            carrier: {
                kind  : 'MESSAGE',
                rowId : 'MESSAGE:probe',
                readAt: null
            }
        });
    });

    test('classifies a direct MESSAGE timestamp from the node carrier', () => {
        insertMessage('2026-07-28T08:00:00.000Z');
        insertRoute({id: 'EDGE:sent-to', target: 'neo-gpt', type: 'SENT_TO'});

        expect(inspect()).toMatchObject({
            ok     : true,
            state  : 'read',
            route  : 'direct',
            carrier: {
                kind  : 'MESSAGE',
                readAt: '2026-07-28T08:00:00.000Z'
            }
        });
    });

    for (const [label, target] of [
        ['padded', '  @neo-gpt  '],
        ['multi-@', '@@@@neo-gpt']
    ]) {
        test(`matches a ${label} direct target using the production identity comparison`, () => {
            insertMessage(null);
            insertRoute({id: 'EDGE:sent-to', target, type: 'SENT_TO'});

            expect(inspect()).toMatchObject({
                ok     : true,
                state  : 'unread',
                route  : 'direct',
                carrier: {
                    kind : 'MESSAGE',
                    rowId: 'MESSAGE:probe'
                }
            });
        });
    }

    test('classifies a receipt-backed broadcast with delivery readAt:null as unread', () => {
        insertMessage(null);
        insertRoute({id: 'EDGE:broadcast', target: 'AGENT:*', type: 'SENT_TO'});
        insertRoute({
            id        : 'EDGE:delivery',
            target    : '@neo-gpt',
            type      : 'DELIVERED_TO',
            properties: {readAt: null}
        });

        expect(inspect()).toMatchObject({
            ok     : true,
            state  : 'unread',
            route  : 'broadcast',
            carrier: {
                kind     : 'DELIVERED_TO',
                rowId    : 'EDGE:delivery',
                recipient: '@neo-gpt',
                readAt   : null
            }
        });
    });

    test('classifies a receipt-backed broadcast timestamp from the recipient edge', () => {
        insertMessage(null);
        insertRoute({id: 'EDGE:broadcast', target: 'AGENT:*', type: 'SENT_TO'});
        insertRoute({
            id        : 'EDGE:delivery',
            target    : 'AGENT:neo-gpt',
            type      : 'DELIVERED_TO',
            properties: {readAt: '2026-07-28T08:01:00.000Z'}
        });

        expect(inspect()).toMatchObject({
            ok     : true,
            state  : 'read',
            route  : 'broadcast',
            carrier: {
                kind  : 'DELIVERED_TO',
                readAt: '2026-07-28T08:01:00.000Z'
            }
        });
    });

    for (const [label, target] of [
        ['padded', '  @neo-gpt  '],
        ['multi-@', '@@@@neo-gpt']
    ]) {
        test(`matches a ${label} broadcast receipt using the production identity comparison`, () => {
            insertMessage(null);
            insertRoute({id: 'EDGE:broadcast', target: 'AGENT:*', type: 'SENT_TO'});
            insertRoute({
                id        : 'EDGE:delivery',
                target,
                type      : 'DELIVERED_TO',
                properties: {readAt: null}
            });

            expect(inspect()).toMatchObject({
                ok     : true,
                state  : 'unread',
                route  : 'broadcast',
                carrier: {
                    kind     : 'DELIVERED_TO',
                    rowId    : 'EDGE:delivery',
                    recipient: '@neo-gpt'
                }
            });
        });
    }

    test('reports a broadcast with no affected-recipient delivery edge as carrier missing, not unread', () => {
        insertMessage(null);
        insertRoute({id: 'EDGE:broadcast', target: 'AGENT:*', type: 'SENT_TO'});
        insertRoute({
            id        : 'EDGE:other-delivery',
            target    : '@neo-opus-vega',
            type      : 'DELIVERED_TO',
            properties: {readAt: null}
        });

        expect(inspect()).toMatchObject({
            ok     : true,
            state  : 'recipient-carrier-missing',
            route  : 'broadcast',
            carrier: {
                kind     : 'DELIVERED_TO',
                rowId    : null,
                recipient: '@neo-gpt'
            }
        });
    });

    test('reports absent readAt as malformed instead of silently folding it into unread', () => {
        insertMessage(null, {
            properties: {
                subject: 'probe'
            }
        });
        insertRoute({id: 'EDGE:sent-to', target: '@neo-gpt', type: 'SENT_TO'});

        expect(inspect()).toMatchObject({
            ok   : true,
            state: 'malformed-storage',
            route: 'direct'
        });
    });

    test('reports malformed graph JSON without throwing or mutating the file', () => {
        db.prepare('INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?)')
            .run('MESSAGE:probe', null, '{"id":"MESSAGE:probe",');
        insertRoute({id: 'EDGE:sent-to', target: '@neo-gpt', type: 'SENT_TO'});

        expect(inspect()).toMatchObject({
            ok   : true,
            state: 'malformed-storage',
            route: null
        });
    });

    test('reports a direct plus broadcast route as conflicting storage', () => {
        insertMessage(null);
        insertRoute({id: 'EDGE:direct', target: '@neo-gpt', type: 'SENT_TO'});
        insertRoute({id: 'EDGE:broadcast', target: 'AGENT:*', type: 'SENT_TO'});

        expect(inspect()).toMatchObject({
            ok   : true,
            state: 'conflicting-storage',
            route: null
        });
    });

    test('reports any delivery cohort on a direct route as conflicting storage', () => {
        insertMessage(null);
        insertRoute({id: 'EDGE:direct', target: '@neo-gpt', type: 'SENT_TO'});
        insertRoute({
            id        : 'EDGE:wrong-delivery',
            target    : '@neo-opus-vega',
            type      : 'DELIVERED_TO',
            properties: {readAt: null}
        });

        expect(inspect()).toMatchObject({
            ok   : true,
            state: 'conflicting-storage',
            route: 'direct'
        });
    });

    test('reports duplicate recipient delivery carriers as conflicting storage', () => {
        insertMessage(null);
        insertRoute({id: 'EDGE:broadcast', target: 'AGENT:*', type: 'SENT_TO'});
        insertRoute({
            id        : 'EDGE:delivery-1',
            target    : '@neo-gpt',
            type      : 'DELIVERED_TO',
            properties: {readAt: null}
        });
        insertRoute({
            id        : 'EDGE:delivery-2',
            target    : 'neo-gpt',
            type      : 'DELIVERED_TO',
            properties: {readAt: '2026-07-28T08:02:00.000Z'}
        });

        expect(inspect()).toMatchObject({
            ok   : true,
            state: 'conflicting-storage',
            route: 'broadcast'
        });
    });

    test('reports input and open failures as failed executions', () => {
        const invalidInput = inspectMailboxReadState({
            dbPath,
            messageId: 'not-a-message',
            recipient: '@neo-gpt'
        });
        const missingDb = inspectMailboxReadState({
            dbPath   : path.join(workRoot, 'missing.sqlite'),
            messageId: 'MESSAGE:probe',
            recipient: '@neo-gpt'
        });

        expect(invalidInput).toMatchObject({ok: false, state: 'input-error'});
        expect(missingDb).toMatchObject({ok: false, state: 'open-error'});
    });

    test('leaves the SQLite file byte-identical after a successful inspection', () => {
        insertMessage('2026-07-28T08:03:00.000Z');
        insertRoute({id: 'EDGE:sent-to', target: '@neo-gpt', type: 'SENT_TO'});
        db.close();
        db = null;

        const before = fs.readFileSync(dbPath),
            result   = inspectMailboxReadState({
                dbPath,
                messageId: 'MESSAGE:probe',
                recipient: '@neo-gpt'
            }),
            after = fs.readFileSync(dbPath);

        expect(result.state).toBe('read');
        expect(after.equals(before)).toBe(true);
    });

    test('CLI returns zero for a completed anomaly observation and one for an execution failure', () => {
        insertMessage(null);
        insertRoute({id: 'EDGE:broadcast', target: 'AGENT:*', type: 'SENT_TO'});
        db.close();
        db = null;

        const stdout = [],
            stderr   = [],
            okCode   = runCli([
                '--db-path', dbPath,
                '--message-id', 'MESSAGE:probe',
                '--recipient', '@neo-gpt'
            ], {
                stdout: value => stdout.push(value),
                stderr: value => stderr.push(value)
            }),
            errorCode = runCli([], {
                stdout: value => stdout.push(value),
                stderr: value => stderr.push(value)
            });

        expect(okCode).toBe(0);
        expect(JSON.parse(stdout[0])).toMatchObject({
            ok   : true,
            state: 'recipient-carrier-missing'
        });
        expect(errorCode).toBe(1);
        expect(JSON.parse(stderr[0])).toMatchObject({
            ok   : false,
            state: 'input-error'
        });
    });
});
