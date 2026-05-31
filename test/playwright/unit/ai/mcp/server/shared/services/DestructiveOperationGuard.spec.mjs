import {setup} from '../../../../../../setup.mjs';

const appName = 'DestructiveOperationGuardTest';

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
import * as core      from '../../../../../../../../src/core/_export.mjs';
import fs             from 'fs';
import os             from 'os';
import path           from 'path';
import DestructiveOperationGuard, {
    DESTRUCTIVE_PRODUCTION_BYPASS_ENV,
    DESTRUCTIVE_PRODUCTION_CONFIRMATION
} from '../../../../../../../../ai/mcp/server/shared/services/DestructiveOperationGuard.mjs';
import CollectionProxy from '../../../../../../../../ai/services/memory-core/managers/CollectionProxy.mjs';
import MemoryDatabaseService from '../../../../../../../../ai/services/memory-core/DatabaseService.mjs';
import KbChromaManager from '../../../../../../../../ai/services/knowledge-base/ChromaManager.mjs';
import KbVectorService from '../../../../../../../../ai/services/knowledge-base/VectorService.mjs';
import aiConfig from '../../../../../../../../ai/mcp/server/memory-core/config.mjs';

const repoRoot = process.cwd();

test.describe('Neo.ai.mcp.server.shared.services.DestructiveOperationGuard (#10845)', () => {
    test('permits in-memory SQLite targets', async () => {
        const result = await DestructiveOperationGuard.assertDestructiveTargetAllowed({
            operation: 'memory-core.graph.truncate',
            subsystem: 'memory-core',
            mode     : 'truncate',
            target   : {
                sqlitePath: ':memory:',
                repoRoot
            },
            env: {}
        });

        expect(result.classification).toBe('disposable');
    });

    test('permits targets under the OS temp directory', async () => {
        const result = await DestructiveOperationGuard.assertDestructiveTargetAllowed({
            operation: 'knowledge-base.chroma.delete',
            subsystem: 'knowledge-base',
            mode     : 'delete',
            target   : {
                path: path.join(os.tmpdir(), 'neo-destructive-guard-test', 'chroma'),
                repoRoot
            },
            env: {}
        });

        expect(result.classification).toBe('disposable');
    });

    test('permits targets under the repository tmp directory', async () => {
        const result = await DestructiveOperationGuard.assertDestructiveTargetAllowed({
            operation: 'memory-core.memory.drop',
            subsystem: 'memory-core',
            mode     : 'drop',
            target   : {
                path: path.join(repoRoot, 'tmp', 'memory-core-chroma-test'),
                repoRoot
            },
            env: {}
        });

        expect(result.classification).toBe('disposable');
    });

    test('blocks production Memory Core SQLite targets by default', async () => {
        await expect(DestructiveOperationGuard.assertDestructiveTargetAllowed({
            operation: 'memory-core.graph.truncate',
            subsystem: 'memory-core',
            mode     : 'truncate',
            target   : {
                sqlitePath: path.join(repoRoot, '.neo-ai-data/sqlite/memory-core-graph.sqlite'),
                repoRoot
            },
            env: {}
        })).rejects.toMatchObject({
            code  : 'DESTRUCTIVE_TARGET_BLOCKED',
            reason: expect.stringContaining('not disposable')
        });
    });

    test('blocks production Knowledge Base Chroma targets by default', async () => {
        await expect(DestructiveOperationGuard.assertDestructiveTargetAllowed({
            operation: 'knowledge-base.chroma.delete',
            subsystem: 'knowledge-base',
            mode     : 'delete',
            target   : {
                collectionName: 'neo-knowledge-base',
                path          : path.join(repoRoot, '.neo-ai-data/chroma/unified'),
                repoRoot
            },
            env: {}
        })).rejects.toMatchObject({
            code: 'DESTRUCTIVE_TARGET_BLOCKED'
        });
    });

    test('blocks unresolved collection-only targets by default', async () => {
        await expect(DestructiveOperationGuard.assertDestructiveTargetAllowed({
            operation: 'memory-core.memory.drop',
            subsystem: 'memory-core',
            mode     : 'drop',
            target   : {
                collectionName: 'neo-agent-memory',
                repoRoot
            },
            env: {}
        })).rejects.toMatchObject({
            code  : 'DESTRUCTIVE_TARGET_BLOCKED',
            reason: expect.stringContaining('does not include')
        });
    });

    test('does not treat UNIT_TEST_MODE as destructive-operation authorization', async () => {
        await expect(DestructiveOperationGuard.assertDestructiveTargetAllowed({
            operation: 'memory-core.memory.drop',
            subsystem: 'memory-core',
            mode     : 'drop',
            target   : {
                path: path.join(repoRoot, '.neo-ai-data/chroma/unified'),
                repoRoot
            },
            env: {
                UNIT_TEST_MODE: 'true'
            }
        })).rejects.toMatchObject({
            code: 'DESTRUCTIVE_TARGET_BLOCKED'
        });
    });

    test('requires both bypass env and explicit confirmation for production targets', async () => {
        const target = {
            path: path.join(repoRoot, '.neo-ai-data/chroma/unified'),
            repoRoot
        };

        await expect(DestructiveOperationGuard.assertDestructiveTargetAllowed({
            operation: 'memory-core.memory.drop',
            subsystem: 'memory-core',
            mode     : 'drop',
            target,
            env: {
                [DESTRUCTIVE_PRODUCTION_BYPASS_ENV]: 'true'
            }
        })).rejects.toMatchObject({
            code: 'DESTRUCTIVE_TARGET_BLOCKED'
        });

        const result = await DestructiveOperationGuard.assertDestructiveTargetAllowed({
            operation: 'memory-core.memory.drop',
            subsystem: 'memory-core',
            mode     : 'drop',
            target,
            confirmation: DESTRUCTIVE_PRODUCTION_CONFIRMATION,
            env         : {
                [DESTRUCTIVE_PRODUCTION_BYPASS_ENV]: 'true'
            }
        });

        expect(result.classification).toBe('operator-confirmed');
    });

    test('blocks mixed target descriptors when any destination path is production-like', async () => {
        await expect(DestructiveOperationGuard.assertDestructiveTargetAllowed({
            operation: 'restore.replace',
            subsystem: 'memory-core',
            mode     : 'replace',
            target   : {
                path      : path.join(os.tmpdir(), 'neo-destructive-guard-safe'),
                sqlitePath: path.join(repoRoot, '.neo-ai-data/sqlite/memory-core-graph.sqlite'),
                repoRoot
            },
            env: {}
        })).rejects.toMatchObject({
            code: 'DESTRUCTIVE_TARGET_BLOCKED'
        });
    });
});

test.describe('DestructiveOperationGuard call-site wiring (#10845)', () => {
    const skipCiSubstrateData = !!process.env.NEO_TEST_SKIP_CI;

    test('Memory Core CollectionProxy stops before deleting a production Chroma collection', async () => {
        const proxy = Neo.create(CollectionProxy, {
            collectionType: 'memory'
        });
        let deleteCalls = 0;

        proxy.getManagers = async () => [{
            getMemoryCollection: async () => ({
                name: 'neo-agent-memory'
            }),
            client: {
                deleteCollection: async () => {
                    deleteCalls++;
                }
            }
        }];

        await expect(proxy.drop()).rejects.toMatchObject({
            code: 'DESTRUCTIVE_TARGET_BLOCKED'
        });
        expect(deleteCalls).toBe(0);
    });

    test('Memory Core graph truncate stops before SQLite deletion on the production graph path', async () => {
        test.skip(skipCiSubstrateData, 'CI-skip: substrate data not seeded - bucket C (#10903)');

        const originalGraphPath = aiConfig.storagePaths.graph;
        try {
            aiConfig.storagePaths.graph = path.join(repoRoot, '.neo-ai-data/sqlite/memory-core-graph.sqlite');

            await expect(MemoryDatabaseService.truncateDatabase({
                include: ['graph']
            })).rejects.toMatchObject({
                code   : 'DATABASE_TRUNCATE_ERROR',
                message: expect.stringContaining('DESTRUCTIVE_TARGET_BLOCKED')
            });
        } finally {
            aiConfig.storagePaths.graph = originalGraphPath;
        }
    });

    test('Knowledge Base VectorService stops before deleting the production collection', async () => {
        const originalClient = KbChromaManager.client;
        let deleteCalls      = 0;

        KbChromaManager.client = {
            deleteCollection: async () => {
                deleteCalls++;
            }
        };

        try {
            await expect(KbVectorService.deleteCollection()).rejects.toMatchObject({
                code: 'DESTRUCTIVE_TARGET_BLOCKED'
            });
            expect(deleteCalls).toBe(0);
        } finally {
            KbChromaManager.client = originalClient;
        }
    });

    test('destructive Memory Core and Knowledge Base surfaces call the shared guard', () => {
        const expected = [
            'ai/services/memory-core/managers/CollectionProxy.mjs',
            'ai/services/memory-core/DatabaseService.mjs',
            'ai/services/knowledge-base/VectorService.mjs'
        ];

        for (const relativePath of expected) {
            const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

            expect(source).toContain('DestructiveOperationGuard');
            expect(source).toContain('assertDestructiveTargetAllowed');
        }
    });
});
