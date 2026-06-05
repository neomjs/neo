import {setup} from '../../../../setup.mjs';

const appName = 'RenameAgentIdentitiesMigrationTest';

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
import {lstatSync, readdirSync, readFileSync} from 'node:fs';
import path           from 'node:path';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {
    findChromaMetadataUpdates,
    rewriteIdentityFields,
    runGraphMigration
} from '../../../../../../ai/scripts/migrations/renameAgentIdentities.mjs';

/**
 * @summary Creates the minimal SQLite graph schema used by the identity rename runner.
 * @param {Object} db Open better-sqlite3 connection.
 */
function createGraphSchema(db) {
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
}

/**
 * @summary Inserts one graph node fixture into the in-memory database.
 * @param {Object} db Open better-sqlite3 connection.
 * @param {Object} node Node row.
 */
function insertNode(db, node) {
    db.prepare('INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?)')
        .run(node.id, node.user_id || null, JSON.stringify(node.data));
}

/**
 * @summary Inserts one graph edge fixture into the in-memory database.
 * @param {Object} db Open better-sqlite3 connection.
 * @param {Object} edge Edge row.
 */
function insertEdge(db, edge) {
    db.prepare('INSERT INTO Edges (id, user_id, source, target, type, data) VALUES (?, ?, ?, ?, ?, ?)')
        .run(edge.id, edge.user_id || null, edge.source, edge.target, edge.type, JSON.stringify(edge.data));
}

/**
 * @summary Returns a POSIX-style path relative to the repository root.
 * @param {String} repoRoot Absolute repository root.
 * @param {String} filePath Absolute file path.
 * @returns {String} Repository-relative path.
 */
function getRelativePath(repoRoot, filePath) {
    return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

/**
 * @summary Determines whether a repository-relative path is outside the current-contract scan.
 * @param {String} relativePath Repository-relative path.
 * @returns {Boolean} True when the path should be skipped.
 */
function isExcludedPath(relativePath) {
    return [
        'resources/content/',
        'learn/agentos/incidents/',
        'learn/agentos/measurements/',
        'learn/agentos/decisions/',
        'node_modules/',
        'dist/'
    ].some(prefix => relativePath === prefix.slice(0, -1) || relativePath.startsWith(prefix));
}

/**
 * @summary Scans selected repository paths for stale versioned identity handles.
 * @param {String} repoRoot Absolute repository root.
 * @param {String[]} entries Repository-relative files or directories to scan.
 * @param {RegExp} pattern Pattern to find.
 * @returns {String[]} Repository-relative files containing the pattern.
 */
function findFilesContaining(repoRoot, entries, pattern) {
    const matches = [];

    const visit = (filePath) => {
        const relativePath = getRelativePath(repoRoot, filePath);
        if (isExcludedPath(relativePath)) return;

        const stat = lstatSync(filePath);
        if (stat.isDirectory()) {
            for (const entry of readdirSync(filePath)) {
                visit(path.join(filePath, entry));
            }
            return;
        }
        if (!stat.isFile()) return;

        try {
            if (pattern.test(readFileSync(filePath, 'utf8'))) {
                matches.push(relativePath);
            }
        } catch (e) {
            // Non-text files inside broad roots are irrelevant to this identity-contract guard.
        }
    };

    for (const entry of entries) {
        visit(path.join(repoRoot, entry));
    }

    return matches;
}

test.describe('ai/scripts/migrations/renameAgentIdentities', () => {
    test('stale versioned handles are confined to the migration runner and its fixtures', () => {
        const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../../..');
        const output = findFilesContaining(repoRoot, [
            'ai',
            '.github',
            'README.md',
            'AGENTS.md',
            'AGENTS_STARTUP.md',
            'learn',
            'test/playwright/unit/ai/mcp/server/shared/services/RequestContextService.spec.mjs',
            'test/playwright/unit/ai/scripts/lifecycle/resumeHarness.spec.mjs',
            'test/playwright/unit/ai/scripts/migrations/renameAgentIdentities.spec.mjs'
        ], /neo-opus-4-7|neo-gemini-3-1-pro|neo_opus_4_7|neo_gemini_3_1_pro/);

        const allowed = new Set([
            'ai/scripts/migrations/renameAgentIdentities.mjs',
            'test/playwright/unit/ai/scripts/migrations/renameAgentIdentities.spec.mjs'
        ]);
        const unexpected = output
            .filter(file => !allowed.has(file));

        expect(unexpected).toEqual([]);
    });

    test('rewrites identity metadata without rewriting message/document prose', () => {
        const source = {
            id        : '@neo-opus-4-7',
            label     : 'MESSAGE',
            properties: {
                agentIdentity       : '@neo-opus-4-7',
                bodyText            : 'historical body mentions @neo-opus-4-7',
                participatingAgents : '@neo-opus-4-7, @neo-gemini-3-1-pro',
                requiredGithubLogin : '@neo-gemini-3-1-pro',
                sourceAgentIdentities: ['@neo-opus-4-7', '@neo-gpt'],
                subject             : 'historical subject mentions @neo-gemini-3-1-pro',
                userId              : 'neo-opus-4-7'
            }
        };

        const result = rewriteIdentityFields(source);

        expect(result.id).toBe('@neo-opus-ada');
        expect(result.properties.agentIdentity).toBe('@neo-opus-ada');
        expect(result.properties.participatingAgents).toBe('@neo-opus-ada, @neo-gemini-pro');
        expect(result.properties.requiredGithubLogin).toBe('@neo-gemini-pro');
        expect(result.properties.sourceAgentIdentities).toEqual(['@neo-opus-ada', '@neo-gpt']);
        expect(result.properties.userId).toBe('neo-opus-ada');

        // Historical prose is intentionally preserved; only identity-keyed metadata changes.
        expect(result.properties.bodyText).toBe('historical body mentions @neo-opus-4-7');
        expect(result.properties.subject).toBe('historical subject mentions @neo-gemini-3-1-pro');
    });

    test('merges old graph identity nodes, rewrites edges, drops duplicate edges, and preserves createdAt', () => {
        const db = new Database(':memory:');
        createGraphSchema(db);

        insertNode(db, {
            id     : '@neo-opus-4-7',
            user_id: 'neo-opus-4-7',
            data   : {
                id        : '@neo-opus-4-7',
                label     : 'AgentIdentity',
                properties: {
                    createdAt  : '2026-01-01T00:00:00.000Z',
                    githubLogin: '@neo-opus-4-7',
                    userId     : 'neo-opus-4-7'
                }
            }
        });
        insertNode(db, {
            id     : '@neo-opus-ada',
            user_id: 'neo-opus-ada',
            data   : {
                id        : '@neo-opus-ada',
                label     : 'AgentIdentity',
                properties: {
                    createdAt  : '2026-06-05T00:00:00.000Z',
                    githubLogin: '@neo-opus-ada',
                    userId     : 'neo-opus-ada'
                }
            }
        });
        insertNode(db, {
            id  : '@neo-gpt',
            data: {
                id        : '@neo-gpt',
                label     : 'AgentIdentity',
                properties: {githubLogin: '@neo-gpt'}
            }
        });
        insertNode(db, {
            id     : 'MESSAGE:1',
            user_id: 'neo-opus-4-7',
            data   : {
                id        : 'MESSAGE:1',
                label     : 'MESSAGE',
                properties: {
                    bodyText: 'history keeps @neo-opus-4-7 in prose',
                    sentBy  : '@neo-opus-4-7',
                    userId  : 'neo-opus-4-7'
                }
            }
        });

        insertEdge(db, {
            id     : 'edge-old-duplicate',
            user_id: 'neo-opus-4-7',
            source : '@neo-opus-4-7',
            target : '@neo-gpt',
            type   : 'SENT_TO',
            data   : {
                id        : 'edge-old-duplicate',
                source    : '@neo-opus-4-7',
                target    : '@neo-gpt',
                type      : 'SENT_TO',
                properties: {userId: 'neo-opus-4-7'}
            }
        });
        insertEdge(db, {
            id    : 'edge-canonical-duplicate',
            source: '@neo-opus-ada',
            target: '@neo-gpt',
            type  : 'SENT_TO',
            data  : {
                id        : 'edge-canonical-duplicate',
                source    : '@neo-opus-ada',
                target    : '@neo-gpt',
                type      : 'SENT_TO',
                properties: {userId: 'neo-opus-ada'}
            }
        });
        insertEdge(db, {
            id     : 'edge-inbound',
            user_id: 'neo-opus-4-7',
            source : '@neo-gpt',
            target : '@neo-opus-4-7',
            type   : 'MENTIONS',
            data   : {
                id        : 'edge-inbound',
                source    : '@neo-gpt',
                target    : '@neo-opus-4-7',
                type      : 'MENTIONS',
                properties: {
                    bodyText: 'edge prose keeps @neo-opus-4-7',
                    userId  : 'neo-opus-4-7'
                }
            }
        });

        const dryRunStats = runGraphMigration(db, false);
        expect(dryRunStats.nodesMerged).toBe(1);
        expect(dryRunStats.edgesDropped).toBe(1);
        expect(db.prepare('SELECT id FROM Nodes WHERE id = ?').get('@neo-opus-4-7')).toBeTruthy();

        const stats = runGraphMigration(db, true);
        expect(stats.nodesMerged).toBe(1);
        expect(stats.nodesDeleted).toBe(1);
        expect(stats.edgesDropped).toBe(1);
        expect(stats.edgesRewritten).toBe(1);

        expect(db.prepare('SELECT id FROM Nodes WHERE id = ?').get('@neo-opus-4-7')).toBeUndefined();

        const canonical = JSON.parse(db.prepare('SELECT data FROM Nodes WHERE id = ?').get('@neo-opus-ada').data);
        expect(canonical.properties.githubLogin).toBe('@neo-opus-ada');
        expect(canonical.properties.createdAt).toBe('2026-01-01T00:00:00.000Z');

        expect(db.prepare('SELECT id FROM Edges WHERE id = ?').get('edge-old-duplicate')).toBeUndefined();

        const inbound = db.prepare('SELECT user_id, source, target, data FROM Edges WHERE id = ?').get('edge-inbound');
        expect(inbound.user_id).toBe('neo-opus-ada');
        expect(inbound.source).toBe('@neo-gpt');
        expect(inbound.target).toBe('@neo-opus-ada');

        const inboundData = JSON.parse(inbound.data);
        expect(inboundData.target).toBe('@neo-opus-ada');
        expect(inboundData.properties.userId).toBe('neo-opus-ada');
        expect(inboundData.properties.bodyText).toBe('edge prose keeps @neo-opus-4-7');

        const message = db.prepare('SELECT user_id, data FROM Nodes WHERE id = ?').get('MESSAGE:1');
        expect(message.user_id).toBe('neo-opus-ada');

        const messageData = JSON.parse(message.data);
        expect(messageData.properties.sentBy).toBe('@neo-opus-ada');
        expect(messageData.properties.userId).toBe('neo-opus-ada');
        expect(messageData.properties.bodyText).toBe('history keeps @neo-opus-4-7 in prose');

        db.close();
    });

    test('findChromaMetadataUpdates rewrites metadata only', async () => {
        const collection = {
            async get({offset}) {
                if (offset > 0) {
                    return {ids: [], metadatas: []};
                }
                return {
                    ids      : ['memory-1', 'memory-2'],
                    metadatas: [
                        {
                            bodyText           : 'document prose keeps @neo-gemini-3-1-pro',
                            participatingAgents: '@neo-opus-4-7,@neo-gpt',
                            userId             : 'neo-opus-4-7'
                        },
                        {
                            participatingAgents: '@neo-gpt',
                            userId             : 'neo-gpt'
                        }
                    ]
                };
            }
        };

        const result = await findChromaMetadataUpdates(collection);

        expect(result.scanned).toBe(2);
        expect(result.updates).toHaveLength(1);
        expect(result.updates[0]).toEqual({
            id      : 'memory-1',
            metadata: {
                bodyText           : 'document prose keeps @neo-gemini-3-1-pro',
                participatingAgents: '@neo-opus-ada,@neo-gpt',
                userId             : 'neo-opus-ada'
            }
        });
    });
});
