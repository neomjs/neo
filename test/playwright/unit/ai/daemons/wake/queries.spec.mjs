import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import { getUnreadSunsetHandovers, markNodesAsRead } from '../../../../../../ai/daemons/wake/queries.mjs';

test.describe('ai/daemons/wake/queries', () => {
    let db;

    test.beforeEach(() => {
        // We use an in-memory database for testing the pure query logic
        db = new Database(':memory:');
        db.exec(`
            CREATE TABLE Nodes (
                id TEXT PRIMARY KEY,
                data TEXT
            )
        `);
    });

    test.afterEach(() => {
        if (db) {
            try { db.close(); } catch (e) {}
        }
    });

    test.describe('getUnreadSunsetHandovers', () => {
        test('finds unread MESSAGE nodes tagged with sunset-protocol-handover', () => {
            const messageData = {
                type: 'MESSAGE',
                properties: {
                    taggedConcepts: ['sunset-protocol-handover', 'other-concept']
                }
            };
            db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run('msg-1', JSON.stringify(messageData));

            const results = getUnreadSunsetHandovers(db);
            expect(results.length).toBe(1);
            expect(results[0].type).toBe('MESSAGE');
        });

        test('ignores read MESSAGE nodes', () => {
            const messageData = {
                type: 'MESSAGE',
                properties: {
                    readAt: new Date().toISOString(),
                    taggedConcepts: ['sunset-protocol-handover']
                }
            };
            db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run('msg-1', JSON.stringify(messageData));

            const results = getUnreadSunsetHandovers(db);
            expect(results.length).toBe(0);
        });

        test('ignores nodes without the taggedConcept', () => {
            const messageData = {
                type: 'MESSAGE',
                properties: {
                    taggedConcepts: ['some-other-concept']
                }
            };
            db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run('msg-1', JSON.stringify(messageData));

            const results = getUnreadSunsetHandovers(db);
            expect(results.length).toBe(0);
        });

        test('ignores non-MESSAGE nodes', () => {
            const nodeData = {
                type: 'EPISODIC',
                properties: {
                    taggedConcepts: ['sunset-protocol-handover']
                }
            };
            db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run('msg-1', JSON.stringify(nodeData));

            const results = getUnreadSunsetHandovers(db);
            expect(results.length).toBe(0);
        });
    });

    test.describe('markNodesAsRead', () => {
        test('updates readAt for provided nodes', () => {
            const node = {
                id: 'msg-1',
                type: 'MESSAGE',
                properties: {
                    taggedConcepts: ['sunset-protocol-handover']
                }
            };
            db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(node.id, JSON.stringify(node));

            markNodesAsRead(db, [node]);

            const row = db.prepare('SELECT data FROM Nodes WHERE id = ?').get('msg-1');
            const updatedNode = JSON.parse(row.data);

            expect(updatedNode.properties.readAt).toBeDefined();
            expect(new Date(updatedNode.properties.readAt).getTime()).not.toBeNaN();
        });

        test('handles empty array gracefully', () => {
            expect(() => markNodesAsRead(db, [])).not.toThrow();
        });
    });
});
