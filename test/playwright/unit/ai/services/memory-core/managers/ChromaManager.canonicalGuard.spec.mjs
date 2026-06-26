import {setup} from '../../../../../setup.mjs';

const appName = 'ChromaManagerCanonicalGuardTest';

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

import {test, expect}      from '@playwright/test';
import Neo                 from '../../../../../../../src/Neo.mjs';
import * as core           from '../../../../../../../src/core/_export.mjs';
import {
    assertCanonicalCollectionDeleteAllowed,
    CanonicalCollectionGuardError,
    DESTRUCTIVE_PRODUCTION_CONFIRMATION,
    GUARDED_CANONICAL_COLLECTION_NAMES
} from '../../../../../../../ai/mcp/server/shared/services/DestructiveOperationGuard.mjs';

test.describe('Neo.ai.mcp.server.shared.services.DestructiveOperationGuard — canonical-collection guard (#11652)', () => {

    test('Set of canonical names covers MC + KB production collections', () => {
        expect(GUARDED_CANONICAL_COLLECTION_NAMES.has('neo-agent-memory')).toBe(true);
        expect(GUARDED_CANONICAL_COLLECTION_NAMES.has('neo-agent-sessions')).toBe(true);
        expect(GUARDED_CANONICAL_COLLECTION_NAMES.has('neo-native-graph')).toBe(true);
        expect(GUARDED_CANONICAL_COLLECTION_NAMES.has('neo-knowledge-base')).toBe(true);
    });

    test('Refuses non-canonical (test-prefixed) name without UNIT_TEST_MODE — uniform-gate (#11656 RA1)', () => {
        // Per #11656 Cycle 1 review (commentId PRR_kwDODSospM8AAAABAYwPjg, Required Action 1):
        // the guard fires for EVERY destructive collection-delete regardless of name. Non-canonical
        // names are not a free bypass — a production caller invoking
        // `deleteCollection({name: 'arbitrary'})` without UNIT_TEST_MODE or a confirmation token
        // is a fail-closed scenario, not a quiet pass-through. Test-prefixed names ARE the
        // test-isolation surface — but their isolation is via UNIT_TEST_MODE-aware config, not
        // by being implicitly trusted at the deleteCollection boundary.
        const previous = process.env.UNIT_TEST_MODE;
        try {
            delete process.env.UNIT_TEST_MODE;
            expect(() => assertCanonicalCollectionDeleteAllowed({
                name     : 'test-memory-12345',
                subsystem: 'memory-core'
            })).toThrow(CanonicalCollectionGuardError);
        } finally {
            if (previous === undefined) delete process.env.UNIT_TEST_MODE;
            else process.env.UNIT_TEST_MODE = previous;
        }
    });

    test('Allows non-canonical (test-prefixed) name when UNIT_TEST_MODE=true', () => {
        // The bypass path for non-canonical names: UNIT_TEST_MODE=true is sufficient. The
        // CanonicalCollectionGuardError diagnostic message distinguishes canonical vs non-
        // canonical for operator clarity even though the gate is uniform.
        const previous = process.env.UNIT_TEST_MODE;
        try {
            process.env.UNIT_TEST_MODE = 'true';
            expect(() => assertCanonicalCollectionDeleteAllowed({
                name     : 'test-memory-12345',
                subsystem: 'memory-core'
            })).not.toThrow();
        } finally {
            if (previous === undefined) delete process.env.UNIT_TEST_MODE;
            else process.env.UNIT_TEST_MODE = previous;
        }
    });

    test('Allows canonical name when UNIT_TEST_MODE=true (test-isolation bypass)', () => {
        const previous = process.env.UNIT_TEST_MODE;
        try {
            process.env.UNIT_TEST_MODE = 'true';
            expect(() => assertCanonicalCollectionDeleteAllowed({
                name     : 'neo-agent-memory',
                subsystem: 'memory-core'
            })).not.toThrow();
        } finally {
            if (previous === undefined) delete process.env.UNIT_TEST_MODE;
            else process.env.UNIT_TEST_MODE = previous;
        }
    });

    test('Allows canonical name with explicit production confirmation token (operator recovery bypass)', () => {
        const previous = process.env.UNIT_TEST_MODE;
        try {
            delete process.env.UNIT_TEST_MODE;
            expect(() => assertCanonicalCollectionDeleteAllowed({
                name        : 'neo-knowledge-base',
                subsystem   : 'knowledge-base',
                confirmation: DESTRUCTIVE_PRODUCTION_CONFIRMATION
            })).not.toThrow();
        } finally {
            if (previous === undefined) delete process.env.UNIT_TEST_MODE;
            else process.env.UNIT_TEST_MODE = previous;
        }
    });

    test('Refuses canonical name without UNIT_TEST_MODE and without confirmation (the npx playwright attack surface)', () => {
        const previous = process.env.UNIT_TEST_MODE;
        try {
            delete process.env.UNIT_TEST_MODE;
            expect(() => assertCanonicalCollectionDeleteAllowed({
                name     : 'neo-agent-memory',
                subsystem: 'memory-core'
            })).toThrow(CanonicalCollectionGuardError);
        } finally {
            if (previous === undefined) delete process.env.UNIT_TEST_MODE;
            else process.env.UNIT_TEST_MODE = previous;
        }
    });

    test('Refuses canonical name with invalid confirmation token', () => {
        const previous = process.env.UNIT_TEST_MODE;
        try {
            delete process.env.UNIT_TEST_MODE;
            expect(() => assertCanonicalCollectionDeleteAllowed({
                name        : 'neo-agent-sessions',
                subsystem   : 'memory-core',
                confirmation: 'wrong-token'
            })).toThrow(CanonicalCollectionGuardError);
        } finally {
            if (previous === undefined) delete process.env.UNIT_TEST_MODE;
            else process.env.UNIT_TEST_MODE = previous;
        }
    });

    test('Error carries stable code CANONICAL_COLLECTION_GUARDED for caller pattern-matching', () => {
        const previous = process.env.UNIT_TEST_MODE;
        try {
            delete process.env.UNIT_TEST_MODE;
            try {
                assertCanonicalCollectionDeleteAllowed({
                    name     : 'neo-knowledge-base',
                    subsystem: 'knowledge-base'
                });
                throw new Error('expected throw, got nothing');
            } catch (err) {
                expect(err).toBeInstanceOf(CanonicalCollectionGuardError);
                expect(err.code).toBe('CANONICAL_COLLECTION_GUARDED');
                expect(err.collection).toBe('neo-knowledge-base');
                expect(err.subsystem).toBe('knowledge-base');
                expect(err.isCanonical).toBe(true);
            }
        } finally {
            if (previous === undefined) delete process.env.UNIT_TEST_MODE;
            else process.env.UNIT_TEST_MODE = previous;
        }
    });

    test('Error.isCanonical=false distinguishes non-canonical refusals in diagnostics', () => {
        const previous = process.env.UNIT_TEST_MODE;
        try {
            delete process.env.UNIT_TEST_MODE;
            try {
                assertCanonicalCollectionDeleteAllowed({
                    name     : 'arbitrary-collection',
                    subsystem: 'memory-core'
                });
                throw new Error('expected throw, got nothing');
            } catch (err) {
                expect(err).toBeInstanceOf(CanonicalCollectionGuardError);
                expect(err.isCanonical).toBe(false);
                expect(err.message).toContain('non-canonical');
            }
        } finally {
            if (previous === undefined) delete process.env.UNIT_TEST_MODE;
            else process.env.UNIT_TEST_MODE = previous;
        }
    });
});

test.describe('Neo.ai.services.memory-core.managers.ChromaManager#deleteCollection — guard integration (#11652)', () => {

    test('ChromaManager.deleteCollection invokes the canonical guard before chromadb client', async () => {
        const ChromaManager = (await import('../../../../../../../ai/services/memory-core/managers/ChromaManager.mjs')).default;

        const originalClient = ChromaManager.client;
        let clientCalled     = false;
        ChromaManager.client = {
            deleteCollection: async () => { clientCalled = true; }
        };
        const previousEnv = process.env.UNIT_TEST_MODE;

        try {
            delete process.env.UNIT_TEST_MODE;
            await expect(ChromaManager.deleteCollection({name: 'neo-agent-memory'}))
                .rejects.toThrow(CanonicalCollectionGuardError);
            expect(clientCalled).toBe(false);
        } finally {
            ChromaManager.client = originalClient;
            if (previousEnv === undefined) delete process.env.UNIT_TEST_MODE;
            else process.env.UNIT_TEST_MODE = previousEnv;
        }
    });

    test('ChromaManager.deleteCollection forwards to client when guard passes (UNIT_TEST_MODE=true)', async () => {
        const ChromaManager = (await import('../../../../../../../ai/services/memory-core/managers/ChromaManager.mjs')).default;

        const originalClient = ChromaManager.client;
        let receivedArgs     = null;
        ChromaManager.client = {
            deleteCollection: async (args) => { receivedArgs = args; return 'ok'; }
        };
        const previousEnv = process.env.UNIT_TEST_MODE;

        try {
            process.env.UNIT_TEST_MODE = 'true';
            const result = await ChromaManager.deleteCollection({name: 'neo-agent-memory'});
            expect(result).toBe('ok');
            expect(receivedArgs).toEqual({name: 'neo-agent-memory'});
        } finally {
            ChromaManager.client = originalClient;
            if (previousEnv === undefined) delete process.env.UNIT_TEST_MODE;
            else process.env.UNIT_TEST_MODE = previousEnv;
        }
    });

    test('ChromaManager.deleteCollection forwards to client when confirmation token bypasses canonical guard', async () => {
        const ChromaManager = (await import('../../../../../../../ai/services/memory-core/managers/ChromaManager.mjs')).default;

        const originalClient = ChromaManager.client;
        let receivedArgs     = null;
        ChromaManager.client = {
            deleteCollection: async (args) => { receivedArgs = args; return 'ok'; }
        };
        const previousEnv = process.env.UNIT_TEST_MODE;

        try {
            delete process.env.UNIT_TEST_MODE;
            const result = await ChromaManager.deleteCollection({
                name        : 'neo-agent-memory',
                confirmation: DESTRUCTIVE_PRODUCTION_CONFIRMATION
            });
            expect(result).toBe('ok');
            // confirmation is consumed at the guard layer; not forwarded to the chromadb-client.
            expect(receivedArgs).toEqual({name: 'neo-agent-memory'});
        } finally {
            ChromaManager.client = originalClient;
            if (previousEnv === undefined) delete process.env.UNIT_TEST_MODE;
            else process.env.UNIT_TEST_MODE = previousEnv;
        }
    });
});

// Symmetric coverage on the Knowledge Base side per #11656 review Required Action 3
// (commentId PRR_kwDODSospM8AAAABAYwPjg). The MC wrapper and KB wrapper are independent
// classes that share the underlying `assertCanonicalCollectionDeleteAllowed` helper but
// differ in subsystem label, canonical name targeted, and surrounding service surface.
// Direct integration tests on the KB wrapper close the parity gap from Cycle 1.
test.describe('Neo.ai.services.knowledge-base.ChromaManager#deleteCollection — guard integration (#11652)', () => {

    test('KB ChromaManager.deleteCollection refuses canonical name without UNIT_TEST_MODE or confirmation', async () => {
        const KBChromaManager = (await import('../../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;

        const originalClient = KBChromaManager.client;
        let clientCalled     = false;
        KBChromaManager.client = {
            deleteCollection: async () => { clientCalled = true; }
        };
        const previousEnv = process.env.UNIT_TEST_MODE;

        try {
            delete process.env.UNIT_TEST_MODE;
            await expect(KBChromaManager.deleteCollection({name: 'neo-knowledge-base'}))
                .rejects.toThrow(CanonicalCollectionGuardError);
            expect(clientCalled).toBe(false);
        } finally {
            KBChromaManager.client = originalClient;
            if (previousEnv === undefined) delete process.env.UNIT_TEST_MODE;
            else process.env.UNIT_TEST_MODE = previousEnv;
        }
    });

    test('KB ChromaManager.deleteCollection forwards to client under UNIT_TEST_MODE=true', async () => {
        const KBChromaManager = (await import('../../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;

        const originalClient = KBChromaManager.client;
        let receivedArgs     = null;
        KBChromaManager.client = {
            deleteCollection: async (args) => { receivedArgs = args; return 'ok'; }
        };
        const previousEnv = process.env.UNIT_TEST_MODE;

        try {
            process.env.UNIT_TEST_MODE = 'true';
            const result = await KBChromaManager.deleteCollection({name: 'neo-knowledge-base'});
            expect(result).toBe('ok');
            expect(receivedArgs).toEqual({name: 'neo-knowledge-base'});
        } finally {
            KBChromaManager.client = originalClient;
            if (previousEnv === undefined) delete process.env.UNIT_TEST_MODE;
            else process.env.UNIT_TEST_MODE = previousEnv;
        }
    });

    test('KB ChromaManager.deleteCollection forwards under confirmation token bypass (production recovery)', async () => {
        const KBChromaManager = (await import('../../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;

        const originalClient = KBChromaManager.client;
        let receivedArgs     = null;
        KBChromaManager.client = {
            deleteCollection: async (args) => { receivedArgs = args; return 'ok'; }
        };
        const previousEnv = process.env.UNIT_TEST_MODE;

        try {
            delete process.env.UNIT_TEST_MODE;
            const result = await KBChromaManager.deleteCollection({
                name        : 'neo-knowledge-base',
                confirmation: DESTRUCTIVE_PRODUCTION_CONFIRMATION
            });
            expect(result).toBe('ok');
            // confirmation is consumed at the guard layer; not forwarded to chromadb-client.
            expect(receivedArgs).toEqual({name: 'neo-knowledge-base'});
        } finally {
            KBChromaManager.client = originalClient;
            if (previousEnv === undefined) delete process.env.UNIT_TEST_MODE;
            else process.env.UNIT_TEST_MODE = previousEnv;
        }
    });
});
