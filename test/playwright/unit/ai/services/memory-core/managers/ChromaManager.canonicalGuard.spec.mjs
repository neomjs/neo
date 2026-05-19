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
        expect(GUARDED_CANONICAL_COLLECTION_NAMES.has('neo-agent-graph')).toBe(true);
        expect(GUARDED_CANONICAL_COLLECTION_NAMES.has('neo-knowledge-base')).toBe(true);
    });

    test('Allows non-canonical (test-prefixed) collection name regardless of env state', () => {
        const previous = process.env.UNIT_TEST_MODE;
        try {
            delete process.env.UNIT_TEST_MODE;
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
