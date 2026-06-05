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
import {execFileSync} from 'node:child_process';
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

test.describe('ai/scripts/migrations/renameAgentIdentities', () => {
    test('stale versioned handles are confined to the migration runner and its fixtures', () => {
        const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../../..');
        let output = '';

        try {
            output = execFileSync('rg', [
                '-l',
                'neo-opus-4-7|neo-gemini-3-1-pro|neo_opus_4_7|neo_gemini_3_1_pro',
                '--glob', '!resources/content/**',
                '--glob', '!learn/agentos/incidents/**',
                '--glob', '!learn/agentos/measurements/**',
                '--glob', '!learn/agentos/decisions/**',
                '--glob', '!node_modules/**',
                '--glob', '!dist/**',
                'ai',
                '.github',
                'README.md',
                'AGENTS.md',
                'AGENTS_STARTUP.md',
                'learn',
                'test/playwright/unit/ai/mcp/server/shared/services/RequestContextService.spec.mjs',
                'test/playwright/unit/ai/scripts/lifecycle/resumeHarness.spec.mjs',
                'test/playwright/unit/ai/scripts/migrations/renameAgentIdentities.spec.mjs'
            ], {
                cwd     : repoRoot,
                encoding: 'utf8'
            });
        } catch (e) {
            // ripgrep exits 1 when no files match. That is an even stricter pass condition here.
            if (e.status !== 1) throw e;
            output = e.stdout || '';
        }

        const allowed = new Set([
            'ai/scripts/migrations/renameAgentIdentities.mjs',
            'test/playwright/unit/ai/scripts/migrations/renameAgentIdentities.spec.mjs'
        ]);
        const unexpected = output
            .trim()
            .split('\n')
            .filter(Boolean)
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

        expect(result.id).toBe('@neo-opus');
        expect(result.properties.agentIdentity).toBe('@neo-opus');
        expect(result.properties.participatingAgents).toBe('@neo-opus, @neo-gemini-pro');
        expect(result.properties.requiredGithubLogin).toBe('@neo-gemini-pro');
        expect(result.properties.sourceAgentIdentities).toEqual(['@neo-opus', '@neo-gpt']);
        expect(result.properties.userId).toBe('neo-opus');

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
            id     : '@neo-opus',
            user_id: 'neo-opus',
            data   : {
                id        : '@neo-opus',
                label     : 'AgentIdentity',
                properties: {
                    createdAt  : '2026-06-05T00:00:00.000Z',
                    githubLogin: '@neo-opus',
                    userId     : 'neo-opus'
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
            source: '@neo-opus',
            target: '@neo-gpt',
            type  : 'SENT_TO',
            data  : {
                id        : 'edge-canonical-duplicate',
                source    : '@neo-opus',
                target    : '@neo-gpt',
                type      : 'SENT_TO',
                properties: {userId: 'neo-opus'}
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

        const canonical = JSON.parse(db.prepare('SELECT data FROM Nodes WHERE id = ?').get('@neo-opus').data);
        expect(canonical.properties.githubLogin).toBe('@neo-opus');
        expect(canonical.properties.createdAt).toBe('2026-01-01T00:00:00.000Z');

        expect(db.prepare('SELECT id FROM Edges WHERE id = ?').get('edge-old-duplicate')).toBeUndefined();

        const inbound = db.prepare('SELECT user_id, source, target, data FROM Edges WHERE id = ?').get('edge-inbound');
        expect(inbound.user_id).toBe('neo-opus');
        expect(inbound.source).toBe('@neo-gpt');
        expect(inbound.target).toBe('@neo-opus');

        const inboundData = JSON.parse(inbound.data);
        expect(inboundData.target).toBe('@neo-opus');
        expect(inboundData.properties.userId).toBe('neo-opus');
        expect(inboundData.properties.bodyText).toBe('edge prose keeps @neo-opus-4-7');

        const message = db.prepare('SELECT user_id, data FROM Nodes WHERE id = ?').get('MESSAGE:1');
        expect(message.user_id).toBe('neo-opus');

        const messageData = JSON.parse(message.data);
        expect(messageData.properties.sentBy).toBe('@neo-opus');
        expect(messageData.properties.userId).toBe('neo-opus');
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
                participatingAgents: '@neo-opus,@neo-gpt',
                userId             : 'neo-opus'
            }
        });
    });
});
