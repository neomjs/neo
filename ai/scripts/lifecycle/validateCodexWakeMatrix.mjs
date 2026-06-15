#!/usr/bin/env node
/**
 * @summary Isolated Codex wake prompt-landing matrix validation harness.
 *
 * Builds a temporary Memory Core graph containing only the selected Codex
 * wake subscription plus one controlled payload scenario, then starts one
 * wake-daemon subprocess against that temporary graph. This proves the
 * backend route and produces a matrix-ready artifact without advancing the
 * production wake daemon cursor or dumping the live mailbox backlog.
 *
 * Live Codex UI delivery is opt-in via `--live`. Without it, the copied
 * subscription uses the daemon's `test` adapter so unit tests and dry-runs can
 * validate the isolation contract without touching a desktop app.
 *
 * @see ai/docs/wake-prompt-landing-matrix.md
 * @see ai/daemons/wake/daemon.mjs
 * @see test/playwright/unit/ai/scripts/lifecycle/validateCodexWakeMatrix.spec.mjs
 */
import Database          from 'better-sqlite3';
import fs                from 'fs-extra';
import os                from 'os';
import path              from 'path';
import {fileURLToPath}   from 'url';
import {spawn}           from 'child_process';
import crypto            from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../../..');

const HEARTBEAT_PULSE_ENTITY_TYPE = 'heartbeat_pulse';
const VALID_SCENARIOS = new Set([
    'pure-heartbeat',
    'direct-message',
    'mixed-message-heartbeat'
]);

function getDefaultSourceDb() {
    return process.env.NEO_MEMORY_DB_PATH || path.join(repoRoot, '.neo-ai-data/sqlite/memory-core-graph.sqlite');
}

/**
 * @summary Parse this script's compact CLI flag surface.
 * @param {String[]} argv
 * @returns {Object}
 */
export function parseArgs(argv = process.argv.slice(2)) {
    const options = {
        scenario        : 'direct-message',
        identity        : process.env.NEO_AGENT_IDENTITY || '@neo-gpt',
        sourceDb        : getDefaultSourceDb(),
        subscriptionId  : null,
        workDir         : null,
        artifact        : null,
        live            : false,
        timeoutMs       : 15000,
        coalesceWindowMs: 1000,
        notes           : ''
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const readValue = () => {
            const value = argv[++i];
            if (!value) throw new Error(`${arg} requires a value`);
            return value;
        };

        if (arg === '--scenario') options.scenario = readValue();
        else if (arg === '--identity') options.identity = readValue();
        else if (arg === '--source-db') options.sourceDb = readValue();
        else if (arg === '--subscription-id') options.subscriptionId = readValue();
        else if (arg === '--work-dir') options.workDir = readValue();
        else if (arg === '--artifact') options.artifact = readValue();
        else if (arg === '--timeout-ms') options.timeoutMs = Number(readValue());
        else if (arg === '--coalesce-window-ms') options.coalesceWindowMs = Number(readValue());
        else if (arg === '--notes') options.notes = readValue();
        else if (arg === '--live') options.live = true;
        else if (arg === '--help' || arg === '-h') {
            options.help = true;
        } else {
            throw new Error(`Unknown option: ${arg}`);
        }
    }

    if (!VALID_SCENARIOS.has(options.scenario)) {
        throw new Error(`Invalid --scenario "${options.scenario}". Expected one of: ${[...VALID_SCENARIOS].join(', ')}`);
    }
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
        throw new Error('--timeout-ms must be a positive number');
    }
    if (!Number.isFinite(options.coalesceWindowMs) || options.coalesceWindowMs < 0) {
        throw new Error('--coalesce-window-ms must be a non-negative number');
    }

    return options;
}

/**
 * @summary Create the minimal SQLite graph schema consumed by the wake daemon.
 * @param {Database} db
 * @returns {void}
 */
export function createGraphSchema(db) {
    db.pragma('journal_mode = WAL');
    db.exec(`
        CREATE TABLE IF NOT EXISTS Nodes (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS Edges (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            source TEXT NOT NULL,
            target TEXT NOT NULL,
            type TEXT NOT NULL,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS GraphLog (
            log_id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_id TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

/**
 * @summary Read the latest GraphLog id from a graph database.
 * @param {Database} db
 * @returns {Number}
 */
export function getGraphHead(db) {
    return db.prepare('SELECT COALESCE(MAX(log_id), 0) AS head FROM GraphLog').get().head;
}

function parseNode(row) {
    if (!row) return null;
    return JSON.parse(row.data);
}

/**
 * @summary Load the active Codex wake subscription from the live graph.
 * @param {Database} db
 * @param {Object} options
 * @returns {Object}
 */
export function loadCodexSubscription(db, {subscriptionId, identity}) {
    let rows;

    if (subscriptionId) {
        rows = db.prepare('SELECT id, data FROM Nodes WHERE id = ?').all(subscriptionId);
    } else {
        rows = db.prepare(`
            SELECT id, data
              FROM Nodes
             WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
               AND json_extract(data, '$.properties.status') = 'active'
               AND json_extract(data, '$.properties.agentIdentity') = ?
               AND json_extract(data, '$.properties.harnessTarget') = 'bridge-daemon'
               AND json_extract(data, '$.properties.harnessTargetMetadata.appName') = 'Codex'
             ORDER BY updatedAt DESC
        `).all(identity);
    }

    const matches = rows.map(parseNode).filter(Boolean);

    if (matches.length === 0) {
        throw new Error(subscriptionId
            ? `No WAKE_SUBSCRIPTION found for --subscription-id ${subscriptionId}`
            : `No active Codex bridge-daemon WAKE_SUBSCRIPTION found for ${identity}`);
    }
    if (!subscriptionId && matches.length > 1) {
        throw new Error(`Multiple active Codex bridge-daemon subscriptions found for ${identity}; pass --subscription-id explicitly`);
    }

    const sub = matches[0];
    if (sub.label !== 'WAKE_SUBSCRIPTION') {
        throw new Error(`${sub.id} is ${sub.label || 'unknown'}, not WAKE_SUBSCRIPTION`);
    }
    if (sub.properties?.status !== 'active') {
        throw new Error(`${sub.id} is not an active wake subscription`);
    }
    if (sub.properties?.agentIdentity !== identity) {
        throw new Error(`${sub.id} belongs to ${sub.properties?.agentIdentity || 'unknown'}, not ${identity}`);
    }
    if (sub.properties?.harnessTarget !== 'bridge-daemon') {
        throw new Error(`${sub.id} targets ${sub.properties?.harnessTarget || 'unknown'}, not bridge-daemon`);
    }
    if (sub.properties?.harnessTargetMetadata?.appName !== 'Codex') {
        throw new Error(`${sub.id} is not a Codex wake subscription`);
    }

    return sub;
}

/**
 * @summary Copy subscription metadata into the isolated graph.
 * @param {Database} db
 * @param {Object} subscription
 * @param {Object} options
 * @returns {Object} The copied subscription node.
 */
export function insertIsolatedSubscription(db, subscription, {identity, live, coalesceWindowMs}) {
    const metadata = {
        ...(subscription.properties?.harnessTargetMetadata || {}),
        coalesceWindow: coalesceWindowMs / 1000
    };

    if (!live) {
        metadata.adapter = 'test';
    }

    const isolated = {
        ...subscription,
        properties: {
            ...(subscription.properties || {}),
            agentIdentity        : identity,
            status               : 'active',
            trigger              : 'SENT_TO_ME',
            harnessTarget        : 'bridge-daemon',
            harnessTargetMetadata: metadata
        }
    };

    db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(identity, JSON.stringify({
        id        : identity,
        label     : 'AGENT',
        properties: {name: identity}
    }));
    db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(isolated.id, JSON.stringify(isolated));
    db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(isolated.id, 'nodes');

    return isolated;
}

function insertMessage(db, identity, subject) {
    const msgId = `WAKE_MATRIX_MESSAGE:${crypto.randomUUID()}`;
    db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
        id        : msgId,
        label     : 'MESSAGE',
        properties: {
            from    : '@wake-matrix-validator',
            subject,
            priority: 'normal'
        }
    }));
    db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');

    const edgeId = `WAKE_MATRIX_SENT_TO:${crypto.randomUUID()}`;
    db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId, JSON.stringify({
        id    : edgeId,
        source: msgId,
        target: identity,
        type  : 'SENT_TO'
    }), msgId, identity, 'SENT_TO');
    db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId, 'edges');

    return {messageId: msgId, edgeId};
}

function insertHeartbeat(db, identity) {
    const pulseId = `HEARTBEAT_PULSE:${identity}:codex-matrix.${crypto.randomUUID()}`;
    db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(pulseId, HEARTBEAT_PULSE_ENTITY_TYPE);
    return {pulseId};
}

/**
 * @summary Inject the single controlled matrix scenario.
 * @param {Database} db
 * @param {Object} options
 * @returns {Object}
 */
export function insertScenario(db, {identity, scenario}) {
    const inserted = {messages: [], heartbeats: []};

    if (scenario === 'direct-message' || scenario === 'mixed-message-heartbeat') {
        inserted.messages.push(insertMessage(db, identity, `Codex wake matrix ${scenario}`));
    }
    if (scenario === 'pure-heartbeat' || scenario === 'mixed-message-heartbeat') {
        inserted.heartbeats.push(insertHeartbeat(db, identity));
    }

    return inserted;
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForDelivery(proc, {subscriptionId, scenario, timeoutMs}) {
    let stdout = '';
    let stderr = '';

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Timed out waiting for ${scenario} delivery on ${subscriptionId}. stdout=${stdout} stderr=${stderr}`));
        }, timeoutMs);

        const complete = line => {
            clearTimeout(timeout);
            resolve({line, stdout, stderr});
        };

        proc.stdout.on('data', data => {
            const chunk = data.toString();
            stdout += chunk;
            const lines = chunk.split(/\r?\n/);
            const line = lines.find(candidate => (
                candidate.includes(subscriptionId) &&
                candidate.includes(`scenario=${scenario}`) &&
                (
                    candidate.includes('Delivered') ||
                    candidate.includes('Dispatched') ||
                    candidate.includes('Wake Daemon Test Adapter')
                )
            ));
            if (line) complete(line);
        });

        proc.stderr.on('data', data => {
            stderr += data.toString();
        });

        proc.on('error', err => {
            clearTimeout(timeout);
            reject(err);
        });

        proc.on('exit', code => {
            if (code && code !== 0) {
                clearTimeout(timeout);
                reject(new Error(`wake daemon exited with code ${code}. stdout=${stdout} stderr=${stderr}`));
            }
        });
    });
}

/**
 * @summary Run one isolated Codex wake matrix scenario.
 * @param {Object} options Parsed CLI options.
 * @returns {Promise<Object>} Matrix artifact.
 */
export async function runValidation(options) {
    const sourceDbPath = path.resolve(options.sourceDb);
    if (!fs.existsSync(sourceDbPath)) {
        throw new Error(`Source Memory Core graph not found: ${sourceDbPath}`);
    }

    const workDir = options.workDir
        ? path.resolve(options.workDir)
        : path.join(os.tmpdir(), `neo-codex-wake-matrix-${Date.now()}-${crypto.randomUUID()}`);
    const tempDbPath    = path.join(workDir, 'memory-core-graph.sqlite');
    const tempDaemonDir = path.join(workDir, 'wake-daemon');

    fs.ensureDirSync(workDir);
    fs.ensureDirSync(tempDaemonDir);

    const sourceDb = new Database(sourceDbPath, {readonly: true});
    let sourceHead, sourceSubscription;
    try {
        sourceHead = getGraphHead(sourceDb);
        sourceSubscription = loadCodexSubscription(sourceDb, {
            subscriptionId: options.subscriptionId,
            identity      : options.identity
        });
    } finally {
        sourceDb.close();
    }

    const db = new Database(tempDbPath);
    let isolatedSubscription, inserted;
    try {
        createGraphSchema(db);
        isolatedSubscription = insertIsolatedSubscription(db, sourceSubscription, options);
    } finally {
        db.close();
    }

    const daemon = spawn(process.execPath, ['ai/daemons/wake/daemon.mjs'], {
        cwd  : repoRoot,
        stdio: 'pipe',
        env  : {
            ...process.env,
            NEO_MEMORY_DB_PATH     : tempDbPath,
            NEO_MEMORY_DB_PATH_TEST: tempDbPath,
            UNIT_TEST_MODE         : 'true',
            NEO_AI_DAEMON_DIR      : tempDaemonDir
        }
    });

    try {
        await wait(1000);

        const writeDb = new Database(tempDbPath);
        try {
            inserted = insertScenario(writeDb, {
                identity: options.identity,
                scenario: options.scenario
            });
        } finally {
            writeDb.close();
        }

        const delivery = await waitForDelivery(daemon, {
            subscriptionId: isolatedSubscription.id,
            scenario      : options.scenario,
            timeoutMs     : options.timeoutMs
        });

        const artifact = {
            generatedAt: new Date().toISOString(),
            scenario   : options.scenario,
            live       : options.live,
            identity   : options.identity,
            subscription: {
                id                    : isolatedSubscription.id,
                harnessTarget          : isolatedSubscription.properties.harnessTarget,
                trigger                : isolatedSubscription.properties.trigger,
                harnessTargetMetadata  : isolatedSubscription.properties.harnessTargetMetadata,
                sourceHarnessMetadata  : sourceSubscription.properties?.harnessTargetMetadata || {},
                coalesceWindowOverrideMs: options.coalesceWindowMs
            },
            isolation: {
                sourceDb            : sourceDbPath,
                sourceGraphHead     : sourceHead,
                tempDb              : tempDbPath,
                tempDaemonDir,
                productionCursorUsed: false,
                productionBacklogRead: false
            },
            inserted,
            backendEvidence: {
                line  : delivery.line,
                stdout: delivery.stdout,
                stderr: delivery.stderr
            },
            liveCodexAssertions: {
                promptPayloadLands       : options.live ? 'manual-observation-required' : 'not-run-dry-adapter',
                promptSubmittedTurnStarts: options.live ? 'manual-observation-required' : 'not-run-dry-adapter',
                humanEnterRequired       : options.live ? 'manual-observation-required' : 'not-run-dry-adapter',
                notes                    : options.notes
            }
        };

        if (options.artifact) {
            fs.ensureDirSync(path.dirname(path.resolve(options.artifact)));
            fs.writeFileSync(path.resolve(options.artifact), JSON.stringify(artifact, null, 2) + '\n', 'utf8');
        }

        return artifact;
    } finally {
        daemon.kill('SIGTERM');
        await wait(100);
        if (!options.workDir && !options.artifact) {
            fs.removeSync(workDir);
        }
    }
}

function usage() {
    return `Usage: node ai/scripts/lifecycle/validateCodexWakeMatrix.mjs [options]

Options:
  --scenario <name>             pure-heartbeat | direct-message | mixed-message-heartbeat
  --identity <agent>            Agent identity (default: NEO_AGENT_IDENTITY or @neo-gpt)
  --subscription-id <id>        Active Codex wake subscription id; required if multiple match
  --source-db <path>            Source Memory Core graph (default: NEO_MEMORY_DB_PATH or repo-local graph)
  --work-dir <path>             Keep isolated DB/daemon dir at this path
  --artifact <path>             Write matrix artifact JSON
  --coalesce-window-ms <n>      Override copied subscription coalesce window (default: 1000)
  --timeout-ms <n>              Delivery wait timeout (default: 15000)
  --live                        Use copied live adapter metadata; without this, adapter=test
  --notes <text>                Operator/manual observation notes copied into artifact
`;
}

async function main() {
    const options = parseArgs();
    if (options.help) {
        process.stdout.write(usage());
        return;
    }

    const artifact = await runValidation(options);
    process.stdout.write(JSON.stringify(artifact, null, 2) + '\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
    main().catch(err => {
        console.error(`validateCodexWakeMatrix failed: ${err.message}`);
        process.exit(1);
    });
}
