import {test, expect}  from '@playwright/test';
import Database        from 'better-sqlite3';
import {spawnSync}     from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {
    parseKimiHookPayload,
    recordKimiTurnPresence,
    resolveKimiTurnPresenceEvent
} from '../../../../.kimi-code/hooks/turnPresenceHook.mjs';

const
    configPath = fileURLToPath(new URL('../../../../.kimi-code/hooks/turn-presence.example.toml', import.meta.url)),
    hookPath   = fileURLToPath(new URL('../../../../.kimi-code/hooks/turnPresenceHook.mjs', import.meta.url)),
    rootDir    = fileURLToPath(new URL('../../../..', import.meta.url));

/**
 * @summary Creates the minimal graph fixture consumed by the fail-soft hook writer.
 * @param {String} prefix Temporary-directory prefix.
 * @returns {{db: Database, dbPath: String, dir: String}}
 */
function createGraphFixture(prefix='kimi-turn-presence-hook-') {
    const dir    = fs.mkdtempSync(path.join(os.tmpdir(), prefix)),
          dbPath = path.join(dir, 'graph.sqlite'),
          db     = new Database(dbPath);

    db.exec(`
        CREATE TABLE Nodes (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            data TEXT
        )
    `);

    return {db, dbPath, dir}
}

/**
 * @summary Closes and removes one temporary graph fixture.
 * @param {{db: Database, dir: String}} fixture Graph fixture.
 * @returns {void}
 */
function destroyGraphFixture({db, dir}) {
    db.close();
    fs.rmSync(dir, {recursive: true, force: true})
}

/**
 * @summary Reads every persisted turn-presence node from a fixture database.
 * @param {Database} db SQLite database.
 * @returns {Object[]}
 */
function readTurnPresenceNodes(db) {
    return db.prepare('SELECT data FROM Nodes WHERE id LIKE ? ORDER BY id')
        .all('AGENT_TURN_PRESENCE:%')
        .map(({data}) => JSON.parse(data))
}

test.describe('Kimi Code turn-presence hook adapter', () => {
    test('maps only the documented per-turn event contract', () => {
        const expected = {
            Interrupt: {
                action       : 'terminal',
                eventName    : 'Interrupt',
                source       : 'kimi-interrupt',
                terminalState: 'aborted'
            },
            PostToolUse: {
                action   : 'progress',
                eventName: 'PostToolUse',
                source   : 'kimi-post-tool-use'
            },
            Stop: {
                action       : 'terminal',
                eventName    : 'Stop',
                source       : 'kimi-stop',
                terminalState: 'completed'
            },
            StopFailure: {
                action       : 'terminal',
                eventName    : 'StopFailure',
                source       : 'kimi-stop-failure',
                terminalState: 'aborted'
            },
            UserPromptSubmit: {
                action   : 'start',
                eventName: 'UserPromptSubmit',
                source   : 'kimi-user-prompt-submit'
            }
        };

        Object.entries(expected).forEach(([hook_event_name, mapping]) => {
            expect(resolveKimiTurnPresenceEvent({hook_event_name})).toEqual(mapping)
        });

        ['SessionStart', 'SessionEnd', 'PostToolUseFailure'].forEach(hook_event_name => {
            expect(resolveKimiTurnPresenceEvent({hook_event_name})).toBeNull()
        });
        expect(resolveKimiTurnPresenceEvent(null)).toBeNull();
        expect(parseKimiHookPayload('{malformed')).toBeNull()
    });

    test('keeps the install template schema-bounded and identity-neutral', () => {
        const blocks = fs.readFileSync(configPath, 'utf8')
            .split('[[hooks]]')
            .slice(1)
            .map(block => Object.fromEntries(block.trim().split('\n')
                .filter(line => line && !line.startsWith('#'))
                .map(line => {
                    const separator = line.indexOf('='),
                          key       = line.slice(0, separator).trim(),
                          rawValue  = line.slice(separator + 1).trim(),
                          value     = rawValue.replace(/^(['"])(.*)\1$/, '$2');

                    return [key, key === 'timeout' ? Number(value) : value]
                })));

        expect(blocks.map(({event}) => event)).toEqual([
            'UserPromptSubmit',
            'PostToolUse',
            'Stop',
            'StopFailure',
            'Interrupt'
        ]);
        blocks.forEach(block => {
            expect(Object.keys(block).sort()).toEqual(['command', 'event', 'timeout']);
            expect(block.timeout).toBe(5);
            expect(block.command).toBe(
                'NEO_AGENT_IDENTITY="$NEO_AGENT_IDENTITY" /usr/bin/env node "$(git rev-parse --show-toplevel)/.kimi-code/hooks/turnPresenceHook.mjs"'
            );
            expect(block.command).not.toMatch(/@neo-/)
        })
    });

    test('records start, progress, and completed terminal state on one active turn', async () => {
        const fixture = createGraphFixture();
        const env     = {
            NEO_AGENT_IDENTITY        : '@test-kimi',
            NEO_MEMORY_DB_PATH        : fixture.dbPath,
            NEO_TURN_PRESENCE_FRESH_MS: '60000',
            NEO_TURN_PRESENCE_TTL_MS  : '600000'
        };

        try {
            await recordKimiTurnPresence({
                env,
                hookPayload: {hook_event_name: 'UserPromptSubmit', session_id: 'session-test'},
                now        : '2026-07-19T20:00:00.000Z',
                rootDir
            });
            await recordKimiTurnPresence({
                env,
                hookPayload: {hook_event_name: 'PostToolUse', tool_name: 'Shell'},
                now        : '2026-07-19T20:01:00.000Z',
                rootDir
            });
            const result = await recordKimiTurnPresence({
                env,
                hookPayload: {hook_event_name: 'Stop'},
                now        : '2026-07-19T20:02:00.000Z',
                rootDir
            });

            expect(result).toMatchObject({
                action       : 'terminal',
                agentIdentity: '@test-kimi',
                source       : 'kimi-stop',
                status       : 'recorded',
                terminalState: 'completed'
            });

            const nodes = readTurnPresenceNodes(fixture.db);
            expect(nodes).toHaveLength(1);
            expect(nodes[0].properties).toMatchObject({
                agentIdentity : '@test-kimi',
                lastProgressAt: '2026-07-19T20:02:00.000Z',
                note          : 'kimi Stop',
                source        : 'kimi-stop',
                startedAt     : '2026-07-19T20:00:00.000Z',
                status        : 'terminal',
                terminalState : 'completed'
            })
        } finally {
            destroyGraphFixture(fixture)
        }
    });

    for (const eventName of ['StopFailure', 'Interrupt']) {
        test(`${eventName} terminates the active turn as aborted`, async () => {
            const fixture = createGraphFixture();
            const env     = {
                NEO_AGENT_IDENTITY: '@test-kimi',
                NEO_MEMORY_DB_PATH: fixture.dbPath
            };

            try {
                await recordKimiTurnPresence({
                    env,
                    hookPayload: {hook_event_name: 'UserPromptSubmit'},
                    now        : '2026-07-19T20:00:00.000Z',
                    rootDir
                });
                await recordKimiTurnPresence({
                    env,
                    hookPayload: {hook_event_name: eventName},
                    now        : '2026-07-19T20:01:00.000Z',
                    rootDir
                });

                expect(readTurnPresenceNodes(fixture.db)[0].properties).toMatchObject({
                    source       : eventName === 'Interrupt' ? 'kimi-interrupt' : 'kimi-stop-failure',
                    status       : 'terminal',
                    terminalState: 'aborted'
                })
            } finally {
                destroyGraphFixture(fixture)
            }
        })
    }

    test('session events and missing identity fail soft without writing', async () => {
        const fixture = createGraphFixture();

        try {
            await expect(recordKimiTurnPresence({
                env        : {NEO_AGENT_IDENTITY: '@test-kimi', NEO_MEMORY_DB_PATH: fixture.dbPath},
                hookPayload: {hook_event_name: 'SessionStart'},
                rootDir
            })).resolves.toEqual({
                eventName: 'SessionStart',
                reason   : 'unsupported-hook-event',
                status   : 'noop'
            });

            await expect(recordKimiTurnPresence({
                env        : {NEO_MEMORY_DB_PATH: fixture.dbPath},
                hookPayload: {hook_event_name: 'UserPromptSubmit'},
                rootDir
            })).resolves.toBeUndefined();

            expect(readTurnPresenceNodes(fixture.db)).toHaveLength(0)
        } finally {
            destroyGraphFixture(fixture)
        }
    });

    test('the executable adapter exits cleanly when the local writer rejects', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kimi-turn-presence-process-'));

        try {
            const result = spawnSync(process.execPath, [hookPath], {
                encoding: 'utf8',
                env     : {
                    ...process.env,
                    NEO_AGENT_IDENTITY: '@test-kimi',
                    NEO_MEMORY_DB_PATH: path.join(dir, 'missing.sqlite')
                },
                input  : JSON.stringify({hook_event_name: 'UserPromptSubmit'}),
                timeout: 5000
            });

            expect(result.error).toBeUndefined();
            expect(result.status).toBe(0);
            expect(result.stdout).toBe('');
            expect(result.stderr).toBe('')
        } finally {
            fs.rmSync(dir, {recursive: true, force: true})
        }
    })
});
