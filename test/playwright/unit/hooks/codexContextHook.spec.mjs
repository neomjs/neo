import {test, expect} from '@playwright/test';
import Database       from 'better-sqlite3';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

import {
    extractWakeSubmitNonce,
    recordTurnStarted
} from '../../../../.codex/hooks/codex-context.mjs';

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
