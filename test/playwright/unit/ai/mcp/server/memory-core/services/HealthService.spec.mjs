import {setup} from '../../../../../../setup.mjs';

const appName = 'HealthServiceTest';

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
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../../../src/manager/Instance.mjs';

/**
 * @summary Coverage for the #10176 identity observability block in the healthcheck payload.
 *
 * The integration test (HealthService.healthcheck() end-to-end) requires ChromaDB + StorageRouter
 * + multiple service singletons. Those are out of scope here — this spec pins the PURE projection
 * logic via `buildIdentityBlock`, which is the load-bearing function for the AC shape contract.
 * Integration correctness is validated post-merge via empirical restart + healthcheck inspection.
 *
 * @see Neo.ai.mcp.server.memory-core.services.HealthService#buildIdentityBlock
 */
test.describe('HealthService #10176 — buildIdentityBlock', () => {
    let buildIdentityBlock;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../../../ai/mcp/server/memory-core/services/HealthService.mjs');
        buildIdentityBlock = mod.buildIdentityBlock;
    });


    test('null state projects to unresolved + unbound', () => {
        expect(buildIdentityBlock(null)).toEqual({
            source: 'unresolved',
            bound : false,
            nodeId: null
        });
    });

    test('explicit unresolved state (resolver yielded no userId) projects to unresolved + unbound', () => {
        // StdioIdentityResolver's failure mode: env-var missing AND gh-cli failed/timed-out.
        // Server.mjs may pass through the explicit shape or null — both paths land in the
        // same observable state. This covers the explicit-shape path.
        const state = {userId: null, agentIdentityNodeId: null, source: 'unresolved'};
        expect(buildIdentityBlock(state)).toEqual({
            source: 'unresolved',
            bound : false,
            nodeId: null
        });
    });

    test('env-var resolution with matching graph node projects to bound', () => {
        // The expected success shape for A2A operation: NEO_AGENT_IDENTITY env var pinned at
        // harness level, graph node seeded (#10232 boot-time self-seed), bindAgentIdentity
        // resolved the node at boot.
        const state = {
            userId             : 'neo-opus-4-7',
            agentIdentityNodeId: '@neo-opus-4-7',
            source             : 'env-var'
        };
        expect(buildIdentityBlock(state)).toEqual({
            source: 'env-var',
            bound : true,
            nodeId: '@neo-opus-4-7'
        });
    });

    test('gh-cli resolution with matching graph node projects to bound', () => {
        // Human-developer path or harness without NEO_AGENT_IDENTITY pin: gh CLI resolves
        // the authenticated login, graph has the seeded node, bindAgentIdentity succeeds.
        const state = {
            userId             : 'tobiu',
            agentIdentityNodeId: '@tobiu',
            source             : 'gh-cli'
        };
        expect(buildIdentityBlock(state)).toEqual({
            source: 'gh-cli',
            bound : true,
            nodeId: '@tobiu'
        });
    });

    test('resolved userId without graph node projects to unbound (seed-state failure signal)', () => {
        // Diagnostic shape: resolver worked (env-var or gh-cli yielded a login), but the
        // AgentIdentity graph node for that login doesn't exist. This is THE signal #10176
        // was filed to surface — operator immediately knows to run seedAgentIdentities.mjs
        // OR verify #10232 self-seed fired on boot.
        const state = {
            userId             : 'neo-opus-4-7',
            agentIdentityNodeId: null,
            source             : 'env-var'
        };
        expect(buildIdentityBlock(state)).toEqual({
            source: 'env-var',
            bound : false,
            nodeId: null
        });
    });

    test('missing source defaults to unresolved', () => {
        // Defense-in-depth: if a caller ever passes a state with userId but no source field
        // (shouldn't happen per StdioIdentityResolver contract, but guard against drift),
        // we project to the safe 'unresolved' value rather than undefined/leaked.
        const state = {
            userId             : 'neo-opus-4-7',
            agentIdentityNodeId: '@neo-opus-4-7'
            // no source
        };
        expect(buildIdentityBlock(state)).toEqual({
            source: 'unresolved',
            bound : true,
            nodeId: '@neo-opus-4-7'
        });
    });
});

/**
 * @summary Coverage for the #10127 topology observability block in the healthcheck payload.
 *
 * Mirrors the #10176 precedent above: the end-to-end integration path requires a live ChromaDB
 * plus the full StorageRouter/ChromaManager singleton bootstrap, which is out of scope for a
 * pure-projection unit test. This spec pins the contract of `buildTopologyBlock` — the module-scope
 * pure function consumed from `#performHealthCheck` to fill `database.topology`. Integration
 * correctness (does the value reach the MCP healthcheck response under both real topologies?) is
 * validated empirically post-merge via harness restart + healthcheck inspection.
 *
 * The function delegates coordinate resolution to `ChromaManager.resolveChromaCoordinates` — a pure
 * method extracted in #10001 whose own unit coverage exists separately. Here we verify the three
 * surface properties operators consume: `mode` (unified vs federated), `coordinates` (pass-through
 * of the resolver's output), and `resolvedVia` (the config-key-path string that names which branch
 * won).
 *
 * @see Neo.ai.mcp.server.memory-core.services.HealthService#buildTopologyBlock
 * @see Neo.ai.mcp.server.memory-core.managers.ChromaManager#resolveChromaCoordinates
 */
test.describe('HealthService #10127 — buildTopologyBlock', () => {
    let buildTopologyBlock;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../../../ai/mcp/server/memory-core/services/HealthService.mjs');
        buildTopologyBlock = mod.buildTopologyBlock;
    });

    test('federated mode surfaces engines.chroma coordinates + resolvedVia path', () => {
        // Default production topology: Memory Core owns its own ChromaDB, KB owns a separate one.
        // `chromaUnified` unset/false → resolver returns `engines.chroma`, `resolvedVia` names that
        // exact config key path so operators inspecting a wrong host/port know where to look.
        const cfg = {
            chromaUnified: false,
            engines: {
                chroma: {host: 'localhost', port: 8100},
                kb    : {chroma: {host: 'localhost', port: 8000}}
            }
        };
        expect(buildTopologyBlock(cfg)).toEqual({
            mode       : 'federated',
            coordinates: {host: 'localhost', port: 8100},
            resolvedVia: 'engines.chroma'
        });
    });

    test('unified mode surfaces engines.kb.chroma coordinates + resolvedVia path', () => {
        // Sub-epic #10015 unified topology: Memory Core reuses the KB's ChromaDB instance. The whole
        // point of the `/health` topology surface is making this mode verifiable from the wire —
        // `mode: 'unified'` confirms the `NEO_CHROMA_UNIFIED=true` flag took effect, `coordinates`
        // pins the exact KB-owned endpoint, `resolvedVia` names the config branch the resolver walked.
        const cfg = {
            chromaUnified: true,
            engines: {
                chroma: {host: 'localhost', port: 8100},
                kb    : {chroma: {host: 'localhost', port: 8000}}
            }
        };
        expect(buildTopologyBlock(cfg)).toEqual({
            mode       : 'unified',
            coordinates: {host: 'localhost', port: 8000},
            resolvedVia: 'engines.kb.chroma'
        });
    });

    test('unified mode with missing engines.kb.chroma surfaces error, does not throw', () => {
        // Misconfig path: a custom config override clobbers `engines.kb` while leaving
        // `chromaUnified=true`. `resolveChromaCoordinates` throws a descriptive error. Healthcheck
        // must NOT propagate the throw — the remaining observability surface (identity, mailbox,
        // migration) is still valuable, and the topology block itself is the right place to
        // surface the misconfig as observable data. `coordinates: null` + `error` string aligns
        // with the "surface, don't obscure" principle codified in PR #10227.
        const cfg = {
            chromaUnified: true,
            engines: {
                chroma: {host: 'localhost', port: 8100}
                // engines.kb deliberately absent
            }
        };
        const result = buildTopologyBlock(cfg);
        expect(result.mode).toBe('unified');
        expect(result.coordinates).toBeNull();
        expect(result.resolvedVia).toBe('engines.kb.chroma');
        expect(result.error).toMatch(/engines\.kb\.chroma/);
    });
});

/**
 * @summary Coverage for the #10723/#10773 embedding-provider observability block in the healthcheck payload.
 *
 * Pins the pure-projection contract of `buildEmbeddingProviderBlock` — the module-scope function
 * that extracts active Chroma-side and SQLite-side embedding-provider state from `aiConfig` for the
 * healthcheck `providers.embedding` field. Integration correctness (live provider request) is
 * operator-territory L3 validation against a running local-model server; this spec covers the L1-L2
 * substrate shape that operators rely on to verify the provider configured matches the provider
 * actually selected at boot.
 *
 * @see Neo.ai.mcp.server.memory-core.services.HealthService#buildEmbeddingProviderBlock
 */
test.describe('HealthService #10723/#10773 — buildEmbeddingProviderBlock', () => {
    let buildEmbeddingProviderBlock;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../../../ai/mcp/server/memory-core/services/HealthService.mjs');
        buildEmbeddingProviderBlock = mod.buildEmbeddingProviderBlock;
    });

    test('same openAiCompatible providers surface chroma + neo sub-blocks and aligned=true', () => {
        const cfg = {
            chromaEmbeddingProvider: 'openAiCompatible',
            neoEmbeddingProvider   : 'openAiCompatible',
            vectorDimension        : 4096,
            openAiCompatible       : {
                host          : 'http://127.0.0.1:8000',
                embeddingModel: 'text-embedding-qwen3-embedding-1.5b'
            }
        };
        expect(buildEmbeddingProviderBlock(cfg)).toEqual({
            aligned: true,
            chroma : {
                active    : 'openAiCompatible',
                host      : 'http://127.0.0.1:8000',
                model     : 'text-embedding-qwen3-embedding-1.5b',
                dimensions: 4096
            },
            neo: {
                active    : 'openAiCompatible',
                host      : 'http://127.0.0.1:8000',
                model     : 'text-embedding-qwen3-embedding-1.5b',
                dimensions: 4096
            }
        });
    });

    test('diverged providers surface mismatch at-a-glance', () => {
        const cfg = {
            chromaEmbeddingProvider: 'gemini',
            neoEmbeddingProvider   : 'openAiCompatible',
            vectorDimension        : 4096,
            embeddingModel         : 'gemini-embedding-001',
            openAiCompatible       : {
                host          : 'http://127.0.0.1:8000',
                embeddingModel: 'text-embedding-qwen3-embedding-8b'
            }
        };
        expect(buildEmbeddingProviderBlock(cfg)).toEqual({
            aligned: false,
            chroma : {
                active    : 'gemini',
                host      : null,
                model     : 'gemini-embedding-001',
                dimensions: 4096
            },
            neo: {
                active    : 'openAiCompatible',
                host      : 'http://127.0.0.1:8000',
                model     : 'text-embedding-qwen3-embedding-8b',
                dimensions: 4096
            }
        });
    });

    test('ollama provider surfaces host + embeddingModel + dimensions for both engines', () => {
        const cfg = {
            chromaEmbeddingProvider: 'ollama',
            neoEmbeddingProvider   : 'ollama',
            vectorDimension        : 4096,
            ollama                 : {
                host          : 'http://127.0.0.1:11434',
                embeddingModel: 'qwen3-embedding'
            }
        };
        expect(buildEmbeddingProviderBlock(cfg)).toEqual({
            aligned: true,
            chroma : {
                active    : 'ollama',
                host      : 'http://127.0.0.1:11434',
                model     : 'qwen3-embedding',
                dimensions: 4096
            },
            neo: {
                active    : 'ollama',
                host      : 'http://127.0.0.1:11434',
                model     : 'qwen3-embedding',
                dimensions: 4096
            }
        });
    });

    test('unset neoEmbeddingProvider defaults SQLite-side provider to gemini', () => {
        const cfg = {
            chromaEmbeddingProvider: 'gemini',
            vectorDimension        : 3072,
            embeddingModel         : 'gemini-embedding-001'
        };
        expect(buildEmbeddingProviderBlock(cfg)).toEqual({
            aligned: true,
            chroma : {
                active    : 'gemini',
                host      : null,
                model     : 'gemini-embedding-001',
                dimensions: 3072
            },
            neo: {
                active    : 'gemini',
                host      : null,
                model     : 'gemini-embedding-001',
                dimensions: 3072
            }
        });
    });

    test('unrecognized providers surface scoped error fields, do not throw', () => {
        const cfg = {
            chromaEmbeddingProvider: 'fooProvider',
            neoEmbeddingProvider   : 'barProvider',
            vectorDimension        : 4096
        };
        const result = buildEmbeddingProviderBlock(cfg);
        expect(result.aligned).toBe(false);
        expect(result.chroma.active).toBe('fooProvider');
        expect(result.chroma.host).toBeNull();
        expect(result.chroma.model).toBeNull();
        expect(result.chroma.dimensions).toBe(4096);
        expect(result.chroma.error).toMatch(/Unrecognized chromaEmbeddingProvider/);
        expect(result.neo.active).toBe('barProvider');
        expect(result.neo.host).toBeNull();
        expect(result.neo.model).toBeNull();
        expect(result.neo.dimensions).toBe(4096);
        expect(result.neo.error).toMatch(/Unrecognized neoEmbeddingProvider/);
    });

    test('openAiCompatible without nested config surfaces null host + null model + dimensions for both engines', () => {
        const cfg = {
            chromaEmbeddingProvider: 'openAiCompatible',
            neoEmbeddingProvider   : 'openAiCompatible',
            vectorDimension        : 4096
            // openAiCompatible config block deliberately absent — defensive against incomplete config
        };
        expect(buildEmbeddingProviderBlock(cfg)).toEqual({
            aligned: true,
            chroma : {
                active    : 'openAiCompatible',
                host      : null,
                model     : null,
                dimensions: 4096
            },
            neo: {
                active    : 'openAiCompatible',
                host      : null,
                model     : null,
                dimensions: 4096
            }
        });
    });

    test('dimensions fields always reflect vectorDimension regardless of provider', () => {
        for (const provider of ['gemini', 'openAiCompatible', 'ollama', 'unrecognized']) {
            const cfg = {chromaEmbeddingProvider: provider, neoEmbeddingProvider: provider, vectorDimension: 768};
            const result = buildEmbeddingProviderBlock(cfg);
            expect(result.chroma.dimensions).toBe(768);
            expect(result.neo.dimensions).toBe(768);
        }
    });
});

/**
 * @summary Coverage for the #10724 summary-provider observability block in the healthcheck payload.
 *
 * Mirrors the sibling `providers.embedding` block from #10723: the end-to-end healthcheck depends on
 * live Memory Core services, while the load-bearing contract for operators is the pure projection of
 * active summary-provider config into a secret-free `providers.summary` shape.
 *
 * @see Neo.ai.mcp.server.memory-core.services.HealthService#buildSummaryProviderBlock
 */
test.describe('HealthService #10724 — buildSummaryProviderBlock', () => {
    let buildSummaryProviderBlock;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../../../ai/mcp/server/memory-core/services/HealthService.mjs');
        buildSummaryProviderBlock = mod.buildSummaryProviderBlock;
    });

    test('openAiCompatible config surfaces Qwen3 chat endpoint without leaking API key value', () => {
        const result = buildSummaryProviderBlock({
            modelProvider: 'openAiCompatible',
            openAiCompatible: {
                host  : 'http://127.0.0.1:11434',
                model : 'qwen3-8b',
                apiKey: 'secret-value'
            }
        });

        expect(result).toEqual({
            active    : 'openAiCompatible',
            host      : 'http://127.0.0.1:11434',
            model     : 'qwen3-8b',
            endpoint  : 'http://127.0.0.1:11434/v1/chat/completions',
            local     : true,
            credential: {
                env       : 'NEO_OPENAI_COMPATIBLE_API_KEY',
                configured: true,
                required  : false
            }
        });
    });

    test('gemini config surfaces the Gemini key requirement', () => {
        const result = buildSummaryProviderBlock({
            modelProvider: 'gemini',
            modelName    : 'gemini-2.5-flash'
        }, {GEMINI_API_KEY: ''});

        expect(result).toEqual({
            active    : 'gemini',
            host      : null,
            model     : 'gemini-2.5-flash',
            endpoint  : null,
            local     : false,
            credential: {
                env       : 'GEMINI_API_KEY',
                configured: false,
                required  : true
            }
        });
    });
});
