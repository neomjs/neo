import {test, expect} from '@playwright/test';
import {spawnSync}    from 'node:child_process';
import fs             from 'fs';
import os             from 'os';
import path           from 'path';
import * as yaml      from 'js-yaml';
import '../../../../../../src/Neo.mjs';
import '../../../../../../src/core/_export.mjs';
import {
    acquireAuthorityLeaseSurvivingSelfSuccession,
    assertStarvationReceiptReadable,
    enforceSingleton,
    LOCAL_AI_CONFIG_FILE,
    isOrchestratorDaemonCommand,
    loadLocalAiConfig,
    requiresOrchestratorPlane
} from '../../../../../../ai/daemons/orchestrator/daemon.mjs';
import {acquireAuthorityLease} from '../../../../../../ai/daemons/orchestrator/authorityLease.mjs';
import {
    AUTHORITY_LEASE_TTL_MS,
    authorityLeaseFilename
} from '../../../../../../ai/daemons/orchestrator/authorityLease.mjs';
import {
    buildOllamaServeEnv,
    getMaxOllamaContextLength,
    resolveOllamaHostPort,
    buildTaskDefinitions
} from '../../../../../../ai/daemons/orchestrator/taskDefinitions.mjs';

test.describe('ai/daemons/orchestrator/daemon.mjs (#11006/#11009)', () => {


    test.describe('self-succession: a restarted container waits out its own predecessor (720-restart loop)', () => {
        function leaseDir() {
            return fs.mkdtempSync(path.join(os.tmpdir(), 'neo-self-succession-'));
        }

        test('a DEAD predecessor is waited out and the lease is acquired — not an exit into a restart loop', async () => {
            // The loop, reproduced. A container entrypoint is always pid 1 and the hostname is the container
            // id, so a restart meets a lease whose recorded holder is byte-identical to the requester and
            // still fresh. Before this the boot threw, the process exited, Docker restarted it, and the cycle
            // repeated — 720 times on the local plane, ExitCode 0 and OOMKilled false, which is why it read
            // as a mystery rather than a lock.
            const dir     = leaseDir(),
                  profile = 'container-plane';

            // The predecessor: same identity this process will present, then it "dies" — nothing pulses it.
            acquireAuthorityLease({dir, profile});

            let sleptMs = 0;

            const handle = await acquireAuthorityLeaseSurvivingSelfSuccession({
                dir,
                profile,
                // The wait is what corroborates death: a dead predecessor stops pulsing, so its lease goes
                // stale. Injected rather than real so the test does not sleep a minute — but note it must
                // actually advance PAST the freshness window for the second claim to succeed, which is why
                // the assertion below checks the duration and not merely that sleep was called.
                // Records the requested duration but sleeps a SHORT REAL interval, because the lease's
                // freshness check reads real time — a zero-wait stub leaves the predecessor fresh and the
                // retry refuses, which is exactly how the first version of this test failed. The window is
                // tiny so the real wait stays negligible while genuinely elapsing past it.
                sleep: async ms => { sleptMs = ms; await new Promise(r => setTimeout(r, 60)); },
                ttlMs: 40
            });

            expect(handle, 'a restarted container must acquire after waiting, never exit').toBeTruthy();
            expect(sleptMs, 'it must wait past the freshness window, not retry immediately').toBeGreaterThan(0);

            handle.release();
        });

        test('a LIVE holder that keeps pulsing still REFUSES after the wait — fail-closed preserved', async () => {
            // The control, and the reason waiting is sound rather than a relaxation: the single-owner
            // invariant is untouched. A genuinely live duplicate keeps its lease fresh, so the second claim
            // refuses exactly as before. Without this, "wait and retry" would be indistinguishable from
            // deleting the refusal.
            const dir     = leaseDir(),
                  profile = 'container-plane',
                  holder  = acquireAuthorityLease({dir, profile});

            await expect(acquireAuthorityLeaseSurvivingSelfSuccession({
                dir,
                profile,
                // The wait must ELAPSE past the window and the holder must pulse inside it, so the lease is
                // fresh at the retry *because of the pulse* — the signature of a live process. An earlier
                // version pulsed without elapsing, which left the lease fresh at 0ms and would have passed
                // with the pulse removed entirely: a control that cannot fail proves nothing. The paired
                // test above is the proof this one discriminates — identical timing, no pulse, acquires.
                sleep: async () => { await new Promise(r => setTimeout(r, 60)); holder.pulse(); },
                ttlMs: 40
            })).rejects.toThrow(/is held by/);

            holder.release();
        });
    });

    test('builds task commands around existing manual maintenance scripts', () => {
        const scriptDir = path.resolve(process.cwd(), 'ai/scripts');
        const tasks     = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});

        expect(tasks.memoryCoreChroma).toBeUndefined();
        expect(Object.values(tasks).flatMap(task => task.args || [])).not.toContain('8001');

        expect(tasks.summary.command).toBe('/test/node');
        expect(tasks.summary.args).toEqual([path.join(scriptDir, 'lifecycle', 'summarize-sessions.mjs')]);
        expect(tasks.summary.expectedCommand).toBe('summarize-sessions.mjs');

        expect(tasks['memory-summary-backfill'].command).toBe('/test/node');
        expect(tasks['memory-summary-backfill'].args).toEqual([path.join(scriptDir, 'lifecycle', 'backfill-memory-summaries.mjs')]);
        expect(tasks['memory-summary-backfill'].expectedCommand).toBe('backfill-memory-summaries.mjs');

        expect(tasks.kbSync.command).toBe('/test/node');
        expect(tasks.kbSync.args).toEqual([path.join(scriptDir, 'maintenance', 'syncKnowledgeBase.mjs')]);
        expect(tasks.kbSync.expectedCommand).toBe('syncKnowledgeBase.mjs');

        expect(tasks['core-corpus-projection'].command).toBe('/test/node');
        expect(tasks['core-corpus-projection'].args).toEqual([path.join(scriptDir, 'maintenance', 'projectCoreCorpus.mjs')]);
        expect(tasks['core-corpus-projection'].expectedCommand).toBe('projectCoreCorpus.mjs');
        expect(tasks['core-corpus-projection'].captureStdoutJson).toBe(true);

        expect(tasks.backup.command).toBe('/test/node');
        expect(tasks.backup.args).toEqual([path.join(scriptDir, 'maintenance', 'backup.mjs')]);
        expect(tasks.backup.label).toBe('agent OS backup');
        expect(tasks.backup.expectedCommand).toBe('backup.mjs');

        expect(tasks['graphlog-compaction'].command).toBe('/test/node');
        expect(tasks['graphlog-compaction'].args).toEqual([
            path.join(scriptDir, 'maintenance', 'compactGraphLog.mjs'),
            '--apply',
            '--json'
        ]);
        expect(tasks['graphlog-compaction'].expectedCommand).toBe('compactGraphLog.mjs');
        expect(tasks['graphlog-compaction'].captureStdoutJson).toBe(true);
    });

    test('memory-summary backfill CLI is guarded by the shared heavy-maintenance lease', () => {
        const source = fs.readFileSync(
            path.resolve(process.cwd(), 'ai/scripts/lifecycle/backfill-memory-summaries.mjs'),
            'utf8'
        );

        expect(source).toContain('withHeavyMaintenanceLease');
        expect(source).toContain("owner       : 'memory-summary-backfill'");
        expect(source).toContain("reason      : 'manual-cli'");
        expect(source).toContain('staleAfterMs: AiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs');
    });

    test('buildTaskDefinitions is pure: tasks.mlx is omitted when mlxEnabled is false', () => {
        const scriptDir = path.resolve(process.cwd(), 'ai/scripts');
        const tasks     = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});

        expect(tasks.mlx).toBeUndefined();
    });

    test('buildTaskDefinitions is pure: MLX composition stays outside the task table', () => {
        // Architectural contract: taskDefinitions.mjs has no embedded MLX defaults
        // and no env-var reads. The daemon entrypoint composes MLX after reading
        // AiConfig, so stale caller params and env-vars are ignored here.
        const scriptDir          = path.resolve(process.cwd(), 'ai/scripts');
        const originalMlxModel   = process.env.NEO_ORCHESTRATOR_MLX_MODEL;
        const originalMlxEnabled = process.env.NEO_ORCHESTRATOR_MLX_ENABLED;
        const originalMlxPort    = process.env.NEO_ORCHESTRATOR_MLX_PORT;

        process.env.NEO_ORCHESTRATOR_MLX_ENABLED = 'true';
        process.env.NEO_ORCHESTRATOR_MLX_MODEL   = 'env-leaked-model';
        process.env.NEO_ORCHESTRATOR_MLX_PORT    = '99999';

        try {
            const tasks = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});
            expect(tasks.mlx).toBeUndefined();

            const staleCallerParams = buildTaskDefinitions({
                scriptDir,
                nodeBin   : '/test/node',
                mlxEnabled: true,
                mlxModel  : 'explicit-model',
                mlxPort   : 12345
            });
            expect(staleCallerParams.mlx).toBeUndefined();
        } finally {
            for (const [key, value] of [
                ['NEO_ORCHESTRATOR_MLX_MODEL',   originalMlxModel],
                ['NEO_ORCHESTRATOR_MLX_ENABLED', originalMlxEnabled],
                ['NEO_ORCHESTRATOR_MLX_PORT',    originalMlxPort]
            ]) {
                if (value === undefined) {
                    delete process.env[key];
                } else {
                    process.env[key] = value;
                }
            }
        }
    });

    test('AiConfig.orchestrator.mlx ships canonical MLX launch defaults', () => {
        // The Tier-1 root BASE (NOT the thin registration template, NOT the gitignored
        // config.mjs overlay) is the stable source of truth for MLX defaults since the
        // template/base split. Read it as text and assert the `data` leaf defaults:
        // importing it here would register a second provider alongside the config.mjs
        // singleton daemon.mjs loads, tripping the unitTestMode namespace-collision gatekeeper.
        const templateSource = fs.readFileSync(path.resolve(process.cwd(), 'ai/configBase.mjs'), 'utf8');

        expect(templateSource).toMatch(
            /mlx:\s*\{[\s\S]*?leaf\(false[\s\S]*?'mlx-community\/gemma-4-26b-a4b-it-bf16'[\s\S]*?'11435'/
        );
    });

    // -----------------------------------------------------------------------------
    // LM Studio CLI (`lms`) orchestrator-managed lifecycle (mirror of MLX)
    // -----------------------------------------------------------------------------

    test('buildTaskDefinitions is pure: tasks.lms is omitted when lmsEnabled is false', () => {
        const scriptDir = path.resolve(process.cwd(), 'ai/scripts');
        const tasks     = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});

        expect(tasks.lms).toBeUndefined();
    });

    test('buildTaskDefinitions is pure: LM Studio composition stays outside the task table', () => {
        // Architectural contract: taskDefinitions.mjs has no embedded LM Studio
        // defaults and no env-var reads. The daemon entrypoint composes LMS after
        // reading AiConfig, so stale caller params and env-vars are ignored here.
        const scriptDir          = path.resolve(process.cwd(), 'ai/scripts');
        const originalLmsModel   = process.env.NEO_ORCHESTRATOR_LMS_MODEL;
        const originalLmsEnabled = process.env.NEO_ORCHESTRATOR_LMS_ENABLED;
        const originalLmsPort    = process.env.NEO_ORCHESTRATOR_LMS_PORT;

        process.env.NEO_ORCHESTRATOR_LMS_ENABLED = 'true';
        process.env.NEO_ORCHESTRATOR_LMS_MODEL   = 'env-leaked-model';
        process.env.NEO_ORCHESTRATOR_LMS_PORT    = '99999';

        try {
            const tasks = buildTaskDefinitions({scriptDir, nodeBin: '/test/node'});
            expect(tasks.lms).toBeUndefined();

            const staleCallerParams = buildTaskDefinitions({
                scriptDir,
                nodeBin          : '/test/node',
                lmsEnabled       : true,
                lmsModel         : 'explicit-model',
                lmsModels        : ['chat-model', 'embedding-model'],
                lmsHost          : 'http://127.0.0.1:4242',
                providerReadiness: {attempts: 2, delayMs: 0, timeoutMs: 50, routineCacheTtlMs: 1000},
                lmsPort          : 4242
            });
            expect(staleCallerParams.lms).toBeUndefined();
        } finally {
            for (const [key, value] of [
                ['NEO_ORCHESTRATOR_LMS_MODEL',   originalLmsModel],
                ['NEO_ORCHESTRATOR_LMS_ENABLED', originalLmsEnabled],
                ['NEO_ORCHESTRATOR_LMS_PORT',    originalLmsPort]
            ]) {
                if (value === undefined) {
                    delete process.env[key];
                } else {
                    process.env[key] = value;
                }
            }
        }
    });

    test('buildTaskDefinitions ignores legacy LMS params, including an explicit empty lmsModels list (#12264)', () => {
        const tasks = buildTaskDefinitions({
            scriptDir : path.resolve(process.cwd(), 'ai/scripts'),
            nodeBin   : '/test/node',
            lmsEnabled: true,
            lmsModel  : 'legacy-fallback-model',
            lmsModels : [],
            lmsHost   : 'http://127.0.0.1:4242',
            lmsPort   : 4242
        });

        expect(tasks.lms).toBeUndefined();
    });

    test('AiConfig.orchestrator.lms keeps LM Studio opt-in with launch defaults', () => {
        // Tier-1 root base is the stable source of truth; read as text (see the MLX test
        // for why importing it collides with daemon.mjs's config.mjs singleton).
        const templateSource = fs.readFileSync(path.resolve(process.cwd(), 'ai/configBase.mjs'), 'utf8');

        // Provider processes are deployment choices, so the launcher defaults off while
        // retaining the model id and port used by an explicit host-edge opt-in.
        expect(templateSource).toMatch(
            /lms:\s*\{[\s\S]*?leaf\(false[\s\S]*?'qwen3-embedding-8b'[\s\S]*?'1234'/
        );
    });

    // -----------------------------------------------------------------------------
    // Native Ollama (`ollama serve`) orchestrator-managed lifecycle (local-dev only)
    // -----------------------------------------------------------------------------

    test('buildTaskDefinitions is pure: Ollama composition stays outside the task table', () => {
        const scriptDir = path.resolve(process.cwd(), 'ai/scripts');

        expect(buildTaskDefinitions({scriptDir, nodeBin: '/test/node'}).ollama).toBeUndefined();
        expect(buildTaskDefinitions({
            scriptDir,
            nodeBin      : '/test/node',
            ollamaEnabled: true,
            ollamaHost   : 'http://127.0.0.1:11434',
            ollamaRoles  : [{model: 'gemma4:26b'}]
        }).ollama).toBeUndefined();
    });

    test('native Ollama serve env helpers are pure and ignore process env', () => {
        const originalEnv = {
            OLLAMA_HOST                    : process.env.OLLAMA_HOST,
            OLLAMA_CONTEXT_LENGTH          : process.env.OLLAMA_CONTEXT_LENGTH,
            OLLAMA_MAX_LOADED_MODELS       : process.env.OLLAMA_MAX_LOADED_MODELS,
            NEO_ORCHESTRATOR_OLLAMA_ENABLED: process.env.NEO_ORCHESTRATOR_OLLAMA_ENABLED
        };

        process.env.OLLAMA_HOST = 'env-leaked-host:9999';
        process.env.OLLAMA_CONTEXT_LENGTH = '777';
        process.env.OLLAMA_MAX_LOADED_MODELS = '9';
        process.env.NEO_ORCHESTRATOR_OLLAMA_ENABLED = 'false';

        try {
            const roles = [{
                role         : 'chat',
                providerRole : 'graphProvider',
                model        : 'gemma4:26b',
                contextLength: 131072
            }, {
                role         : 'embedding',
                providerRole : 'embeddingProvider',
                model        : 'qwen3-embedding',
                contextLength: 32768
            }];

            expect(resolveOllamaHostPort('http://127.0.0.1:11445')).toBe(11445);
            expect(getMaxOllamaContextLength(roles)).toBe(131072);
            expect(buildOllamaServeEnv({
                host                 : 'http://127.0.0.1:11445',
                keepAlive            : -1,
                contextLength        : getMaxOllamaContextLength(roles),
                requireParallelModels: 2
            })).toEqual({
                OLLAMA_HOST             : '127.0.0.1:11445',
                OLLAMA_KEEP_ALIVE       : '-1',
                OLLAMA_CONTEXT_LENGTH   : '131072',
                OLLAMA_MAX_LOADED_MODELS: '2'
            });
        } finally {
            for (const [key, value] of Object.entries(originalEnv)) {
                if (value === undefined) {
                    delete process.env[key];
                } else {
                    process.env[key] = value;
                }
            }
        }
    });

    test('AiConfig.orchestrator.ollama keeps native launch opt-in', () => {
        const templateSource = fs.readFileSync(path.resolve(process.cwd(), 'ai/configBase.mjs'), 'utf8');

        expect(templateSource).toMatch(
            /ollama:\s*\{[\s\S]*?leaf\(false,\s*'NEO_ORCHESTRATOR_OLLAMA_ENABLED'/
        );
    });

    test('keeps wake-daemon wake-only and routes maintenance ownership to the daemon class', () => {
        const bridgeSource       = fs.readFileSync(path.resolve(process.cwd(), 'ai/daemons/wake/daemon.mjs'), 'utf8');
        const orchestratorSource = fs.readFileSync(path.resolve(process.cwd(), 'ai/daemons/orchestrator/daemon.mjs'), 'utf8');
        const daemonSource       = fs.readFileSync(path.resolve(process.cwd(), 'ai/daemons/orchestrator/Orchestrator.mjs'), 'utf8');
        const taskDefSource      = fs.readFileSync(path.resolve(process.cwd(), 'ai/daemons/orchestrator/taskDefinitions.mjs'), 'utf8');

        expect(bridgeSource).not.toContain('summarize-sessions.mjs');
        expect(bridgeSource).not.toContain('Piece C periodic summarization sweep');
        expect(bridgeSource).not.toContain('checkSummarizationLifecycle');

        expect(orchestratorSource).toContain('./Orchestrator.mjs');
        expect(orchestratorSource).toContain('orchestrator-daemon.pid');
        expect(orchestratorSource).toContain('setupCleanupHandlers');
        expect(orchestratorSource).toContain('enforceSingleton');
        expect(orchestratorSource).not.toContain('buildTaskDefinitions');
        expect(orchestratorSource).not.toContain('runMaintenanceCycle');
        expect(orchestratorSource).not.toContain('summarize-sessions.mjs');
        expect(orchestratorSource).not.toContain('syncKnowledgeBase.mjs');
        expect(orchestratorSource).not.toContain('backup.mjs');

        // Match the canonical maintenance-script path-component pattern from TaskDefinitions
        // (`path.join(scriptDir, 'lifecycle' | 'maintenance', '<name>.mjs')`). Bare filename
        // checks would false-positive against legitimate `./scheduling/<task>.mjs` imports
        // that share leaf names (e.g. `./scheduling/backup.mjs`).
        expect(daemonSource).not.toContain("'summarize-sessions.mjs'");
        expect(daemonSource).not.toContain("'syncKnowledgeBase.mjs'");
        expect(daemonSource).not.toContain("'backup.mjs'");

        expect(taskDefSource).toContain('summarize-sessions.mjs');
        expect(taskDefSource).toContain('syncKnowledgeBase.mjs');
        expect(taskDefSource).toContain('backup.mjs');
        expect(taskDefSource).toContain('compactGraphLog.mjs');
    });

    test('matches only the orchestrator daemon path-tail for singleton self-detection', () => {
        const legacyScriptsPath = ['ai', 'scripts', ['orchestrator', 'daemon.mjs'].join('-')].join('/');

        expect(isOrchestratorDaemonCommand('node /repo/ai/daemons/orchestrator/daemon.mjs')).toBe(true);
        expect(isOrchestratorDaemonCommand('/usr/local/bin/node ai/daemons/orchestrator/daemon.mjs --watch')).toBe(true);

        expect(isOrchestratorDaemonCommand('node /repo/ai/daemons/wake/daemon.mjs')).toBe(false);
        expect(isOrchestratorDaemonCommand(`node /repo/${legacyScriptsPath}`)).toBe(false);
        expect(isOrchestratorDaemonCommand('node daemon.mjs')).toBe(false);
    });

    test('asserts the Docker plane only for the plane-owning orchestrator role (#16210)', () => {
        expect(requiresOrchestratorPlane('container-plane')).toBe(true);
        expect(requiresOrchestratorPlane('legacy-mixed')).toBe(true);
        expect(requiresOrchestratorPlane('host-edge')).toBe(false);
    });

    test('#15759: cloud Compose gives the AiConfig data dir one dedicated, sole-owner volume', () => {
        const compose        = yaml.load(fs.readFileSync(path.resolve(process.cwd(), 'ai/deploy/docker-compose.yml'), 'utf8'));
        const dataDir        = '/app/.neo-ai-data/orchestrator-daemon';
        const volumeName     = 'orchestrator-state';
        const expectedMount  = `${volumeName}:${dataDir}`;
        const orchestrator   = compose.services.orchestrator;
        const healthcheckCmd = orchestrator.healthcheck.test.join(' ');
        const templateSource = fs.readFileSync(path.resolve(process.cwd(), 'ai/configBase.mjs'), 'utf8');

        expect(compose.volumes).toHaveProperty(volumeName);
        expect(orchestrator.environment).not.toContain(`NEO_AI_ORCHESTRATOR_DIR=${dataDir}`);
        expect(templateSource).toContain(
            "dataDir: leaf(path.resolve(planeDataRootDefault, 'orchestrator-daemon'), 'NEO_AI_ORCHESTRATOR_DIR'"
        );
        expect(orchestrator.volumes).toContain(expectedMount);
        expect(orchestrator.healthcheck.test.slice(0, 4)).toEqual(['CMD', 'node', '--input-type=module', '-e']);
        expect(healthcheckCmd).toContain("await import('./ai/config.mjs')");
        expect(healthcheckCmd).toContain('AiConfig.orchestrator.dataDir');
        expect(healthcheckCmd).toContain('AiConfig.orchestrator.authorityProfile');
        expect(healthcheckCmd).toContain('inspectAuthorityLease');
        expect(healthcheckCmd).not.toContain('process.env.NEO_AI_ORCHESTRATOR_DIR');
        expect(healthcheckCmd).not.toContain('orchestrator-state.json');

        for (const [serviceName, service] of Object.entries(compose.services)) {
            if (serviceName === 'orchestrator') continue;

            expect(
                service.volumes || [],
                `${serviceName} must not read or write the orchestrator-owned state volume`
            ).not.toContain(expectedMount);
            expect(
                (service.volumes || []).some(mount =>
                    typeof mount === 'string' &&
                    (mount.startsWith(`${volumeName}:`) || mount.endsWith(`:${dataDir}`))
                ),
                `${serviceName} must not alias the orchestrator-owned source or target`
            ).toBe(false);
        }
    });

    test('#16283: cloud health follows the authority lease, not task completion', () => {
        const compose      = yaml.load(fs.readFileSync(path.resolve(process.cwd(), 'ai/deploy/docker-compose.yml'), 'utf8'));
        const orchestrator = compose.services.orchestrator;
        const probeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-orchestrator-health-'));
        const stateFile    = path.join(probeDataDir, 'orchestrator-state.json');
        const leaseFile    = path.join(probeDataDir, authorityLeaseFilename('container-plane'));
        const probeEnv     = {
            ...process.env,
            NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE: 'container-plane',
            NEO_AI_ORCHESTRATOR_DIR              : probeDataDir
        };
        const probeArgs = orchestrator.healthcheck.test.slice(2);
        const runProbe  = env => spawnSync('node', probeArgs, {
            cwd     : process.cwd(),
            encoding: 'utf8',
            env     : {...probeEnv, ...env}
        }).status;

        try {
            fs.writeFileSync(stateFile, JSON.stringify({summary: {running: true}}));

            const staleTaskAt = new Date(Date.now() - 11 * 60 * 1000);
            fs.utimesSync(stateFile, staleTaskAt, staleTaskAt);
            fs.writeFileSync(leaseFile, JSON.stringify({
                pid       : 7,
                owner     : 'plane-daemon',
                ownerToken: 'plane-token',
                profile   : 'container-plane',
                startedAt : new Date().toISOString(),
                lastPulse : new Date().toISOString()
            }));

            expect(runProbe()).toBe(0);

            const lease = JSON.parse(fs.readFileSync(leaseFile, 'utf8'));

            fs.writeFileSync(leaseFile, JSON.stringify({
                ...lease,
                lastPulse: new Date(Date.now() - AUTHORITY_LEASE_TTL_MS - 1000).toISOString()
            }));
            expect(runProbe()).toBe(1);

            fs.writeFileSync(leaseFile, '{corrupt');
            expect(runProbe()).toBe(1);

            fs.writeFileSync(leaseFile, JSON.stringify({...lease, profile: 'host-edge'}));
            expect(runProbe()).toBe(1);

            fs.rmSync(leaseFile);
            expect(runProbe()).toBe(1);
        } finally {
            fs.rmSync(probeDataDir, {force: true, recursive: true});
        }
    });

    test('#15759: a dead persisted daemon PID is reclaimed on the next process epoch', async () => {
        const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-orchestrator-stale-pid-'));
        const pidFile = path.join(dataDir, 'orchestrator-daemon.pid');

        try {
            fs.writeFileSync(pidFile, '2147483647', 'utf8');

            await enforceSingleton({pidFile});

            expect(fs.readFileSync(pidFile, 'utf8')).toBe(String(process.pid));
        } finally {
            fs.rmSync(dataDir, {recursive: true, force: true});
        }
    });

    test('loads gitignored top-level AI config only when present', async () => {
        const loadedPaths = [];
        const aiConfig    = {
            async load(configPath) {
                loadedPaths.push(configPath);
            }
        };

        await expect(loadLocalAiConfig({
            configPath: '/tmp/missing-ai-config.mjs',
            aiConfig,
            existsSync: () => false
        })).resolves.toEqual({
            loaded    : false,
            configPath: '/tmp/missing-ai-config.mjs'
        });

        await expect(loadLocalAiConfig({
            configPath: '/tmp/local-ai-config.mjs',
            aiConfig,
            existsSync: () => true
        })).resolves.toEqual({
            loaded    : true,
            configPath: '/tmp/local-ai-config.mjs'
        });

        expect(loadedPaths).toEqual(['/tmp/local-ai-config.mjs']);
        expect(LOCAL_AI_CONFIG_FILE).toBe(path.resolve(process.cwd(), 'ai/config.mjs'));
    });

});

test.describe('assertStarvationReceiptReadable — boot refuses an unreadable starvation verdict (#17290)', () => {
    const aiConfig = ({checkMs, staleAfterMs}) => ({
        orchestrator: {
            intervals            : {heavyMaintenanceStarvationWatchdogCheckMs: checkMs},
            heavyMaintenanceLease: {starvationReceiptStaleAfterMs: staleAfterMs}
        }
    });

    test('the shipped 10min/2min pair is refused, and the error names both numbers and the gap', () => {
        let thrown;

        try {
            assertStarvationReceiptReadable({aiConfig: aiConfig({checkMs: 600000, staleAfterMs: 120000})});
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeTruthy();
        expect(thrown.message).toContain('600000ms');
        expect(thrown.message).toContain('120000ms');
        expect(thrown.message).toContain('480000ms');
        // The remediation must name the leaves, not just the symptom.
        expect(thrown.message).toContain('NEO_HEAVY_MAINTENANCE_LEASE_STARVATION_RECEIPT_STALE_MS');
        expect(thrown.message).toContain('NEO_ORCHESTRATOR_HEAVY_STARVATION_WATCHDOG_INTERVAL_MS');
    });

    test('the derived default boots and returns its numbers', () => {
        expect(assertStarvationReceiptReadable({
            aiConfig: aiConfig({checkMs: 600000, staleAfterMs: 1200000})
        })).toMatchObject({reachable: true, unreadableMs: 0});
    });

    test('a disabled watchdog boots — nothing is stamped, so nothing goes unread', () => {
        expect(assertStarvationReceiptReadable({
            aiConfig: aiConfig({checkMs: 0, staleAfterMs: 0})
        })).toMatchObject({reachable: true});
    });
});
