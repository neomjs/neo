import assert                from 'node:assert/strict';
import {randomUUID}          from 'node:crypto';
import path                  from 'node:path';
import {pathToFileURL}       from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import Neo                   from '../../src/Neo.mjs';
import '../../src/core/_export.mjs';
import isEntryModule from '../../buildScripts/util/isEntryModule.mjs';

/**
 * @summary Resolves only an explicitly selected disposable archive; ambient seat credentials never opt in.
 * @param {Object} env Runner environment.
 * @returns {Object|null} The explicit fixture endpoint and credential, or null for an ordinary run.
 * @throws {Error} For partial configuration or a non-fixture endpoint.
 */
export function archiveFixtureConfig(env) {
    const url = env.NEO_E2E_ARCHIVE_URL, token = env.NEO_E2E_ARCHIVE_TOKEN;
    if (!url && !token) return null;
    if (!url || !token) throw new Error('Archive fixture requires both NEO_E2E_ARCHIVE_URL and NEO_E2E_ARCHIVE_TOKEN.');

    const endpoint = new URL(url);
    if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port ||
        endpoint.pathname !== '/mcp' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
        throw new Error('Archive fixture requires an explicit http://127.0.0.1:<fixture-port>/mcp endpoint.');
    }

    return {url: endpoint.href, token}
}

/**
 * @summary Binds the real Brain archive client in this worker realm, without changing ClientConfig or AiConfig.
 * @description Only construction is injected. Every save/read/replay call still crosses authenticated MCP to
 * the disposable Memory Core. The caller owns close(), including after a failed probe or browser journey.
 * @param {Function} loadModule Imports a module from the explicitly provisioned Brain runtime.
 * @param {Object} [env=process.env]
 * @returns {Promise<Object|null>} The archive API and its cleanup, or null when not configured.
 */
export async function configureArchiveFixture(loadModule, env = process.env) {
    const config = archiveFixtureConfig(env);
    if (!config) return null;

    const [{default: ArchiveMcpClient}, archive] = await Promise.all([
        loadModule('ai/services/neural-link/ArchiveMcpClient.mjs'),
        loadModule('ai/services/neural-link/memoryCoreArchiveClient.mjs')
    ]);

    await archive.resetArchiveClient();
    archive.setArchiveConnect({createClient: () => Neo.create(ArchiveMcpClient, {
        clientName      : 'Neo.E2E.ArchiveFixture',
        serverName      : 'memory-core',
        env             : {NEO_E2E_ARCHIVE_TOKEN: config.token},
        connectionConfig: {
            transportType    : 'streamable-http', url: config.url,
            bearerTokenEnvVar: 'NEO_E2E_ARCHIVE_TOKEN', requiredEnv: ['NEO_E2E_ARCHIVE_TOKEN']
        }
    })});

    return {archive, close: () => archive.resetArchiveClient()}
}

/**
 * @summary Waits for the disposable store to answer a real read before the single write probe starts.
 * @description Compose can observe the MC process running before MCP/store initialization finishes.
 * Only a store-returned not-found for this fresh UUID proves read readiness; unavailable never does.
 * @param {Object} archive The real Brain archive API.
 * @param {Number} [timeoutMs=120000] Bounded cold-start retry window; no archive write is retried.
 * @returns {Promise<void>}
 */
export async function waitForArchiveStore(archive, timeoutMs = 120000) {
    const archiveId = randomUUID(), deadline = Date.now() + timeoutMs;
    let   reason    = 'no store response';
    do {
        const result = await archive.getTransactionArchive({archiveId});
        if (result.status === 'not-found') return;
        reason = result.reason ?? `unexpected status ${result.status}`;
        if (/401|unauthor|invalid.token|authentication/i.test(reason)) {
            throw new Error(`Archive readiness authentication refused: ${reason}`)
        }
        if (Date.now() >= deadline) break;
        await delay(1000)
    } while (Date.now() < deadline);
    throw new Error(`Archive store was not ready within ${timeoutMs}ms: ${reason}`)
}

/**
 * @summary Proves authenticated archive capability through save, exact readback, and replay bookkeeping.
 * @description This is transport/store evidence only. The complete browser specs separately prove actual
 * App Worker replay and undo. A token's presence or a successful handshake cannot satisfy these assertions.
 * @param {Object} archive The real Brain archive API.
 * @returns {Promise<Object>} A credential-free capability receipt.
 */
export async function probeArchiveCapability(archive) {
    const id          = randomUUID(), writer = {agentId: 'e2e-archive-fixture', sessionId: id},
          transaction = {
              txId: `archive-capability-${id}`, status: 'committed', committedAt: Date.now(), originWriter: writer,
              ops : [{
                  sequenceId: id, originWriter: writer, targetSubtreePath: ['archive-capability'],
                  label     : 'Archive capability',
                  forward   : {tool: 'set_instance_properties', args: {id: 'archive-capability', properties: {text: id}}},
                  reverse   : {tool: 'set_instance_properties', args: {id: 'archive-capability', properties: {text: 'before'}}}
              }]
          },
          saved = await archive.saveTransactionArchive({appSessionId: id, name: 'E2E archive capability', transaction});
    assert.equal(saved.saved, true, `Archive save refused: ${saved.reason}`);
    const before = await archive.getTransactionArchive({archiveId: saved.archiveId});
    assert.equal(before.status, 'found');
    assert.equal(before.sourceTxId, transaction.txId);
    assert.equal(before.appSessionId, id);
    assert.deepEqual(before.originWriter, writer);
    assert.deepEqual(before.ops, transaction.ops);
    assert.equal(before.replayCount, 0);
    const marked = await archive.recordTransactionReplay({archiveId: saved.archiveId}),
          after  = await archive.getTransactionArchive({archiveId: saved.archiveId});
    assert.equal(marked.updated, true);
    assert.equal(after.status, 'found');
    assert.equal(after.replayCount, 1);
    assert.deepEqual(after.ops, transaction.ops);
    return {archiveId: saved.archiveId, sourceTxId: saved.sourceTxId, payloadMatch: true, replayCount: after.replayCount}
}

if (isEntryModule(import.meta.url)) {
    const root = process.env.NEO_AGENTOS_RUNTIME_ROOT;
    if (!root || !path.isAbsolute(root)) throw new Error('Archive probe requires an absolute NEO_AGENTOS_RUNTIME_ROOT.');
    const fixture = await configureArchiveFixture(relative => import(pathToFileURL(path.join(root, relative)).href));
    if (!fixture) throw new Error('Archive probe requires explicit disposable archive configuration.');
    try {
        await waitForArchiveStore(fixture.archive);
        console.log(JSON.stringify(await probeArchiveCapability(fixture.archive)))
    } finally {
        await fixture.close()
    }
}
