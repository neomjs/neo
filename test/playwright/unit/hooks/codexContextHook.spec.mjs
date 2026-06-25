import {test, expect} from '@playwright/test';
import Database       from 'better-sqlite3';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

import {
    extractWakeSubmitNonce,
    recordTurnStarted
} from '../../../../.codex/hooks/codex-context.mjs';
import {recordClaudeTurnPresence} from '../../../../.claude/hooks/turnPresenceHook.mjs';

test.describe('codex-context hook - wake submit nonce', () => {
    test('extracts a wake-submit nonce from nested hook payload text', () => {
        const nonce = '123e4567-e89b-12d3-a456-426614174000';

        expect(extractWakeSubmitNonce({
            transcript: [
                {role: 'user', content: `[WAKE]\n<!-- NEO_WAKE_SUBMIT_NONCE:${nonce} -->`}
            ]
        })).toBe(nonce);
    });

    test('records wakeSubmitNonce on the turn-presence row when present', async () => {
        const dir    = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-context-hook-')),
              dbPath = path.join(dir, 'graph.sqlite'),
              db     = new Database(dbPath),
              nonce  = '123e4567-e89b-12d3-a456-426614174001';

        db.exec(`
            CREATE TABLE Nodes (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                data TEXT
            )
        `);

        try {
            await recordTurnStarted({
                env: {
                    NEO_AGENT_IDENTITY: '@test-codex',
                    NEO_MEMORY_DB_PATH: dbPath,
                    NEO_AI_DAEMON_DIR : dir
                },
                hookPayload: {
                    prompt: `[WAKE]\n<!-- NEO_WAKE_SUBMIT_NONCE:${nonce} -->`
                },
                rootDir: path.resolve(new URL('../../../..', import.meta.url).pathname)
            });

            const row = db.prepare('SELECT data FROM Nodes WHERE id LIKE ?').get('AGENT_TURN_PRESENCE:%');
            expect(row).toBeTruthy();

            const node = JSON.parse(row.data);
            expect(node.properties.agentIdentity).toBe('@test-codex');
            expect(node.properties.source).toBe('codex-user-prompt-submit');
            expect(node.properties.wakeSubmitNonce).toBe(nonce);
        } finally {
            db.close();
            fs.rmSync(dir, {recursive: true, force: true});
        }
    });
});

test.describe('turn-presence hook writer', () => {
    test('Claude UserPromptSubmit starts and PostToolUse refreshes the active turn', async () => {
        const dir     = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-turn-presence-hook-')),
              dbPath  = path.join(dir, 'graph.sqlite'),
              db      = new Database(dbPath),
              rootDir = path.resolve(new URL('../../../..', import.meta.url).pathname),
              env     = {
                  NEO_AGENT_IDENTITY        : '@test-claude',
                  NEO_MEMORY_DB_PATH        : dbPath,
                  NEO_AI_DAEMON_DIR         : dir,
                  NEO_TURN_PRESENCE_FRESH_MS: '60000',
                  NEO_TURN_PRESENCE_TTL_MS  : '600000'
              },
              startedAt = '2026-06-25T00:00:00.000Z',
              progressAt = '2026-06-25T00:05:00.000Z';

        db.exec(`
            CREATE TABLE Nodes (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                data TEXT
            )
        `);

        try {
            await recordClaudeTurnPresence({
                env,
                hookPayload: {hook_event_name: 'UserPromptSubmit'},
                now        : startedAt,
                rootDir
            });

            await recordClaudeTurnPresence({
                env,
                hookPayload: {hook_event_name: 'PostToolUse', tool_name: 'Bash'},
                now        : progressAt,
                rootDir
            });

            const rows = db.prepare('SELECT data FROM Nodes WHERE id LIKE ?').all('AGENT_TURN_PRESENCE:%');
            expect(rows).toHaveLength(1);

            const node = JSON.parse(rows[0].data);
            expect(node.properties.agentIdentity).toBe('@test-claude');
            expect(node.properties.source).toBe('claude-post-tool-use');
            expect(node.properties.note).toBe('claude PostToolUse Bash');
            expect(node.properties.startedAt).toBe(startedAt);
            expect(node.properties.lastProgressAt).toBe(progressAt);
            expect(node.properties.freshUntil).toBe('2026-06-25T00:06:00.000Z');
            expect(node.properties.status).toBe('active');
        } finally {
            db.close();
            fs.rmSync(dir, {recursive: true, force: true});
        }
    });

    test('Claude PostToolUse progress is a no-op without an active turn', async () => {
        const dir    = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-turn-presence-hook-')),
              dbPath = path.join(dir, 'graph.sqlite'),
              db     = new Database(dbPath);

        db.exec(`
            CREATE TABLE Nodes (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                data TEXT
            )
        `);

        try {
            const result = await recordClaudeTurnPresence({
                env: {
                    NEO_AGENT_IDENTITY: '@test-claude',
                    NEO_MEMORY_DB_PATH: dbPath,
                    NEO_AI_DAEMON_DIR : dir
                },
                hookPayload: {hook_event_name: 'PostToolUse', tool_name: 'Bash'},
                rootDir    : path.resolve(new URL('../../../..', import.meta.url).pathname)
            });

            expect(result).toMatchObject({
                action: 'progress',
                reason: 'no-active-turn',
                status: 'noop'
            });
            expect(db.prepare('SELECT COUNT(*) AS count FROM Nodes').get().count).toBe(0);
        } finally {
            db.close();
            fs.rmSync(dir, {recursive: true, force: true});
        }
    });
});
