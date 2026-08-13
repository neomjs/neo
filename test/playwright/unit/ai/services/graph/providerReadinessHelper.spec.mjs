import {setup} from '../../../../setup.mjs';

const appName = 'ProviderReadinessHelperTest';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

import {test, expect} from '@playwright/test';
import {execFile}     from 'child_process';
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

    test('rejects empty, malformed, conflicting, and non-positive lms ps telemetry (#17071)', async () => {
        const invalidPayloads = [
            '',
            '{bad',
            '{}',
            JSON.stringify([{contextLength: 4096}]),
            JSON.stringify([{id: 42, contextLength: 4096}]),
            JSON.stringify([{id: 'chat-model', identifier: 'other-model', contextLength: 4096}]),
            JSON.stringify([{identifier: 'chat-model'}, {identifier: 'chat-model'}]),
            JSON.stringify([{identifier: 'chat-model', contextLength: 'many'}]),
            JSON.stringify([{identifier: 'chat-model', contextLength: 4096, context_length: 8192}]),
            JSON.stringify([{identifier: 'chat-model', contextLength: 0}]),
            JSON.stringify([{identifier: 'chat-model', parallel: 1.5}])
        ];

        for (const stdout of invalidPayloads) {
            await expect(fetchLmsLoadedModels({
                timeoutMs : 100,
                unshared  : true,
                execFileFn: (file, args, options, callback) => callback(null, stdout, '')
            })).rejects.toThrow(/lms ps --json returned/);
        }
    });

    test('accepts the live LMS identifier while preserving distinct model metadata (#17071)', async () => {
        await expect(fetchLmsLoadedModels({
            timeoutMs : 100,
            unshared  : true,
            execFileFn: (file, args, options, callback) => callback(null, JSON.stringify([{
                type                  : 'embedding',
                modelKey              : 'text-embedding-qwen3-embedding-8b',
                path                  : 'Qwen/Qwen3-Embedding-8B-GGUF/Qwen3-Embedding-8B-Q4_K_M.gguf',
                indexedModelIdentifier: 'Qwen/Qwen3-Embedding-8B-GGUF/Qwen3-Embedding-8B-Q4_K_M.gguf',
                identifier            : 'text-embedding-qwen3-embedding-8b',
                contextLength         : 32768,
                parallel              : null
            }]), '')
        })).resolves.toEqual([expect.objectContaining({
            id           : 'text-embedding-qwen3-embedding-8b',
            modelKey     : 'text-embedding-qwen3-embedding-8b',
            contextLength: 32768,
            parallel     : undefined
        })]);
    });
});

test.describe('LM Studio residency mutation queue (#17054)', () => {
    let ensureLmsModelsLoaded, loadLmsModel;

    test.beforeAll(async () => {
        ({ensureLmsModelsLoaded, loadLmsModel} = await import('../../../../../../ai/services/graph/providerReadinessHelper.mjs'));
    });

    test('serializes concurrent repairs without coalescing their role sets', async () => {
        let releaseFirst, signalFirstStarted, activeLoads = 0, maxActiveLoads = 0;
        const events       = [],
              firstGate    = new Promise(resolve => { releaseFirst = resolve; }),
              firstStarted = new Promise(resolve => { signalFirstStarted = resolve; }),
              createRepair = (model, waitForRelease = false) => {
                  let loaded = false;

                  return ensureLmsModelsLoaded({
                      host         : 'http://127.0.0.1:1234',
                      models       : [model],
                      attempts     : 1,
                      delayMs      : 0,
                      timeoutMs    : 10,
                      fetchModelIds: async () => {
                          events.push(`discover:${model}`);
                          return loaded ? [model] : [];
                      },
                      fetchLoadedModels: async () => loaded ? [{id: model}] : [],
                      async loadModel() {
                          events.push(`load:${model}`);
                          activeLoads += 1;
                          maxActiveLoads = Math.max(maxActiveLoads, activeLoads);

                          if (waitForRelease) {
                              signalFirstStarted();
                              await firstGate;
                          }

                          loaded = true;
                          activeLoads -= 1;
                      },
                      unloadModel: async () => {},
                      log        : {info() {}, warn() {}}
                  });
              },
              first = createRepair('chat-model', true);

        await firstStarted;

        const second = createRepair('embedding-model');

        await Promise.resolve();
        expect(events).toEqual(['discover:chat-model', 'load:chat-model']);

        releaseFirst();

        const [firstResult, secondResult] = await Promise.all([first, second]);

        expect(maxActiveLoads).toBe(1);
        expect(firstResult.requiredModels).toEqual(['chat-model']);
        expect(secondResult.requiredModels).toEqual(['embedding-model']);
        expect(events).toEqual([
            'discover:chat-model',
            'load:chat-model',
            'discover:chat-model',
            'discover:embedding-model',
            'load:embedding-model',
            'discover:embedding-model'
        ]);
    });

    test('releases a rejected predecessor and rechecks queued caller authority', async () => {
        let rejectFirst, signalFirstStarted, authorityHeld = true, secondDiscoveries = 0, secondLoads = 0;
        const firstGate    = new Promise((resolve, reject) => { rejectFirst = reject; }),
              firstStarted = new Promise(resolve => { signalFirstStarted = resolve; }),
              first        = ensureLmsModelsLoaded({
                  host             : 'http://127.0.0.1:1234',
                  models           : ['chat-model'],
                  attempts         : 1,
                  delayMs          : 0,
                  timeoutMs        : 10,
                  fetchModelIds    : async () => [],
                  fetchLoadedModels: async () => [],
                  async loadModel() {
                      signalFirstStarted();
                      await firstGate;
                  },
                  unloadModel: async () => {},
                  log        : {info() {}, warn() {}}
              });

        await firstStarted;

        const second = ensureLmsModelsLoaded({
            host         : 'http://127.0.0.1:1234',
            models       : ['embedding-model'],
            attempts     : 1,
            delayMs      : 0,
            timeoutMs    : 10,
            fetchModelIds: async () => {
                secondDiscoveries += 1;
                return [];
            },
            fetchLoadedModels: async () => [],
            async loadModel() {
                secondLoads += 1;
            },
            unloadModel    : async () => {},
            isAuthorityHeld: () => authorityHeld,
            log            : {info() {}, warn() {}}
        });

        authorityHeld = false;
        await Promise.resolve();
        expect(secondDiscoveries).toBe(0);

        rejectFirst(new Error('first repair failed'));

        await expect(first).rejects.toThrow('first repair failed');
        await expect(second).rejects.toMatchObject({reason: 'runtime-authority-lost'});
        expect(secondDiscoveries).toBe(1);
        expect(secondLoads).toBe(0);
    });

    test('settles a timed-out LMS child with SIGKILL before admitting the queued repair (#17071)', async () => {
        let signalSpawned;
        const events  = [],
              spawned = new Promise(resolve => { signalSpawned = resolve; });

        const first = ensureLmsModelsLoaded({
            host             : 'http://127.0.0.1:1234',
            models           : ['hung-model'],
            attempts         : 1,
            delayMs          : 0,
            timeoutMs        : 40,
            fetchModelIds    : async () => [],
            fetchLoadedModels: async () => [],
            loadModel        : model => loadLmsModel(model, {
                timeoutMs: 40,
                execFileFn(file, args, options, callback) {
                    const child = execFile(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], options, callback);

                    child.once('spawn', () => {
                        events.push('first-spawn');
                        signalSpawned();
                    });
                    child.once('close', (code, signal) => events.push(`first-close:${signal}`));

                    return child;
                }
            }),
            unloadModel: async () => {},
            log        : {info() {}, warn() {}}
        });

        await spawned;

        let   secondResident = false;
        const second         = ensureLmsModelsLoaded({
            host         : 'http://127.0.0.1:1234',
            models       : ['ready-model'],
            attempts     : 1,
            delayMs      : 0,
            timeoutMs    : 40,
            fetchModelIds: async () => {
                events.push('second-discover');
                return secondResident ? ['ready-model'] : [];
            },
            fetchLoadedModels: async () => secondResident ? [{id: 'ready-model'}] : [],
            async loadModel() {
                events.push('second-load');
                secondResident = true;
            },
            unloadModel: async () => {},
            log        : {info() {}, warn() {}}
        });

        await expect(first).rejects.toMatchObject({killed: true, signal: 'SIGKILL'});
        await expect(second).resolves.toMatchObject({ready: true});
        expect(events[0]).toBe('first-spawn');
        expect(events[1]).toBe('first-close:SIGKILL');
        expect(events.slice(2)).toContain('second-discover');
        expect(events).toContain('second-load');
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
            host                    : 'http://127.0.0.1:1234',
            models                  : ['chat-model'],
            contextLengths          : {'chat-model': 4096},
            allowResidentReplacement: true,
            attempts                : 1,
            delayMs                 : 0,
            timeoutMs               : 10,
            fetchModelIds           : async () => ['chat-model'],
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
            isAuthorityHeld      : () => held,
            isEffectStillAdmitted: () => true,
            log                  : {info() {}, warn() {}}
        });

        await expect(repair).rejects.toMatchObject({reason: 'runtime-authority-lost'});
        expect(unloads).toEqual([]);
        expect(loads).toEqual([]);
    });

    test('LMS completes mandatory replacement after authority moves during exact eviction', async () => {
        let   held          = true,
              contextLength = 1024;
        const unloads = [],
              loads   = [];

        const result = await ensureLmsModelsLoaded({
            host                    : 'http://127.0.0.1:1234',
            models                  : ['chat-model'],
            contextLengths          : {'chat-model': 4096},
            allowResidentReplacement: true,
            attempts                : 1,
            delayMs                 : 0,
            timeoutMs               : 10,
            fetchModelIds           : async () => ['chat-model'],
            fetchLoadedModels       : async () => [{id: 'chat-model', contextLength}],
            async unloadModel(model) {
                unloads.push(model);
                held = false;
            },
            async loadModel(model) {
                loads.push(model);
                contextLength = 4096;
            },
            isAuthorityHeld      : () => held,
            isEffectStillAdmitted: () => true,
            log                  : {info() {}, warn() {}}
        });

        expect(unloads).toEqual(['chat-model']);
        expect(loads).toEqual(['chat-model']);
        expect(result.ready).toBe(true);
    });

    test('LMS routine repair never evicts when cached absence becomes a fresh mismatch (#17071)', async () => {
        const unloads   = [],
              loads     = [],
              snapshots = [
                  [],
                  [{id: 'chat-model', contextLength: 1024}]
              ];

        const result = await ensureLmsModelsLoaded({
            host             : 'http://127.0.0.1:1234',
            models           : ['chat-model'],
            contextLengths   : {'chat-model': 4096},
            allowPartial     : true,
            attempts         : 1,
            delayMs          : 0,
            timeoutMs        : 10,
            fetchModelIds    : async () => ['chat-model'],
            fetchLoadedModels: async () => snapshots.shift() || [{id: 'chat-model', contextLength: 1024}],
            unloadModel      : async model => unloads.push(model),
            loadModel        : async model => loads.push(model),
            log              : {info() {}, warn() {}}
        });

        expect(unloads).toEqual([]);
        expect(loads).toEqual([]);
        expect(result).toMatchObject({
            ready            : false,
            degraded         : true,
            observationStatus: 'replacement-required'
        });
    });

    test('LMS force-fresh sufficiency cancels a stale mismatch without mutation (#17071)', async () => {
        const unloads = [],
              loads   = [],
              probes  = [];
        let   contextLength = 1024;

        const result = await ensureLmsModelsLoaded({
            host                    : 'http://127.0.0.1:1234',
            models                  : ['chat-model'],
            contextLengths          : {'chat-model': 4096},
            allowResidentReplacement: true,
            attempts                : 1,
            delayMs                 : 0,
            timeoutMs               : 10,
            fetchModelIds           : async () => ['chat-model'],
            async fetchLoadedModels(options) {
                probes.push(options);
                const row = {id: 'chat-model', contextLength};

                contextLength = 4096;
                return [row];
            },
            unloadModel          : async model => unloads.push(model),
            loadModel            : async model => loads.push(model),
            isAuthorityHeld      : () => true,
            isEffectStillAdmitted: () => true,
            log                  : {info() {}, warn() {}}
        });

        expect(unloads).toEqual([]);
        expect(loads).toEqual([]);
        expect(probes[1]).toMatchObject({freshness: 'force', unshared: true});
        expect(result).toMatchObject({
            ready          : true,
            attemptedModels: [],
            loadedContexts : {'chat-model': 4096}
        });
    });

    test('LMS force-fresh incomplete replacement metadata refuses every mutation (#17071)', async () => {
        const unloads   = [],
              loads     = [],
              snapshots = [
                  [{id: 'chat-model', contextLength: 1024, parallel: 1}],
                  [{id: 'chat-model', contextLength: 1024, parallel: null}]
              ];

        const result = await ensureLmsModelsLoaded({
            host                    : 'http://127.0.0.1:1234',
            models                  : ['chat-model'],
            contextLengths          : {'chat-model': 4096},
            parallels               : {'chat-model': 1},
            allowResidentReplacement: true,
            allowPartial            : true,
            attempts                : 1,
            delayMs                 : 0,
            timeoutMs               : 10,
            fetchModelIds           : async () => ['chat-model'],
            fetchLoadedModels       : async () => snapshots.shift() || [],
            unloadModel             : async model => unloads.push(model),
            loadModel               : async model => loads.push(model),
            isAuthorityHeld         : () => true,
            isEffectStillAdmitted   : () => true,
            log                     : {info() {}, warn() {}}
        });

        expect(unloads).toEqual([]);
        expect(loads).toEqual([]);
        expect(result).toMatchObject({
            ready            : false,
            observationStatus: 'metadata-unknown'
        });
    });

    test('LMS force-fresh batch refuses all mutation when one required row is unknown (#17071)', async () => {
        const unloads   = [],
              loads     = [],
              snapshots = [
                  [],
                  [
                      {id: 'chat-model', contextLength: 1024},
                      {id: 'embedding-model'}
                  ]
              ];

        const result = await ensureLmsModelsLoaded({
            host                    : 'http://127.0.0.1:1234',
            models                  : ['chat-model', 'embedding-model'],
            contextLengths          : {'chat-model': 4096, 'embedding-model': 32768},
            allowResidentReplacement: true,
            allowPartial            : true,
            attempts                : 1,
            delayMs                 : 0,
            timeoutMs               : 10,
            fetchModelIds           : async () => ['chat-model', 'embedding-model'],
            fetchLoadedModels       : async () => snapshots.shift() || [],
            unloadModel             : async model => unloads.push(model),
            loadModel               : async model => loads.push(model),
            isAuthorityHeld         : () => true,
            isEffectStillAdmitted   : () => true,
            log                     : {info() {}, warn() {}}
        });

        expect(unloads).toEqual([]);
        expect(loads).toEqual([]);
        expect(result).toMatchObject({
            ready            : false,
            degraded         : true,
            observationStatus: 'metadata-unknown'
        });
    });

    test('LMS compensates an exact unload whose CLI outcome is uncertain (#17071)', async () => {
        let resident      = true,
            contextLength = 1024,
            admitted      = true;
        const unloads = [],
              loads   = [];

        const result = await ensureLmsModelsLoaded({
            host                    : 'http://127.0.0.1:1234',
            models                  : ['chat-model'],
            contextLengths          : {'chat-model': 4096},
            allowResidentReplacement: true,
            attempts                : 1,
            delayMs                 : 0,
            timeoutMs               : 10,
            fetchModelIds           : async () => resident ? ['chat-model'] : [],
            fetchLoadedModels       : async () => resident
                ? [{id: 'chat-model', contextLength}]
                : [],
            async unloadModel(model) {
                unloads.push(model);
                resident = false;
                admitted = false;
                throw new Error('CLI timed out after RPC applied');
            },
            async loadModel(model) {
                loads.push(model);
                resident = true;
                contextLength = 4096;
            },
            isAuthorityHeld      : () => true,
            isEffectStillAdmitted: () => admitted,
            log                  : {info() {}, warn() {}}
        });

        expect(unloads).toEqual(['chat-model']);
        expect(loads).toEqual(['chat-model']);
        expect(resident).toBe(true);
        expect(result.ready).toBe(true);
    });

    test('LMS cleanup degrades when the exact resident disappears after one suffix eviction (#17071)', async () => {
        const residents = new Map([
                  ['chat-model',   {id: 'chat-model', contextLength: 4096, parallel: 1}],
                  ['chat-model:2', {id: 'chat-model:2', contextLength: 4096, parallel: 1}],
                  ['chat-model:3', {id: 'chat-model:3', contextLength: 4096, parallel: 1}]
              ]),
              unloads = [];

        const result = await ensureLmsModelsLoaded({
            host                    : 'http://127.0.0.1:1234',
            models                  : ['chat-model'],
            contextLengths          : {'chat-model': 4096},
            parallels               : {'chat-model': 1},
            allowResidentReplacement: true,
            allowPartial            : true,
            attempts                : 1,
            delayMs                 : 0,
            timeoutMs               : 10,
            fetchModelIds           : async () => ['chat-model'],
            fetchLoadedModels       : async () => [...residents.values()],
            async unloadModel(model) {
                unloads.push(model);
                residents.delete(model);
                residents.delete('chat-model');
            },
            loadModel            : async () => {},
            isAuthorityHeld      : () => true,
            isEffectStillAdmitted: () => true,
            log                  : {info() {}, warn() {}}
        });

        expect(unloads).toEqual(['chat-model:2']);
        expect(result).toMatchObject({
            ready         : false,
            degraded      : true,
            missingModels : ['chat-model'],
            unloadedModels: ['chat-model:2']
        });
        expect(result.lmsLoadedModels.map(item => item.id)).toEqual(['chat-model:3']);
    });

    test('LMS demand revocation during force-fresh preflight prevents every mutation (#17071)', async () => {
        let   admitted = true;
        const unloads  = [],
              loads   = [],
              snapshots = [
                  [{id: 'chat-model', contextLength: 1024}],
                  [{id: 'chat-model', contextLength: 1024}]
              ];

        const repair = ensureLmsModelsLoaded({
            host                    : 'http://127.0.0.1:1234',
            models                  : ['chat-model'],
            contextLengths          : {'chat-model': 4096},
            allowResidentReplacement: true,
            attempts                : 1,
            delayMs                 : 0,
            timeoutMs               : 10,
            fetchModelIds           : async () => ['chat-model'],
            async fetchLoadedModels() {
                const snapshot = snapshots.shift() || [{id: 'chat-model', contextLength: 1024}];

                if (snapshots.length === 0) admitted = false;
                return snapshot;
            },
            unloadModel          : async model => unloads.push(model),
            loadModel            : async model => loads.push(model),
            isAuthorityHeld      : () => true,
            isEffectStillAdmitted: () => admitted,
            log                  : {info() {}, warn() {}}
        });

        await expect(repair).rejects.toMatchObject({reason: 'runtime-effect-not-admitted'});
        expect(unloads).toEqual([]);
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

test.describe('provider readiness follows declared lane ownership (#17021)', () => {
    let getGraphProviderReadinessTarget, probeProviderParallelModelCapacity;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/graph/providerReadinessHelper.mjs');

        getGraphProviderReadinessTarget  = mod.getGraphProviderReadinessTarget;
        probeProviderParallelModelCapacity = mod.probeProviderParallelModelCapacity;
    });

    test('an Ollama graph lane does not require the OpenAI-compatible embedding model', async () => {
        const config = {
            modelProvider    : 'ollama',
            graphProvider    : 'ollama',
            embeddingProvider: 'openAiCompatible',
            ollama           : {
                host                 : 'http://chat-model:11434',
                model                : 'gemma4:26b',
                embeddingModel       : 'must-not-cross-lanes',
                requireParallelModels: 1
            },
            openAiCompatible: {
                host          : 'http://embedding-model:1234',
                embeddingModel: 'qwen3-embedding'
            }
        };

        expect(getGraphProviderReadinessTarget(config)).toMatchObject({
            provider      : 'ollama',
            model         : 'gemma4:26b',
            embeddingModel: null,
            roles         : [{providerRole: 'graphProvider', role: 'chat', model: 'gemma4:26b'}, {
                providerRole: 'modelProvider', role: 'chat', model: 'gemma4:26b'
            }]
        });

        const result = await probeProviderParallelModelCapacity({
            config,
            timeoutMs        : 100,
            fetchOllamaModels: async () => ['gemma4:26b']
        });

        expect(result).toMatchObject({
            ready         : true,
            requiredModels: ['gemma4:26b'],
            missingModels : []
        });
    });
});
