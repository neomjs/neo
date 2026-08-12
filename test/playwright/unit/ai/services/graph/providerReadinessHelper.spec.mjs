import {setup} from '../../../../setup.mjs';

const appName = 'ProviderReadinessHelperTest';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import os             from 'os';
import path           from 'path';

// Pure helper (no I/O) — imported dynamically after the Neo bootstrap (the module's import chain
// references Neo at load). It guarantees LM Studio's CLI bin dir (~/.lmstudio/bin) is on the
// execFile PATH, so the readiness probe no longer reports a healthy provider as unavailable when
// the daemon/MCP-server launch env lacks that dir (the bare-`lms` spawn ENOENT false-negative).

const LMS_BIN = path.join(os.homedir(), '.lmstudio', 'bin');
const SEP     = process.platform === 'win32' ? ';' : ':';

test.describe('lmsExecOptions — embedding-readiness PATH fix', () => {
    let fetchLmsLoadedModels, lmsExecOptions;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/graph/providerReadinessHelper.mjs');

        fetchLmsLoadedModels = mod.fetchLmsLoadedModels;
        lmsExecOptions       = mod.lmsExecOptions;
    });

    test('augments PATH with the LM Studio bin dir', () => {
        const opts = lmsExecOptions();
        expect(opts.env.PATH.split(SEP)).toContain(LMS_BIN);
    });

    test('merges extra options (e.g. timeout) alongside the augmented env', () => {
        const opts = lmsExecOptions({timeout: 5000});
        expect(opts.timeout).toBe(5000);
        expect(opts.env.PATH.split(SEP)).toContain(LMS_BIN);
    });

    test('preserves every pre-existing PATH entry', () => {
        const opts = lmsExecOptions();
        for (const entry of (process.env.PATH || '').split(SEP).filter(Boolean)) {
            expect(opts.env.PATH.split(SEP)).toContain(entry);
        }
    });

    test('is idempotent — does not duplicate the bin dir when already on PATH', () => {
        const origPath = process.env.PATH;
        try {
            process.env.PATH  = `${LMS_BIN}${SEP}/usr/bin`;
            const opts        = lmsExecOptions();
            const occurrences = opts.env.PATH.split(SEP).filter(p => p === LMS_BIN).length;
            expect(occurrences).toBe(1);
        } finally {
            process.env.PATH = origPath;
        }
    });

    test('preserves a caller-supplied extra.env (merges, does not clobber) + augments its PATH', () => {
        const opts    = lmsExecOptions({timeout: 99, env: {FOO: 'bar', PATH: '/custom/bin'}});
        const entries = opts.env.PATH.split(SEP);
        expect(opts.timeout).toBe(99);   // extra options preserved
        expect(opts.env.FOO).toBe('bar'); // caller env preserved (not clobbered)
        expect(entries).toContain('/custom/bin'); // caller PATH preserved
        expect(entries).toContain(LMS_BIN);       // lms bin dir augmented onto the caller PATH
    });

    test('pre-aborted loaded-model probes reject before spawning a child', async () => {
        const
            controller = new AbortController(),
            reason     = new Error('cancel before provider preflight'),
            calls      = [];

        controller.abort(reason);

        let observed;
        try {
            await fetchLmsLoadedModels({
                timeoutMs : 100,
                signal    : controller.signal,
                execFileFn: (...args) => calls.push(args)
            });
        } catch (error) {
            observed = error;
        }

        expect(observed).toBe(reason);
        expect(calls).toEqual([]);
    });

    test('signal-owned loaded-model probes do not coalesce or poison sibling callers', async () => {
        const
            firstController  = new AbortController(),
            secondController = new AbortController(),
            callbacks        = [],
            signals          = [],
            execFileFn       = (file, args, options, callback) => {
                signals.push(options.signal);
                callbacks.push(callback);
            },
            firstPromise     = fetchLmsLoadedModels({
                timeoutMs: 100,
                signal   : firstController.signal,
                execFileFn
            }),
            secondPromise    = fetchLmsLoadedModels({
                timeoutMs: 100,
                signal   : secondController.signal,
                execFileFn
            }),
            reason           = new Error('cancel only the first preflight');

        expect(signals).toEqual([firstController.signal, secondController.signal]);

        firstController.abort(reason);
        callbacks[0](Object.assign(new Error('child aborted'), {name: 'AbortError'}));
        callbacks[1](null, JSON.stringify([{identifier: 'embedding-model'}]), '');

        let observed;
        try {
            await firstPromise;
        } catch (error) {
            observed = error;
        }

        expect(observed).toBe(reason);
        await expect(secondPromise).resolves.toEqual([{id: 'embedding-model'}]);
    });
});

test.describe('provider residency helpers — production mutation authority fences (#16837)', () => {
    let ensureLmsModelsLoaded, ensureOllamaModelsReady;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/graph/providerReadinessHelper.mjs');

        ensureLmsModelsLoaded   = mod.ensureLmsModelsLoaded;
        ensureOllamaModelsReady = mod.ensureOllamaModelsReady;
    });

    test('LMS refuses the first unload after authority moves during awaited model metadata', async () => {
        let   held    = true;
        const unloads = [],
              loads   = [];

        const repair = ensureLmsModelsLoaded({
            host          : 'http://127.0.0.1:1234',
            models        : ['chat-model'],
            contextLengths: {'chat-model': 4096},
            attempts      : 1,
            delayMs       : 0,
            timeoutMs     : 10,
            fetchModelIds : async () => ['chat-model'],
            async fetchLoadedModels() {
                held = false;
                return [{id: 'chat-model', contextLength: 1024}];
            },
            async unloadModel(model) {
                unloads.push(model);
            },
            async loadModel(model) {
                loads.push(model);
            },
            isAuthorityHeld: () => held,
            log            : {info() {}, warn() {}}
        });

        await expect(repair).rejects.toMatchObject({reason: 'runtime-authority-lost'});
        expect(unloads).toEqual([]);
        expect(loads).toEqual([]);
    });

    test('LMS rechecks authority between a stale-model unload and its replacement load', async () => {
        let   held    = true;
        const unloads = [],
              loads   = [];

        const repair = ensureLmsModelsLoaded({
            host             : 'http://127.0.0.1:1234',
            models           : ['chat-model'],
            contextLengths   : {'chat-model': 4096},
            attempts         : 1,
            delayMs          : 0,
            timeoutMs        : 10,
            fetchModelIds    : async () => ['chat-model'],
            fetchLoadedModels: async () => [{id: 'chat-model', contextLength: 1024}],
            async unloadModel(model) {
                unloads.push(model);
                held = false;
            },
            async loadModel(model) {
                loads.push(model);
            },
            isAuthorityHeld: () => held,
            log            : {info() {}, warn() {}}
        });

        await expect(repair).rejects.toMatchObject({reason: 'runtime-authority-lost'});
        expect(unloads).toEqual(['chat-model']);
        expect(loads).toEqual([]);
    });

    test('Ollama rechecks authority between role warms instead of authorizing the loop once', async () => {
        let   held  = true;
        const warms = [];

        const repair = ensureOllamaModelsReady({
            host : 'http://127.0.0.1:11434',
            roles: [
                {role: 'chat',      providerRole: 'chat',      model: 'chat-model'},
                {role: 'embedding', providerRole: 'embedding', model: 'embed-model'}
            ],
            requireParallelModels: 2,
            attempts             : 1,
            delayMs              : 0,
            timeoutMs            : 10,
            fetchModelIds        : async () => [],
            async warmModel(role) {
                warms.push(role.role);
                held = false;
                return {};
            },
            isAuthorityHeld: () => held,
            log            : {info() {}, warn() {}}
        });

        await expect(repair).rejects.toMatchObject({reason: 'runtime-authority-lost'});
        expect(warms).toEqual(['chat']);
    });

    test('Ollama preserves allowPartial authority degradation when the demand oracle is omitted', async () => {
        let held = true;

        const result = await ensureOllamaModelsReady({
            host : 'http://127.0.0.1:11434',
            roles: [
                {role: 'chat',      providerRole: 'chat',      model: 'chat-model'},
                {role: 'embedding', providerRole: 'embedding', model: 'embed-model'}
            ],
            requireParallelModels: 2,
            attempts             : 1,
            delayMs              : 0,
            timeoutMs            : 10,
            allowPartial         : true,
            fetchModelIds        : async () => [],
            async warmModel() {
                held = false;
                return {};
            },
            isAuthorityHeld: () => held,
            log            : {info() {}, warn() {}}
        });

        expect(result).toMatchObject({
            ready          : false,
            degraded       : true,
            attemptedModels: [
                {role: 'chat', providerRole: 'chat', model: 'chat-model'},
                {role: 'embedding', providerRole: 'embedding', model: 'embed-model'}
            ],
            warmedModels: [{role: 'chat', providerRole: 'chat', model: 'chat-model'}],
            failedModels: [{role: 'embedding', providerRole: 'embedding', model: 'embed-model'}]
        });
    });

    test('Ollama refuses changed demand after the readiness probe before any role warm', async () => {
        let   admitted = true;
        const warms    = [];

        const repair = ensureOllamaModelsReady({
            host : 'http://127.0.0.1:11434',
            roles: [
                {role: 'chat', providerRole: 'chat', model: 'chat-model', contextLength: 131072}
            ],
            requireParallelModels: 1,
            attempts             : 1,
            delayMs              : 0,
            timeoutMs            : 10,
            allowPartial         : true,
            async fetchModelIds() {
                admitted = false;
                return [];
            },
            async warmModel(role, options) {
                warms.push({role, options});
                return {};
            },
            isEffectStillAdmitted: () => admitted,
            log                  : {info() {}, warn() {}}
        });

        await expect(repair).rejects.toMatchObject({
            reason: 'runtime-effect-not-admitted'
        });
        expect(warms).toEqual([]);
    });

    test('Ollama preserves an earlier role as partial when demand changes before the next warm', async () => {
        let   admitted = true;
        const warms    = [];

        const repair = ensureOllamaModelsReady({
            host : 'http://127.0.0.1:11434',
            roles: [
                {role: 'chat',      providerRole: 'chat',      model: 'chat-model',  contextLength: 131072},
                {role: 'embedding', providerRole: 'embedding', model: 'embed-model', contextLength: 32768}
            ],
            requireParallelModels: 2,
            attempts             : 1,
            delayMs              : 0,
            timeoutMs            : 10,
            allowPartial         : true,
            fetchModelIds        : async () => [],
            async warmModel(role, options) {
                warms.push({role, options});
                admitted = false;
                return {};
            },
            isEffectStillAdmitted: () => admitted,
            log                  : {info() {}, warn() {}}
        });

        await expect(repair).rejects.toMatchObject({
            reason           : 'runtime-effect-partially-applied',
            effectDisposition: 'partial',
            providerResidency: {
                admission      : 'refused-after-partial',
                refusedModel   : {role: 'embedding', providerRole: 'embedding', model: 'embed-model', contextLength: 32768},
                attemptedModels: [{role: 'chat', providerRole: 'chat', model: 'chat-model', contextLength: 131072}],
                warmedModels   : [{role: 'chat', providerRole: 'chat', model: 'chat-model', contextLength: 131072}]
            }
        });
        expect(warms).toEqual([{
            role   : {role: 'chat', providerRole: 'chat', model: 'chat-model', contextLength: 131072},
            options: {host: 'http://127.0.0.1:11434', keepAlive: undefined, timeoutMs: 10, contextLength: 131072}
        }]);
    });

    test('Ollama records a failed earlier attempt as uncertain when demand changes before the next warm', async () => {
        let   admitted = true;
        const warms    = [];

        const repair = ensureOllamaModelsReady({
            host : 'http://127.0.0.1:11434',
            roles: [
                {role: 'chat',      providerRole: 'chat',      model: 'chat-model',  contextLength: 131072},
                {role: 'embedding', providerRole: 'embedding', model: 'embed-model', contextLength: 32768}
            ],
            requireParallelModels: 2,
            attempts             : 1,
            delayMs              : 0,
            timeoutMs            : 10,
            allowPartial         : true,
            fetchModelIds        : async () => [],
            async warmModel(role) {
                warms.push(role);
                admitted = false;
                throw new TypeError('pre-dispatch validation');
            },
            isEffectStillAdmitted: () => admitted,
            log                  : {info() {}, warn() {}}
        });

        await expect(repair).rejects.toMatchObject({
            reason           : 'runtime-effect-disposition-uncertain',
            effectDisposition: 'uncertain',
            providerResidency: {
                admission      : 'refused-after-uncertain-attempt',
                refusedModel   : {role: 'embedding', providerRole: 'embedding', model: 'embed-model', contextLength: 32768},
                attemptedModels: [{role: 'chat', providerRole: 'chat', model: 'chat-model', contextLength: 131072}],
                warmedModels   : [],
                pendingModels  : [],
                failedModels   : [{role: 'chat', providerRole: 'chat', model: 'chat-model', contextLength: 131072}]
            }
        });
        expect(warms).toEqual([
            {role: 'chat', providerRole: 'chat', model: 'chat-model', contextLength: 131072}
        ]);
    });

    test('Ollama preserves the no-admission-oracle logger failure boundary', async () => {
        let warmCount = 0;

        await expect(ensureOllamaModelsReady({
            host : 'http://127.0.0.1:11434',
            roles: [
                {role: 'chat', providerRole: 'chat', model: 'chat-model', contextLength: 131072}
            ],
            requireParallelModels: 1,
            attempts             : 1,
            delayMs              : 0,
            timeoutMs            : 10,
            allowPartial         : true,
            fetchModelIds        : async () => [],
            warmModel            : async () => { warmCount += 1; },
            log                  : {
                info() {
                    throw new Error('logger exploded');
                },
                warn() {}
            }
        })).rejects.toThrow('logger exploded');
        expect(warmCount).toBe(0);
    });
});
