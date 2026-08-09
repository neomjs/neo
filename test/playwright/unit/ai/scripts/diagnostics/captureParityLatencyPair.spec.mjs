import {test, expect} from '@playwright/test';
import {
    ParityLatencyCaptureActor,
    SEAT_ADAPTER_PRODUCER,
    assembleLatencyPair,
    captureParityLatencyPair,
    checkCapturePrerequisites,
    deriveDatasetDigest,
    deriveImageManifestDigest,
    isRetryableParityStartupError
} from '../../../../../../ai/scripts/diagnostics/captureParityLatencyPair.mjs';
import {
    MIN_SAMPLES,
    PARITY_CACHE_CONVENTION
} from '../../../../../../ai/scripts/diagnostics/parityLatencyPair.mjs';

const
    PUBLIC_CONDITIONS = {cacheConvention: PARITY_CACHE_CONVENTION},
    IDENTITY_PROOF    = {
        identity       : '@neo-gpt',
        capabilities   : [],
        grantedToOthers: []
    },
    EMPTY_HEALTH      = {
        'memory-core': {
            database: {connection: {collections: {
                memories : {count: 0},
                summaries: {count: 0}
            }}}
        },
        'knowledge-base': {
            database: {connection: {collections: {
                knowledgeBase: {count: 0}
            }}}
        }
    },
    DATASET_DIGEST    = deriveDatasetDigest(EMPTY_HEALTH, IDENTITY_PROOF),
    BOUND_CONDITIONS  = {
        cacheConvention: PARITY_CACHE_CONVENTION,
        imageDigest    : 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
        datasetDigest  : DATASET_DIGEST,
        configHead     : '1111111111111111111111111111111111111111',
        runtimeDigest  : 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
        hostLoad       : 'darwin/arm64; cpus=12; load1=0.20; load5=0.25; load15=0.30'
    },
    CAPTURE_PLAN = {
        producer        : SEAT_ADAPTER_PRODUCER,
        harnessType     : 'codex',
        repoPath        : '/managed/seat/repo',
        sourceRoot      : '/installed/neo',
        expectedIdentity: '@neo-gpt',
        servers         : {
            'memory-core': {
                name   : 'neo-mjs-memory-core',
                enabled: true,
                stdio  : {
                    command: '/usr/bin/node',
                    args   : ['/installed/neo/ai/mcp/server/memory-core/mcp-server.mjs'],
                    envVars: ['NEO_AGENT_IDENTITY']
                },
                remote: {
                    url             : 'http://127.0.0.1:13130/mc/mcp',
                    credentialEnvVar: 'NEO_MCP_REMOTE_TOKEN'
                }
            },
            'knowledge-base': {
                name   : 'neo-mjs-knowledge-base',
                enabled: true,
                stdio  : {
                    command: '/usr/bin/node',
                    args   : ['/installed/neo/ai/mcp/server/knowledge-base/mcp-server.mjs'],
                    envVars: ['NEO_AGENT_IDENTITY']
                },
                remote: {
                    url             : 'http://127.0.0.1:13130/kb/mcp',
                    credentialEnvVar: 'NEO_MCP_REMOTE_TOKEN'
                }
            }
        }
    };

test.describe('capture prerequisites — producer receipt, not caller probes', () => {
    test('the producer is the installed Codex normalized-read boundary', () => {
        expect(SEAT_ADAPTER_PRODUCER).toBe('installed-codex-mcp-list')
    });

    test('a missing private producer handoff blocks the otherwise valid public request', async () => {
        const result = await captureParityLatencyPair({
            sampleCount       : MIN_SAMPLES,
            conditions        : PUBLIC_CONDITIONS,
            acceptableOverhead: 3
        });

        expect(result.ok).toBe(false);
        expect(result.blocked).toBe(true);
        expect(result.reason).toContain('exact secret-free installed Codex receipt');
        expect(result.reason).toContain('public capture spec cannot claim or substitute')
    });

    test('the data-only sample floor + ruled cache convention passes', () => {
        expect(checkCapturePrerequisites({
            sampleCount: MIN_SAMPLES,
            conditions : PUBLIC_CONDITIONS
        })).toBeNull()
    });

    test('the public object cannot smuggle a plan or probe callbacks', () => {
        expect(checkCapturePrerequisites({
            sampleCount: MIN_SAMPLES,
            conditions : PUBLIC_CONDITIONS,
            capturePlan: CAPTURE_PLAN
        })).toContain("unsupported public capture field 'capturePlan'");

        const reason = checkCapturePrerequisites({
            sampleCount       : MIN_SAMPLES,
            conditions        : PUBLIC_CONDITIONS,
            acceptableOverhead: 3,
            probeHotCall      : () => {}
        });

        expect(reason).toContain("unsupported public capture field 'probeHotCall'");
        expect(reason).toContain('data-only')
    });

    test('caller-authored derived conditions are refused instead of trusted', () => {
        for (const key of ['imageDigest', 'datasetDigest', 'configHead', 'runtimeDigest', 'hostLoad']) {
            const reason = checkCapturePrerequisites({
                sampleCount: MIN_SAMPLES,
                conditions : {...PUBLIC_CONDITIONS, [key]: 'caller-text'}
            });

            expect(reason, key).toContain('producer-owned observations')
        }
    });

    test('sample floor and exact cache regime remain executable', () => {
        expect(checkCapturePrerequisites({
            sampleCount: MIN_SAMPLES - 1,
            conditions : PUBLIC_CONDITIONS
        })).toContain(`at least ${MIN_SAMPLES}`);

        expect(checkCapturePrerequisites({
            sampleCount: MIN_SAMPLES,
            conditions : {cacheConvention: 'cold-with-build'}
        })).toContain('exactly PARITY_CACHE_CONVENTION')
    });

    test('the private handoff accepts only one exact loopback /mc + /kb ingress', async () => {
        const mutations = [
            plan => { plan.servers['memory-core'].remote.url = 'https://tenant.example.com/mc/mcp'; return plan },
            plan => { plan.servers['knowledge-base'].remote.url = 'http://127.0.0.1:13131/kb/mcp'; return plan },
            plan => { plan.servers['memory-core'].remote.url = 'http://127.0.0.1:13130/mcp'; return plan },
            plan => { plan.servers['memory-core'].remote.credentialEnvVar = 'GH_TOKEN'; return plan },
            plan => { plan.servers['memory-core'].stdio.command = 'node'; return plan },
            plan => { plan.sourceRoot = 'relative'; return plan },
            plan => { plan.expectedIdentity = 'neo-gpt'; return plan },
            plan => { plan.servers['memory-core'].extra = true; return plan }
        ];

        for (const mutate of mutations) {
            const result = await captureParityLatencyPair({
                sampleCount: MIN_SAMPLES,
                conditions : PUBLIC_CONDITIONS
            }, {
                capturePlan: mutate(structuredClone(CAPTURE_PLAN))
            });

            expect(result.ok).toBe(false);
            expect(result.blocked).toBe(true)
        }
    });

    test('a valid installed plan still refuses without Fleet-resolved plane authority', async () => {
        const result = await captureParityLatencyPair({
            sampleCount: MIN_SAMPLES,
            conditions : PUBLIC_CONDITIONS
        }, {capturePlan: CAPTURE_PLAN});

        expect(result.ok).toBe(false);
        expect(result.blocked).toBe(true);
        expect(result.reason).toContain('resolved plane credential')
    });
});

test.describe('default actor — session, source, and cleanup contracts', () => {
    test('retries listener races but never retries auth, plane, or identity failures', () => {
        expect(isRetryableParityStartupError(Object.assign(new Error('connect'), {
            code: 'ECONNREFUSED'
        }))).toBe(true);
        expect(isRetryableParityStartupError(new Error('503 service unavailable'))).toBe(true);

        for (const error of [
            new Error('401 unauthorized'),
            new Error('served the wrong plane'),
            new Error('canonical identity mismatch')
        ]) {
            expect(isRetryableParityStartupError(error)).toBe(false)
        }
    });

    test('the isolated stdio plane relocates the Fleet-owned root with every other member', () => {
        const actor = new ParityLatencyCaptureActor({capturePlan: CAPTURE_PLAN});

        actor.stdioDataRoot = '/capture/plane';

        const env = actor.createStdioCaptureEnv();

        expect(env.NEO_PLANE_DATA_ROOT).toBe('/capture/plane');
        expect(env.NEO_FLEET_DATA_DIR).toBe('/capture/plane/fleet')
    });

    test('terminates an HTTP session before closing its local SDK client', async () => {
        const
            actor = new ParityLatencyCaptureActor({capturePlan: CAPTURE_PLAN}),
            order = [];

        await actor.closeSession({
            topology : 'parity',
            key      : 'memory-core',
            transport: {
                sessionId: 'session-1',
                async terminateSession() {
                    order.push('delete')
                }
            },
            client: {
                async close() {
                    order.push('close')
                }
            }
        });

        expect(order).toEqual(['delete', 'close'])
    });

    test('a partial topology connection closes its successful sibling before refusing', async () => {
        const
            actor  = new ParityLatencyCaptureActor({capturePlan: CAPTURE_PLAN}),
            closed = [];

        actor.openSessionWithRetry = async ({key}) => {
            if (key === 'knowledge-base') throw new Error('kb-control');

            return {
                session: {
                    client   : {close: async () => closed.push('client')},
                    transport: {},
                    topology : 'stdio',
                    key
                },
                health       : EMPTY_HEALTH['memory-core'],
                identityProof: IDENTITY_PROOF
            }
        };

        await expect(actor.connectTopology({
            topology   : 'stdio',
            startedAt  : 0,
            capturePlan: CAPTURE_PLAN
        })).rejects.toThrow(/kb-control/);
        expect(closed).toEqual(['client'])
    });

    test('source binding refuses dirty bytes and binds ignored runtime configs', async () => {
        const
            head                = BOUND_CONDITIONS.configHead,
            runtimeFiles        = [],
            makeActorWithStatus = dirty => new ParityLatencyCaptureActor({
                capturePlan: CAPTURE_PLAN,
                fileSystem : {
                    async readFile(filePath) {
                        runtimeFiles.push(filePath);

                        return Buffer.from(`runtime:${filePath}`)
                    }
                },
                execFileFn(command, args, options, callback) {
                    if (args.includes('rev-parse')) {
                        callback(null, `${head}\n`)
                    } else if (args.includes('status')) {
                        callback(null, dirty && args.includes(CAPTURE_PLAN.sourceRoot) ? '?? drift.mjs\n' : '')
                    } else {
                        callback(new Error('unexpected command'))
                    }
                }
            });

        const binding = await makeActorWithStatus(false).readSourceBinding();

        expect(binding.configHead).toBe(head);
        expect(binding.runtimeDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(runtimeFiles).toHaveLength(3);

        await expect(makeActorWithStatus(true).readSourceBinding()).rejects.toThrow(/clean before capture/)
    });

    test('server images must prove label, requested-ref, and packaged revision equality', async () => {
        const
            calls = [],
            head  = BOUND_CONDITIONS.configHead,
            actor = new ParityLatencyCaptureActor({
                capturePlan: CAPTURE_PLAN,
                execFileFn(command, args, options, callback) {
                    calls.push(args);

                    if (args[0] === 'image') {
                        callback(null, `${head}|${head}\n`)
                    } else if (args[0] === 'run') {
                        callback(null, `${head}\n`)
                    } else {
                        callback(new Error('unexpected command'))
                    }
                }
            });

        await actor.assertServerImageSourceBinding({
            service     : 'mc-server',
            imageId     : BOUND_CONDITIONS.imageDigest,
            expectedHead: head
        });
        expect(calls.map(args => args[0])).toEqual(['image', 'run']);

        actor.execFileFn = (command, args, options, callback) => callback(null, 'wrong|wrong\n');

        await expect(actor.assertServerImageSourceBinding({
            service     : 'mc-server',
            imageId     : BOUND_CONDITIONS.imageDigest,
            expectedHead: head
        })).rejects.toThrow(/not bound to exact source head/)
    });
});

test.describe('data-only assembly', () => {
    const observation = index => ({
        boot: {
            stdio : {memoryCoreMs: 100 + index, knowledgeBaseMs: 105 + index},
            parity: {memoryCoreMs: 210 + index, knowledgeBaseMs: 215 + index}
        },
        hotCall: {
            stdio : {memoryCoreMs: 10 + index, knowledgeBaseMs: 11 + index},
            parity: {memoryCoreMs: 12 + index, knowledgeBaseMs: 13 + index}
        }
    });

    test('accepts exactly the captured observation count', () => {
        const observations = Array.from({length: MIN_SAMPLES}, (_, index) => observation(index));
        const result       = assembleLatencyPair({
            sampleCount       : MIN_SAMPLES,
            observations,
            conditions        : BOUND_CONDITIONS,
            acceptableOverhead: 3
        });

        expect(result.ok).toBe(true);
        expect(result.pair.boot.parity.sampleCount).toBe(MIN_SAMPLES)
    });

    test('refuses missing samples and flattened per-service slots', () => {
        expect(assembleLatencyPair({
            sampleCount       : MIN_SAMPLES,
            observations      : [],
            conditions        : BOUND_CONDITIONS,
            acceptableOverhead: 3
        }).reason).toContain(`exactly ${MIN_SAMPLES}`);

        const observations = Array.from({length: MIN_SAMPLES}, (_, index) => observation(index));

        observations[1].hotCall.parity = 12;

        const result = assembleLatencyPair({
            sampleCount       : MIN_SAMPLES,
            observations,
            conditions        : BOUND_CONDITIONS,
            acceptableOverhead: 3
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('sample 1');
        expect(result.reason).toContain('hotCall.parity')
    });
});

test.describe('producer-derived reproducibility evidence', () => {
    test('the canonical empty MC + KB corpus has one stable digest', () => {
        expect(deriveDatasetDigest(EMPTY_HEALTH, IDENTITY_PROOF)).toBe(DATASET_DIGEST);
        expect(deriveDatasetDigest(EMPTY_HEALTH, {
            ...IDENTITY_PROOF,
            identity: '@another-seat'
        })).not.toBe(DATASET_DIGEST)
    });

    test('dataset evidence refuses absent, negative, or non-integer counts', () => {
        for (const count of [undefined, -1, 0.5, '0']) {
            expect(() => deriveDatasetDigest({
                'memory-core': {
                    database: {connection: {collections: {
                        memories : {count},
                        summaries: {count: 0}
                    }}}
                },
                'knowledge-base': {
                    database: {connection: {collections: {
                        knowledgeBase: {count: 0}
                    }}}
                }
            }, IDENTITY_PROOF)).toThrow(/dataset count/)
        }
    });

    test('dataset evidence refuses an unbound or permission-bearing subject', () => {
        for (const proof of [
            undefined,
            {...IDENTITY_PROOF, identity: 'neo-gpt'},
            {...IDENTITY_PROOF, capabilities: ['memory:read']},
            {...IDENTITY_PROOF, grantedToOthers: ['@other']}
        ]) {
            expect(() => deriveDatasetDigest(EMPTY_HEALTH, proof)).toThrow(/identity proof/)
        }
    });

    test('image manifest digest is order-independent and covers every capture service', () => {
        const rows = [
            {Service: 'mc-server', ID: 'sha256:mc'},
            {Service: 'capture-ingress', ID: 'sha256:caddy'},
            {Service: 'chroma', ID: 'sha256:chroma'},
            {Service: 'kb-server', ID: 'sha256:kb'},
            {Service: 'embedding-server', ID: 'sha256:embed'}
        ];
        const forward = deriveImageManifestDigest(rows.map(row => JSON.stringify(row)).join('\n'));
        const reverse = deriveImageManifestDigest(JSON.stringify([...rows].reverse()));

        expect(forward.digest).toBe(reverse.digest);
        expect(forward.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(forward.services).toEqual([
            'capture-ingress',
            'chroma',
            'embedding-server',
            'kb-server',
            'mc-server'
        ])
    });

    test('an incomplete image manifest refuses', () => {
        expect(() => deriveImageManifestDigest(JSON.stringify([
            {Service: 'chroma', ID: 'sha256:chroma'}
        ]))).toThrow(/omitted/)
    });
});
