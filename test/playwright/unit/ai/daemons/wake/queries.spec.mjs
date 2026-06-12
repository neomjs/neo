import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { getLastSyncId, getUnreadSunsetHandovers, markNodesAsRead, writeLastSyncId } from '../../../../../../ai/daemons/wake/queries.mjs';

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

    test.describe('getLastSyncId / writeLastSyncId (resume cursor)', () => {
        let tmpDir, stateFile;

        test.beforeEach(() => {
            // GraphLog is the MAX(log_id) source for the fail-to-the-tip fallback.
            // The outer beforeEach already created `db`; add the cursor source here.
            db.exec(`
                CREATE TABLE GraphLog (
                    log_id      INTEGER PRIMARY KEY,
                    entity_id   TEXT,
                    entity_type TEXT
                )
            `);
            tmpDir    = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-cursor-'));
            stateFile = path.join(tmpDir, 'lastSyncId');
        });

        test.afterEach(() => {
            try { fs.removeSync(tmpDir); } catch (e) {}
        });

        const seedLog = maxId => {
            const stmt = db.prepare('INSERT INTO GraphLog (log_id, entity_id, entity_type) VALUES (?, ?, ?)');
            for (let id = 1; id <= maxId; id++) {
                stmt.run(id, `n-${id}`, 'nodes');
            }
        };

        test.describe('getLastSyncId', () => {
            test('missing cursor file → MAX(log_id) (resume at tip, skip backlog)', () => {
                seedLog(42);
                expect(getLastSyncId(db, stateFile)).toBe(42);
            });

            test('empty cursor file → MAX(log_id), NOT 0 (prevents full-backlog flood)', () => {
                seedLog(42);
                fs.writeFileSync(stateFile, '', 'utf8');
                expect(getLastSyncId(db, stateFile)).toBe(42);
            });

            test('corrupt (non-numeric) cursor file → MAX(log_id), NOT 0', () => {
                seedLog(99);
                fs.writeFileSync(stateFile, 'not-a-number', 'utf8');
                expect(getLastSyncId(db, stateFile)).toBe(99);
            });

            test('negative cursor value → MAX(log_id) (negative is corruption, not a replay)', () => {
                seedLog(99);
                fs.writeFileSync(stateFile, '-5', 'utf8');
                expect(getLastSyncId(db, stateFile)).toBe(99);
            });

            test('valid positive cursor is preserved', () => {
                seedLog(99);
                fs.writeFileSync(stateFile, '42', 'utf8');
                expect(getLastSyncId(db, stateFile)).toBe(42);
            });

            test('valid 0 cursor is preserved (not treated as corruption)', () => {
                seedLog(99);
                fs.writeFileSync(stateFile, '0', 'utf8');
                expect(getLastSyncId(db, stateFile)).toBe(0);
            });

            test('empty cursor + empty log → 0 (nothing to replay)', () => {
                fs.writeFileSync(stateFile, '', 'utf8');
                expect(getLastSyncId(db, stateFile)).toBe(0);
            });
        });

        test.describe('writeLastSyncId', () => {
            test('persists the cursor value (readable back)', () => {
                writeLastSyncId(stateFile, 137);
                expect(fs.readFileSync(stateFile, 'utf8')).toBe('137');
            });

            test('round-trips through getLastSyncId', () => {
                seedLog(500);
                writeLastSyncId(stateFile, 137);
                expect(getLastSyncId(db, stateFile)).toBe(137);
            });

            test('overwrites an existing cursor and leaves no .tmp residue', () => {
                writeLastSyncId(stateFile, 1);
                writeLastSyncId(stateFile, 2);
                expect(fs.readFileSync(stateFile, 'utf8')).toBe('2');
                expect(fs.existsSync(`${stateFile}.tmp`)).toBe(false);
            });
        });
    });
});
