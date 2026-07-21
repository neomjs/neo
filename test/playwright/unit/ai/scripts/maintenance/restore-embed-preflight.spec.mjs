import {setup} from '../../../../setup.mjs';

setup({appConfig: {appName: 'TestApp'}});

import {test, expect}                          from '@playwright/test';
import {parseArgs, preflightEmbeddingProvider} from '../../../../../../ai/scripts/maintenance/restore.mjs';

test.describe('Restore embedding-provider preflight', () => {
    test('refuses before any write when the provider returns no vector', async () => {
        let logs   = [],
            logger = {log: msg => logs.push(msg), warn: msg => logs.push(msg)};

        await expect(preflightEmbeddingProvider({
            embedText: async () => [],
            logger
        })).rejects.toThrow(/Embedding provider preflight failed:.*no vector/);
    });

    test('refuses when the returned vector dimensions diverge from config', async () => {
        await expect(preflightEmbeddingProvider({
            embedText: async () => [0.1, 0.2, 0.3],
            logger   : {log: () => {}, warn: () => {}}
        })).rejects.toThrow(/expected 4096/);
    });

    test('refusal error names the provider and the remediation', async () => {
        let error;

        try {
            await preflightEmbeddingProvider({
                embedText: async () => { throw new Error('connection refused') },
                logger   : {log: () => {}, warn: () => {}}
            });
        } catch (e) {
            error = e
        }

        expect(error).toBeTruthy();
        expect(error.message).toContain('Embedding provider preflight failed');
        expect(error.message).toContain('ollama pull <embedding-model>');
        expect(error.message).toContain('--skip-embed-preflight')
    });

    test('passes through with a healthy provider vector', async () => {
        let logs  = [],
            block = await preflightEmbeddingProvider({
                embedText: async () => new Array(4096).fill(0.1),
                logger   : {log: msg => logs.push(msg), warn: msg => logs.push(msg)}
            });

        expect(block.status).toBe('healthy');
        expect(block.dimensions).toBe(4096);
        expect(logs.some(line => line.includes('preflight healthy'))).toBe(true)
    });

    test('the escape hatch skips the probe and logs a warning', async () => {
        let warns  = [],
            result = await preflightEmbeddingProvider({
                embedText         : async () => { throw new Error('must not be called') },
                logger            : {log: () => {}, warn: msg => warns.push(msg)},
                skipEmbedPreflight: true
            });

        expect(result.status).toBe('skipped');
        expect(warns.some(line => line.includes('skip-embed-preflight'))).toBe(true)
    });

    test('parseArgs threads the flag and keeps rejecting unknown flags', () => {
        expect(parseArgs(['/tmp/bundle', '--skip-embed-preflight'])).toMatchObject({
            bundleRoot        : '/tmp/bundle',
            mode              : 'merge',
            skipEmbedPreflight: true
        });
        expect(parseArgs(['/tmp/bundle']).skipEmbedPreflight).toBe(false);
        expect(() => parseArgs(['/tmp/bundle', '--skip-embed-preflight=yes'])).toThrow(/Unknown flag/)
    });
});
