import {randomUUID}    from 'node:crypto';
import {spawnSync}     from 'node:child_process';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {test, expect}  from '@playwright/test';
import {
    callJsonTool,
    createIdentityClient,
    getReadiness
} from './fixtures/mcpClient.mjs';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const repoRoot    = path.resolve(__dirname, '../../..');
const composeFile = path.join(repoRoot, 'ai/deploy/docker-compose.test.yml');
const projectName = process.env.NEO_INTEGRATION_COMPOSE_PROJECT || 'neo-integration-test';
const MC_URL      = process.env.NEO_INTEGRATION_MC_URL || 'http://127.0.0.1:13001';

const NEO_BOOTSTRAP = `
    await import('./src/Neo.mjs');
    await import('./src/core/_export.mjs');
`;

/**
 * Runs Docker Compose against the integration fixture project.
 * @param {String[]} args Docker Compose arguments after the compose file selector.
 * @returns {import('node:child_process').SpawnSyncReturns<String>}
 */
function dockerCompose(args) {
    return spawnSync('docker', ['compose', '-p', projectName, '-f', composeFile, ...args], {
        cwd      : repoRoot,
        encoding : 'utf8',
        maxBuffer: 10 * 1024 * 1024
    });
}

/**
 * Runs an ES module snippet inside the deployed Memory Core container.
 * @param {String} code The JavaScript source to execute.
 * @param {Object} [payload] JSON payload exposed as NEO_TEST_PAYLOAD.
 * @returns {Object}
 */
function execMemoryCoreJson(code, payload={}) {
    const result = dockerCompose([
        'exec',
        '-T',
        '-e',
        `NEO_TEST_PAYLOAD=${JSON.stringify(payload)}`,
        'mc-server',
        'node',
        '--input-type=module',
        '-e',
        code
    ]);
    const output = [
        result.stdout?.trim(),
        result.stderr?.trim()
    ].filter(Boolean).join('\n');

    expect(result.status, output || result.error?.message || 'mc-server exec failed').toBe(0);

    const jsonLine = result.stdout.trim().split('\n').filter(Boolean).reverse().find(line => {
        try {
            JSON.parse(line);
            return true;
        } catch {
            return false;
        }
    });
    expect(jsonLine, output).toBeTruthy();

    return JSON.parse(jsonLine);
}

/**
 * Seeds Chroma records that are not writable through the current public MCP tools.
 * @param {Object} payload Seed payload.
 * @returns {Object}
 */
function seedChromaRecords(payload) {
    return execMemoryCoreJson(`
        ${NEO_BOOTSTRAP}

        const payload = JSON.parse(process.env.NEO_TEST_PAYLOAD);
        const {Memory_LifecycleService} = await import('./ai/services.mjs');
        const StorageRouter = (await import('./ai/services/memory-core/managers/StorageRouter.mjs')).default;

        await Memory_LifecycleService.ready();

        const memoryCollection = await StorageRouter.getMemoryCollection();
        const summaryCollection = await StorageRouter.getSummaryCollection();
        const now = Date.now();

        await memoryCollection.add({
            ids: [payload.sharedMemoryId],
            metadatas: [{
                agent          : 'shared-team',
                amountToolCalls: 0,
                model          : 'integration',
                prompt         : 'shared prompt ' + payload.sharedMemorySentinel,
                response       : 'shared response ' + payload.sharedMemorySentinel,
                sessionId      : payload.sessionId,
                thought        : 'shared thought ' + payload.sharedMemorySentinel,
                timestamp      : now,
                type           : 'agent-interaction',
                userId         : 'shared'
            }],
            documents: [
                'User Prompt: shared prompt ' + payload.sharedMemorySentinel + '\\n' +
                'Agent Thought: shared thought ' + payload.sharedMemorySentinel + '\\n' +
                'Agent Response: shared response ' + payload.sharedMemorySentinel
            ]
        });

        await summaryCollection.add({
            ids: [
                payload.sharedSummaryId,
                payload.ownerSummaryId,
                payload.peerSummaryId
            ],
            metadatas: [
                {
                    category    : 'integration',
                    complexity  : 1,
                    impact      : 1,
                    memoryCount : 1,
                    productivity: 1,
                    quality     : 1,
                    sessionId   : payload.sessionId,
                    technologies: 'integration',
                    timestamp   : now + 1,
                    title       : 'shared summary ' + payload.sharedSummarySentinel,
                    userId      : 'shared'
                },
                {
                    category    : 'integration',
                    complexity  : 1,
                    impact      : 1,
                    memoryCount : 1,
                    productivity: 1,
                    quality     : 1,
                    sessionId   : payload.sessionId,
                    technologies: 'integration',
                    timestamp   : now + 2,
                    title       : 'owner private summary ' + payload.ownerSummarySentinel,
                    userId      : payload.ownerIdentity
                },
                {
                    category    : 'integration',
                    complexity  : 1,
                    impact      : 1,
                    memoryCount : 1,
                    productivity: 1,
                    quality     : 1,
                    sessionId   : payload.sessionId,
                    technologies: 'integration',
                    timestamp   : now + 3,
                    title       : 'peer private summary ' + payload.peerSummarySentinel,
                    userId      : payload.peerIdentity
                }
            ],
            documents: [
                'shared summary body ' + payload.sharedSummarySentinel,
                'owner private summary body ' + payload.ownerSummarySentinel,
                'peer private summary body ' + payload.peerSummarySentinel
            ]
        });

        console.log(JSON.stringify({
            memoryIds: [payload.sharedMemoryId],
            summaryIds: [payload.sharedSummaryId, payload.ownerSummaryId, payload.peerSummaryId]
        }));
    `, payload);
}

/**
 * Seeds Native Edge Graph nodes that exercise private vs team visibility through MCP search.
 * @param {Object} payload Seed payload.
 * @returns {Object}
 */
function seedGraphRecords(payload) {
    return execMemoryCoreJson(`
        ${NEO_BOOTSTRAP}

        const payload = JSON.parse(process.env.NEO_TEST_PAYLOAD);
        const {Memory_LifecycleService} = await import('./ai/services.mjs');
        const RequestContextService = (await import('./ai/mcp/server/shared/services/RequestContextService.mjs')).default;
        const GraphService = (await import('./ai/services/memory-core/GraphService.mjs')).default;

        await Memory_LifecycleService.ready();

        // Seed AgentIdentity nodes for fixture identities (alice/bob/charlie) so
        // Server.bindAgentIdentity('alice') can resolve to '@alice' during MCP request
        // binding. Without this, abstract identities are unbound and GraphService.searchNodes()
        // filtering by getAgentIdentityNodeId() returns empty for owner-private graph queries.
        // Mirrors the canonical seedAgentIdentities.mjs upsert pattern; cleanup is symmetric
        // in cleanupGraphRecords. Avoided trap: IDs use the canonical '@<username>'
        // shape, NOT the legacy 'AGENT:<username>' form (which caused identity-node pollution).
        const fixtureIdentityIds = [
            '@' + payload.ownerIdentity,
            '@' + payload.peerIdentity,
            '@' + payload.unrelatedIdentity
        ];
        for (const identityId of fixtureIdentityIds) {
            GraphService.upsertNode({
                id        : identityId,
                type      : 'AgentIdentity',
                name      : identityId,
                properties: {
                    role: 'integration-test-fixture'
                }
            });
        }

        await RequestContextService.run({
            agentIdentityNodeId: '@' + payload.ownerIdentity,
            source             : 'integration',
            userId             : payload.ownerIdentity,
            username           : payload.ownerIdentity
        }, async () => {
            GraphService.upsertNode({
                id         : payload.privateNodeId,
                type       : 'INTEGRATION_TEST',
                name       : 'private graph node ' + payload.privateGraphSentinel,
                description: 'private graph description ' + payload.privateGraphSentinel
            });

            GraphService.upsertNode({
                id         : payload.teamNodeId,
                type       : 'INTEGRATION_TEST',
                name       : 'team graph node ' + payload.teamGraphSentinel,
                description: 'team graph description ' + payload.teamGraphSentinel,
                properties : {
                    visibility: 'team'
                }
            });
        });

        console.log(JSON.stringify({
            nodeIds        : [payload.privateNodeId, payload.teamNodeId],
            identityNodeIds: fixtureIdentityIds
        }));
    `, payload);
}

/**
 * Removes directly-seeded Chroma records.
 * @param {Object} payload Cleanup payload.
 * @returns {Object}
 */
function cleanupChromaRecords(payload) {
    return execMemoryCoreJson(`
        ${NEO_BOOTSTRAP}

        const payload = JSON.parse(process.env.NEO_TEST_PAYLOAD);
        const {Memory_LifecycleService} = await import('./ai/services.mjs');
        const StorageRouter = (await import('./ai/services/memory-core/managers/StorageRouter.mjs')).default;

        await Memory_LifecycleService.ready();

        const memoryCollection = await StorageRouter.getMemoryCollection();
        const summaryCollection = await StorageRouter.getSummaryCollection();

        if (payload.memoryIds.length > 0) {
            await memoryCollection.delete({ids: payload.memoryIds});
        }

        if (payload.summaryIds.length > 0) {
            await summaryCollection.delete({ids: payload.summaryIds});
        }

        console.log(JSON.stringify({
            deletedMemoryIds : payload.memoryIds,
            deletedSummaryIds: payload.summaryIds
        }));
    `, payload);
}

/**
 * Removes directly-seeded graph records.
 * @param {Object} payload Cleanup payload.
 * @returns {Object}
 */
function cleanupGraphRecords(payload) {
    return execMemoryCoreJson(`
        ${NEO_BOOTSTRAP}

        const payload = JSON.parse(process.env.NEO_TEST_PAYLOAD);
        const {Memory_LifecycleService} = await import('./ai/services.mjs');
        const GraphService = (await import('./ai/services/memory-core/GraphService.mjs')).default;

        await Memory_LifecycleService.ready();

        const db = GraphService.db.storage.db;
        const deleteEdges = db.prepare('DELETE FROM Edges WHERE source = ? OR target = ?');
        const deleteNode = db.prepare('DELETE FROM Nodes WHERE id = ?');

        // Clean up both the test-data nodes AND the fixture AgentIdentity nodes seeded
        // by seedGraphRecords. AgentIdentity nodes are apoptosis-exempt, so
        // explicit cleanup is required to prevent fixture-identity accumulation across runs.
        const allNodeIds = [...payload.nodeIds, ...(payload.identityNodeIds || [])];

        for (const id of allNodeIds) {
            deleteEdges.run(id, id);
            deleteNode.run(id);
        }

        GraphService.db.nodes.clearSilent();
        GraphService.db.edges.clearSilent();
        GraphService.db.vicinityLoadedNodes.clear();

        console.log(JSON.stringify({deletedNodeIds: allNodeIds}));
    `, payload);
}

/**
 * Flattens a memory query response into searchable test evidence.
 * @param {Object} result The query_raw_memories tool result.
 * @returns {String}
 */
function memoryTexts(result) {
    return result.results.map(memory => [
        memory.prompt,
        memory.thought,
        memory.response
    ].join('\n')).join('\n');
}

/**
 * Flattens a summary query response into searchable test evidence.
 * @param {Object} result The query_summaries tool result.
 * @returns {String}
 */
function summaryTexts(result) {
    return result.results.map(summary => [
        summary.title,
        summary.summary
    ].join('\n')).join('\n');
}

/**
 * Flattens a graph search response into searchable test evidence.
 * @param {Object} result The search_nodes tool result.
 * @returns {String}
 */
function nodeTexts(result) {
    return result.nodes.map(node => [
        node.id,
        node.name,
        node.description
    ].join('\n')).join('\n');
}

test.describe('Dockerized MC team/private retrieval integration (#10951)', () => {
    test('retrieves shared Chroma commons while preserving private tenant boundaries', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);

        expect(readiness.servicesReady, readiness.reason).toBe(true);

        const runId                 = `${Date.now()}-${randomUUID()}`;
        const sessionId             = `integration-team-private-${runId}`;
        const ownerIdentity         = 'alice';
        const peerIdentity          = 'bob';
        const unrelatedIdentity     = 'charlie';
        const ownerMemorySentinel   = `owner-private-memory-${runId}`;
        const peerMemorySentinel    = `peer-private-memory-${runId}`;
        const sharedMemorySentinel  = `shared-memory-${runId}`;
        const ownerSummarySentinel  = `owner-private-summary-${runId}`;
        const peerSummarySentinel   = `peer-private-summary-${runId}`;
        const sharedSummarySentinel = `shared-summary-${runId}`;
        const directSeedPayload     = {
            ownerIdentity,
            ownerSummaryId: `summary-owner-${runId}`,
            ownerSummarySentinel,
            peerIdentity,
            peerSummaryId: `summary-peer-${runId}`,
            peerSummarySentinel,
            sessionId,
            sharedMemoryId: `memory-shared-${runId}`,
            sharedMemorySentinel,
            sharedSummaryId: `summary-shared-${runId}`,
            sharedSummarySentinel
        };
        const owner = await createIdentityClient({
            baseUrl   : MC_URL,
            clientName: 'neo-integration-team-private-owner',
            identity  : ownerIdentity
        });
        const peer = await createIdentityClient({
            baseUrl   : MC_URL,
            clientName: 'neo-integration-team-private-peer',
            identity  : peerIdentity
        });
        const unrelated = await createIdentityClient({
            baseUrl   : MC_URL,
            clientName: 'neo-integration-team-private-unrelated',
            identity  : unrelatedIdentity
        });

        try {
            await callJsonTool(owner, 'add_memory', {
                amountToolCalls: 0,
                agent          : ownerIdentity,
                model          : 'integration',
                prompt         : `owner prompt ${ownerMemorySentinel}`,
                response       : `owner response ${ownerMemorySentinel}`,
                sessionId,
                thought        : `owner thought ${ownerMemorySentinel}`,
                toolsUsed      : []
            });
            await callJsonTool(peer, 'add_memory', {
                amountToolCalls: 0,
                agent          : peerIdentity,
                model          : 'integration',
                prompt         : `peer prompt ${peerMemorySentinel}`,
                response       : `peer response ${peerMemorySentinel}`,
                sessionId,
                thought        : `peer thought ${peerMemorySentinel}`,
                toolsUsed      : []
            });

            seedChromaRecords(directSeedPayload);

            // Semantic recall is eventually consistent (server-hosted WAL drain) — await both
            // add_memory writes converging before the boundary assertions below. The direct
            // Chroma seeds above are synchronous and need no convergence.
            await expect.poll(async () => {
                const [o, p] = await Promise.all([
                    callJsonTool(owner, 'query_raw_memories', {nResults: 10, query: ownerMemorySentinel, sessionId, memorySharing: 'private'}),
                    callJsonTool(peer,  'query_raw_memories', {nResults: 10, query: peerMemorySentinel,  sessionId, memorySharing: 'private'})
                ]);
                return memoryTexts(o).includes(ownerMemorySentinel) && memoryTexts(p).includes(peerMemorySentinel);
            }, {timeout: 20000, message: 'WAL drain convergence (owner + peer writes)'}).toBe(true);

            // Private-boundary queries pin `memorySharing: 'private'`: the team default is
            // deployment-wide, so per-tenant raw-memory boundaries are asserted under the policy
            // that enforces them. The shared-commons queries below intentionally use the default
            // (team → shared records remain visible deployment-wide).
            const ownerPrivate = await callJsonTool(owner, 'query_raw_memories', {
                nResults     : 10,
                query        : ownerMemorySentinel,
                sessionId,
                memorySharing: 'private'
            });
            const peerPrivate = await callJsonTool(peer, 'query_raw_memories', {
                nResults     : 10,
                query        : peerMemorySentinel,
                sessionId,
                memorySharing: 'private'
            });
            const unrelatedOwnerPrivate = await callJsonTool(unrelated, 'query_raw_memories', {
                nResults     : 10,
                query        : ownerMemorySentinel,
                sessionId,
                memorySharing: 'private'
            });
            const ownerSharedMemory = await callJsonTool(owner, 'query_raw_memories', {
                nResults: 10,
                query   : sharedMemorySentinel,
                sessionId
            });
            const peerSharedMemory = await callJsonTool(peer, 'query_raw_memories', {
                nResults: 10,
                query   : sharedMemorySentinel,
                sessionId
            });
            const unrelatedSharedMemory = await callJsonTool(unrelated, 'query_raw_memories', {
                nResults: 10,
                query   : sharedMemorySentinel,
                sessionId
            });

            expect(memoryTexts(ownerPrivate)).toContain(ownerMemorySentinel);
            expect(memoryTexts(ownerPrivate)).not.toContain(peerMemorySentinel);
            expect(memoryTexts(peerPrivate)).toContain(peerMemorySentinel);
            expect(memoryTexts(peerPrivate)).not.toContain(ownerMemorySentinel);
            expect(memoryTexts(unrelatedOwnerPrivate)).not.toContain(ownerMemorySentinel);
            expect(memoryTexts(unrelatedOwnerPrivate)).not.toContain(peerMemorySentinel);
            expect(memoryTexts(ownerSharedMemory)).toContain(sharedMemorySentinel);
            expect(memoryTexts(peerSharedMemory)).toContain(sharedMemorySentinel);
            expect(memoryTexts(unrelatedSharedMemory)).toContain(sharedMemorySentinel);

            const ownerSharedSummary = await callJsonTool(owner, 'query_summaries', {
                nResults: 10,
                query   : sharedSummarySentinel
            });
            const peerSharedSummary = await callJsonTool(peer, 'query_summaries', {
                nResults: 10,
                query   : sharedSummarySentinel
            });
            const unrelatedOwnerSummary = await callJsonTool(unrelated, 'query_summaries', {
                nResults: 10,
                query   : ownerSummarySentinel
            });

            expect(summaryTexts(ownerSharedSummary)).toContain(sharedSummarySentinel);
            expect(summaryTexts(ownerSharedSummary)).not.toContain(peerSummarySentinel);
            expect(summaryTexts(peerSharedSummary)).toContain(sharedSummarySentinel);
            expect(summaryTexts(peerSharedSummary)).not.toContain(ownerSummarySentinel);
            expect(summaryTexts(unrelatedOwnerSummary)).not.toContain(ownerSummarySentinel);
            expect(summaryTexts(unrelatedOwnerSummary)).not.toContain(peerSummarySentinel);
        } finally {
            await Promise.allSettled([
                callJsonTool(owner,     'purge_session', {sessionId}),
                callJsonTool(peer,      'purge_session', {sessionId}),
                callJsonTool(unrelated, 'purge_session', {sessionId})
            ]);
            cleanupChromaRecords({
                memoryIds : [directSeedPayload.sharedMemoryId],
                summaryIds: [
                    directSeedPayload.sharedSummaryId,
                    directSeedPayload.ownerSummaryId,
                    directSeedPayload.peerSummaryId
                ]
            });
            await Promise.allSettled([
                owner.close(),
                peer.close(),
                unrelated.close()
            ]);
        }
    });

    test('searches graph nodes by private owner boundary and current team visibility semantics', async () => {
        const readiness = await getReadiness();

        test.skip(readiness.dockerAvailable === false, `Docker unavailable: ${readiness.reason}`);

        expect(readiness.servicesReady, readiness.reason).toBe(true);

        const runId                 = `${Date.now()}-${randomUUID()}`;
        const ownerIdentity         = 'alice';
        const peerIdentity          = 'bob';
        const unrelatedIdentity     = 'charlie';
        const privateGraphSentinel  = `private-graph-${runId}`;
        const teamGraphSentinel     = `team-graph-${runId}`;
        const graphPayload          = {
            ownerIdentity,
            peerIdentity,
            privateGraphSentinel,
            privateNodeId: `graph-private-${runId}`,
            teamGraphSentinel,
            teamNodeId: `graph-team-${runId}`,
            unrelatedIdentity
        };
        const owner = await createIdentityClient({
            baseUrl   : MC_URL,
            clientName: 'neo-integration-team-private-graph-owner',
            identity  : ownerIdentity
        });
        const peer = await createIdentityClient({
            baseUrl   : MC_URL,
            clientName: 'neo-integration-team-private-graph-peer',
            identity  : peerIdentity
        });
        const unrelated = await createIdentityClient({
            baseUrl   : MC_URL,
            clientName: 'neo-integration-team-private-graph-unrelated',
            identity  : unrelatedIdentity
        });

        let seedResult;

        try {
            seedResult = seedGraphRecords(graphPayload);

            const ownerPrivate = await callJsonTool(owner, 'search_nodes', {
                query: privateGraphSentinel
            });
            const peerPrivate = await callJsonTool(peer, 'search_nodes', {
                query: privateGraphSentinel
            });
            const ownerTeam = await callJsonTool(owner, 'search_nodes', {
                query: teamGraphSentinel
            });
            const peerTeam = await callJsonTool(peer, 'search_nodes', {
                query: teamGraphSentinel
            });
            const unrelatedTeam = await callJsonTool(unrelated, 'search_nodes', {
                query: teamGraphSentinel
            });

            expect(nodeTexts(ownerPrivate)).toContain(privateGraphSentinel);
            expect(nodeTexts(peerPrivate)).not.toContain(privateGraphSentinel);
            expect(nodeTexts(ownerTeam)).toContain(teamGraphSentinel);
            expect(nodeTexts(peerTeam)).toContain(teamGraphSentinel);

            // The current substrate models `visibility: "team"` as broad team-visible graph
            // RLS bypass. Membership-qualified team authorization is future scope (tracked outside this fixture).
            expect(nodeTexts(unrelatedTeam)).toContain(teamGraphSentinel);
        } finally {
            cleanupGraphRecords({
                nodeIds        : [graphPayload.privateNodeId, graphPayload.teamNodeId],
                identityNodeIds: seedResult?.identityNodeIds || []
            });
            await Promise.allSettled([
                owner.close(),
                peer.close(),
                unrelated.close()
            ]);
        }
    });
});
