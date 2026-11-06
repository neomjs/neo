import {test, expect}                                                       from '@playwright/test';
import {archiveFixtureConfig, configureArchiveFixture, waitForArchiveStore} from '../../memoryCoreArchiveFixture.mjs';

test.describe('disposable Memory Core archive fixture isolation', () => {
    test('ambient seat credentials do not opt an ordinary run into archive construction', async () => {
        let imports = 0;
        expect(await configureArchiveFixture(() => { imports++; }, {NEO_MCP_REMOTE_TOKEN: 'seat-token'})).toBeNull();
        expect(imports).toBe(0)
    });

    test('partial fixture configuration fails before any Brain module is imported', async () => {
        const load = () => { throw new Error('must not import'); };
        await expect(configureArchiveFixture(load, {NEO_E2E_ARCHIVE_URL: 'http://127.0.0.1:13002/mcp'}))
            .rejects.toThrow('requires both');
        await expect(configureArchiveFixture(load, {NEO_E2E_ARCHIVE_TOKEN: 'fixture-token'}))
            .rejects.toThrow('requires both')
    });

    test('only an explicit loopback fixture endpoint is admitted, with no canonical endpoint fallback', () => {
        for (const url of ['https://example.com/mcp', 'http://127.0.0.1:3102/mc/mcp',
            'http://127.0.0.1/mcp', 'http://user:secret@127.0.0.1:13002/mcp', 'http://127.0.0.1:13002/mcp?token=x']) {
            expect(() => archiveFixtureConfig({NEO_E2E_ARCHIVE_URL: url, NEO_E2E_ARCHIVE_TOKEN: 'fixture-token'}))
                .toThrow('explicit http://127.0.0.1')
        }
        expect(archiveFixtureConfig({NEO_E2E_ARCHIVE_URL: 'http://127.0.0.1:13002/mcp', NEO_E2E_ARCHIVE_TOKEN: 'fixture-token'}))
            .toEqual({url: 'http://127.0.0.1:13002/mcp', token: 'fixture-token'})
    });

    test('readiness requires a store answer, and cannot infer absence from unavailable', async () => {
        const read = status => ({getTransactionArchive: async ({archiveId}) => {
            expect(archiveId).toMatch(/^[a-f0-9-]{36}$/);
            return {status}
        }});
        await expect(waitForArchiveStore(read('not-found'), 0)).resolves.toBeUndefined();
        await expect(waitForArchiveStore(read('unavailable'), 0)).rejects.toThrow('was not ready');
        await expect(waitForArchiveStore({getTransactionArchive: async () => ({status: 'unavailable', reason: 'invalid_token'})}, 120000))
            .rejects.toThrow('authentication refused')
    })
});
