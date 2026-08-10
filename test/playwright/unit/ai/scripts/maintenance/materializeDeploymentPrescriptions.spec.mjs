import {test, expect}  from '@playwright/test';
import {execFileSync}  from 'node:child_process';
import fs              from 'fs-extra';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {
    materializeDeploymentPrescriptions,
    mergePrescribedEnvironment,
    prescribedEnvironmentKeys,
    resolveDeploymentRuntimeContext,
    writeDeploymentPrescriptionReceipt
} from '../../../../../../ai/scripts/maintenance/materializeDeploymentPrescriptions.mjs';
import {
    appendDeploymentPrescription,
    readDeploymentPrescriptions
} from '../../../../../../ai/services/memory-core/helpers/deploymentPrescriptionStore.mjs';

/**
 * End-to-end host-delivery witnesses for deployment prescriptions.
 *
 * The store, admission fold, env merge, persistent carrier, project symlink, pre-up manifest, and
 * post-health receipt are tested together here. Testing those modules only in isolation would permit
 * the exact helper-only defect this delivery path closes: specs composing an edge no production caller owns.
 *
 * No live container is started. The optional effect witness uses `docker compose config`, which
 * evaluates the real production Compose interpolation without contacting the Docker daemon.
 */

const
    repoRoot     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..'),
    CLI          = path.join(repoRoot, 'ai/scripts/maintenance/materializeDeploymentPrescriptions.mjs'),
    COMPOSE_FILE = path.join(repoRoot, 'ai/deploy/docker-compose.yml'),
    KNOB         = 'container-memory-ceiling',
    LEAF         = 'deploy.chroma.memoryCeilingBytes',
    ENV_KEY      = 'NEO_CHROMA_MEMORY_LIMIT',
    LIVE_BYTES   = 8 * 1024 ** 3,
    PRESCRIBED   = 12 * 1024 ** 3,
    SECOND_VALUE = 14 * 1024 ** 3,
    DEPLOYED_SHA = 'a'.repeat(40),
    RUN_ID       = '11111111-1111-4111-8111-111111111111';

let workRoot;

test.beforeEach(async () => {
    workRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-prescription-materialize-'))
});

test.afterEach(async () => {
    await fs.remove(workRoot)
});

/**
 * @summary Builds the temp paths one materialization cycle owns.
 * @param {String} [name]
 * @returns {Object}
 */
function pathsFor(name = 'default') {
    const root = path.join(workRoot, name);

    return {
        root,
        ledgerPath    : path.join(root, 'prescriptions.jsonl'),
        envPath       : path.join(root, 'active.env'),
        statePath     : path.join(root, 'materialized-state.json'),
        receiptPath   : path.join(root, 'last-delivery-receipt.json'),
        projectEnvPath: path.join(root, 'project', '.env')
    }
}

/**
 * @summary Creates one valid semantic prescription for the registry's deployed container knob.
 * @param {Object} [overrides]
 * @returns {Object}
 */
function semanticPrescription(overrides = {}) {
    return {
        prescriptionId          : 'P:first',
        supersedesPrescriptionId: null,
        knob                    : KNOB,
        targetIdentity          : {kind: 'compose-service', id: 'chroma'},
        values                  : {[LEAF]: PRESCRIBED},
        validatedAgainst        : {
            context   : {'runtime.chroma.liveMemoryLimitBytes': LIVE_BYTES},
            observedAt: 1_000
        },
        ...overrides
    }
}

/**
 * @summary Supplies the measured live limit used by valid materialization controls.
 * @returns {Promise<Object>}
 */
async function liveContext() {
    return {'runtime.chroma.liveMemoryLimitBytes': LIVE_BYTES}
}

/**
 * @summary Reports whether the daemon-free Compose config evaluator is installed.
 * @returns {Boolean}
 */
function composeConfigAvailable() {
    try {
        execFileSync('docker', ['compose', 'version'], {stdio: 'ignore'});
        return true
    } catch {
        return false
    }
}

/**
 * @summary Resolves the real Chroma memory field through production Compose interpolation.
 * @param {String|null} envFilePath
 * @returns {String|null}
 */
function resolvedChromaMemory(envFilePath) {
    const args = ['compose', '-f', COMPOSE_FILE];

    envFilePath && args.push('--env-file', envFilePath);
    args.push('config', '--format', 'json');

    const config = JSON.parse(execFileSync('docker', args, {
        cwd     : repoRoot,
        encoding: 'utf8',
        stdio   : ['ignore', 'pipe', 'ignore']
    }));

    return config?.services?.chroma?.deploy?.resources?.limits?.memory ?? null
}

test.describe('registry-owned env merge', () => {
    test('preserves unrelated bytes and removes every stale deployment-owned occurrence', () => {
        const existing = [
            '# operator comment\r\n',
            'TOKEN="s==x"\r\n',
            `${ENV_KEY}=8g\r\n`,
            'UNOWNED=1\n',
            // This is an actuator-local knob with no deployment service; the materializer must not
            // claim or erase it merely because the shared registry has an env binding.
            'NEO_MC_GENERATE_MINI_SUMMARY_TIMEOUT_MS=12345\n',
            `${ENV_KEY}=10g\n`
        ].join('');

        const merged = mergePrescribedEnvironment(existing, `${ENV_KEY}=${PRESCRIBED}\n`);

        expect(prescribedEnvironmentKeys()).toEqual(new Set([ENV_KEY]));
        expect(merged).toBe(
            '# operator comment\r\n' +
            'TOKEN="s==x"\r\n' +
            'UNOWNED=1\n' +
            'NEO_MC_GENERATE_MINI_SUMMARY_TIMEOUT_MS=12345\n' +
            `${ENV_KEY}=${PRESCRIBED}\n`
        )
    });

    test('an empty active set removes a stale owned line without touching the rest', () => {
        expect(mergePrescribedEnvironment(`KEEP=1\n${ENV_KEY}=12g\n# tail`, ''))
            .toBe('KEEP=1\n# tail')
    })
});

test.describe('persistent carrier and authority gates', () => {
    test('explicitly adopts a regular project .env, preserves it, and installs the durable symlink', async () => {
        const paths = pathsFor('adopt');

        await fs.ensureDir(path.dirname(paths.projectEnvPath));
        await fs.writeFile(paths.projectEnvPath, `TOKEN=keep-me\n${ENV_KEY}=operator-old\n`);

        const result = await materializeDeploymentPrescriptions({...paths, adoptExistingEnv: true});

        expect(result.status).toBe('materialized');
        expect(result.activeCount).toBe(0);
        expect(await fs.readFile(paths.envPath, 'utf8')).toBe('TOKEN=keep-me\n');
        expect((await fs.lstat(paths.projectEnvPath)).isSymbolicLink()).toBe(true);
        expect(await fs.realpath(paths.projectEnvPath)).toBe(await fs.realpath(paths.envPath));

        const state = await fs.readJson(paths.statePath);

        expect(state.activePrescriptions).toEqual([]);
        expect(state.materializedDigest).toMatch(/^[0-9a-f]{64}$/)
    });

    test('a regular project .env refuses without explicit adoption and remains untouched', async () => {
        const paths = pathsFor('refuse-adopt');

        await fs.ensureDir(path.dirname(paths.projectEnvPath));
        await fs.writeFile(paths.projectEnvPath, 'TOKEN=untouched\n');

        await expect(materializeDeploymentPrescriptions(paths)).rejects.toThrow('--adopt-existing-env');
        expect(await fs.readFile(paths.projectEnvPath, 'utf8')).toBe('TOKEN=untouched\n');
        expect(await fs.pathExists(paths.envPath)).toBe(false);
        expect(await fs.pathExists(paths.statePath)).toBe(false)
    });

    test('adoption restores a last-moment operator update instead of overwriting it', async () => {
        const paths = pathsFor('adopt-race');

        await fs.ensureDir(path.dirname(paths.projectEnvPath));
        await fs.writeFile(paths.projectEnvPath, 'TOKEN=observed\n');
        await fs.writeFile(paths.envPath, 'TOKEN=observed\n');

        let raced = false;

        const racingFs = new Proxy(fs, {
            get(target, property) {
                if (property === 'rename') {
                    return async (source, destination) => {
                        if (!raced && source === paths.projectEnvPath && destination.endsWith('.captured')) {
                            raced = true;
                            await fs.writeFile(paths.projectEnvPath, 'TOKEN=operator-new\n')
                        }

                        return fs.rename(source, destination)
                    }
                }

                const value = target[property];

                return typeof value === 'function' ? value.bind(target) : value
            }
        });

        await expect(materializeDeploymentPrescriptions({
            ...paths,
            adoptExistingEnv: true,
            fsModule        : racingFs
        })).rejects.toThrow('changed during materialization; restored without replacement');

        expect(raced).toBe(true);
        expect((await fs.lstat(paths.projectEnvPath)).isFile()).toBe(true);
        expect(await fs.readFile(paths.projectEnvPath, 'utf8')).toBe('TOKEN=operator-new\n');
        expect(await fs.readFile(paths.envPath, 'utf8')).toBe('TOKEN=observed\n');
        expect(await fs.pathExists(paths.statePath)).toBe(false)
    });

    test('an exported deployment-owned key refuses before changing the carrier', async () => {
        const paths = pathsFor('ambient-precedence');

        await fs.ensureDir(paths.root);
        await fs.writeFile(paths.envPath, 'KEEP=previous\n');
        await fs.ensureDir(path.dirname(paths.projectEnvPath));
        await fs.symlink(paths.envPath, paths.projectEnvPath);

        await expect(materializeDeploymentPrescriptions({
            ...paths,
            ambientEnvironment: {[ENV_KEY]: '13g'}
        })).rejects.toThrow(`must be unset before materialization: ${ENV_KEY}`);

        expect(await fs.readFile(paths.envPath, 'utf8')).toBe('KEEP=previous\n');
        expect(await fs.pathExists(paths.statePath)).toBe(false)
    });

    test('a tampered sink record aborts before changing the existing carrier or manifest', async () => {
        const paths = pathsFor('tampered');

        await fs.ensureDir(paths.root);
        await fs.writeFile(paths.envPath, 'KEEP=previous\n');
        await fs.ensureDir(path.dirname(paths.projectEnvPath));
        await fs.symlink(paths.envPath, paths.projectEnvPath);

        await appendDeploymentPrescription({
            ledgerPath  : paths.ledgerPath,
            prescription: semanticPrescription(),
            now         : 2_000
        });

        const [record] = await readDeploymentPrescriptions(paths.ledgerPath);

        delete record.producerPrincipal;
        await fs.writeFile(paths.ledgerPath, `${JSON.stringify(record)}\n`);

        await expect(materializeDeploymentPrescriptions(paths)).rejects.toThrow('producer principal');
        expect(await fs.readFile(paths.envPath, 'utf8')).toBe('KEEP=previous\n');
        expect(await fs.pathExists(paths.statePath)).toBe(false)
    });

    test('fresh runtime context prevents an old raise from becoming a lowering instruction', async () => {
        const paths = pathsFor('runtime-moved');

        await fs.ensureDir(paths.root);
        await fs.writeFile(paths.envPath, 'KEEP=previous\n');
        await fs.ensureDir(path.dirname(paths.projectEnvPath));
        await fs.symlink(paths.envPath, paths.projectEnvPath);
        await appendDeploymentPrescription({
            ledgerPath  : paths.ledgerPath,
            prescription: semanticPrescription(),
            now         : 2_000
        });

        await expect(materializeDeploymentPrescriptions({
            ...paths,
            resolveContext: async () => ({
                'runtime.chroma.liveMemoryLimitBytes': SECOND_VALUE
            })
        })).rejects.toThrow('current runtime revalidation');

        expect(await fs.readFile(paths.envPath, 'utf8')).toBe('KEEP=previous\n');
        expect(await fs.pathExists(paths.statePath)).toBe(false)
    });

    test('an already-applied ceiling remains idempotently deployable', async () => {
        const paths = pathsFor('already-applied');

        await appendDeploymentPrescription({
            ledgerPath  : paths.ledgerPath,
            prescription: semanticPrescription(),
            now         : 2_000
        });

        const result = await materializeDeploymentPrescriptions({
            ...paths,
            resolveContext: async () => ({
                'runtime.chroma.liveMemoryLimitBytes': PRESCRIBED
            })
        });

        expect(result.status).toBe('materialized');
        expect(result.activeCount).toBe(1);
        expect(await fs.readFile(paths.envPath, 'utf8')).toBe(`${ENV_KEY}=${PRESCRIBED}\n`)
    });

    test('the production resolver binds Docker reads to exact project and service labels', async () => {
        const calls   = [],
              context = await resolveDeploymentRuntimeContext(semanticPrescription(), {
                  composeProject: 'plane-a',
                  execFileImpl  : async (command, args) => {
                      calls.push({command, args});

                      return args[0] === 'ps'
                          ? {stdout: 'container-123\n'}
                          : {stdout: `${LIVE_BYTES}\n`}
                  }
              });

        expect(context).toEqual({'runtime.chroma.liveMemoryLimitBytes': LIVE_BYTES});
        expect(calls).toEqual([
            {
                command: 'docker',
                args   : [
                    'ps', '-a',
                    '--filter', 'label=com.docker.compose.project=plane-a',
                    '--filter', 'label=com.docker.compose.service=chroma',
                    '--format', '{{.ID}}'
                ]
            },
            {
                command: 'docker',
                args   : ['inspect', 'container-123', '--format', '{{.HostConfig.Memory}}']
            }
        ])
    })
});

test.describe('operator append through exact delivery receipt', () => {
    test('the real CLI appends, materialization snapshots it, and later ledger movement cannot inflate the receipt', async () => {
        const paths = pathsFor('delivery');

        await fs.ensureDir(path.dirname(paths.projectEnvPath));
        await fs.writeFile(paths.projectEnvPath, `TOKEN=preserved\n${ENV_KEY}=8g\n`);

        const stdout = execFileSync(process.execPath, [
            CLI,
            'append',
            '--ledger', paths.ledgerPath,
            '--id', 'P:first',
            '--knob', KNOB,
            '--target', 'chroma',
            '--values', JSON.stringify({[LEAF]: PRESCRIBED}),
            '--context', JSON.stringify({'runtime.chroma.liveMemoryLimitBytes': LIVE_BYTES}),
            '--observed-at', '1000'
        ], {encoding: 'utf8'});

        expect(JSON.parse(stdout)).toMatchObject({status: 'appended', prescriptionId: 'P:first', sequence: 1});

        await materializeDeploymentPrescriptions({
            ...paths,
            deploymentRunId : RUN_ID,
            adoptExistingEnv: true,
            resolveContext  : liveContext,
            now             : () => 2_000
        });

        expect(await fs.readFile(paths.envPath, 'utf8'))
            .toBe(`TOKEN=preserved\n${ENV_KEY}=${PRESCRIBED}\n`);

        // A newer record arrives while Compose is building. The receipt must describe the env snapshot
        // that actually preceded `up`, not re-fold this now-newer ledger after health succeeds.
        const successor = await appendDeploymentPrescription({
            ledgerPath  : paths.ledgerPath,
            prescription: semanticPrescription({
                prescriptionId          : 'P:second',
                supersedesPrescriptionId: 'P:first',
                values                  : {[LEAF]: SECOND_VALUE},
                validatedAgainst        : {
                    context   : {'runtime.chroma.liveMemoryLimitBytes': LIVE_BYTES},
                    observedAt: 2_000
                }
            }),
            now: 2_500
        });

        expect(successor.appended).toBe(true);

        const receipt = await writeDeploymentPrescriptionReceipt({
            envPath         : paths.envPath,
            statePath       : paths.statePath,
            receiptPath     : paths.receiptPath,
            deploymentRunId : RUN_ID,
            deployedRevision: DEPLOYED_SHA,
            now             : () => 3_000
        });

        expect(receipt.status).toBe('delivered');
        expect(receipt.deploymentRunId).toBe(RUN_ID);
        expect(receipt.deployedRevision).toBe(DEPLOYED_SHA);
        expect(receipt.activePrescriptions).toEqual([{
            prescriptionId: 'P:first',
            sequence      : 1,
            knob          : KNOB,
            targetIdentity: {kind: 'compose-service', id: 'chroma'}
        }]);

        const durableReceipt = await fs.readJson(paths.receiptPath);

        expect(durableReceipt.activePrescriptions).toEqual(receipt.activePrescriptions);

        await fs.appendFile(paths.envPath, 'CHANGED_AFTER_MATERIALIZE=1\n');

        await expect(writeDeploymentPrescriptionReceipt({
            envPath         : paths.envPath,
            statePath       : paths.statePath,
            receiptPath     : path.join(paths.root, 'false-receipt.json'),
            deploymentRunId : RUN_ID,
            deployedRevision: DEPLOYED_SHA
        })).rejects.toThrow('changed after materialization');
        expect(await fs.pathExists(path.join(paths.root, 'false-receipt.json'))).toBe(false)
    });

    test('a different deployment run cannot receipt another run snapshot', async () => {
        const paths = pathsFor('run-binding');

        await materializeDeploymentPrescriptions({
            ...paths,
            deploymentRunId : RUN_ID,
            adoptExistingEnv: true
        });

        await expect(writeDeploymentPrescriptionReceipt({
            envPath         : paths.envPath,
            statePath       : paths.statePath,
            receiptPath     : paths.receiptPath,
            deploymentRunId : '22222222-2222-4222-8222-222222222222',
            deployedRevision: DEPLOYED_SHA
        })).rejects.toThrow('materialization state is malformed');

        expect(await fs.pathExists(paths.receiptPath)).toBe(false)
    });

    test('the host-produced carrier changes the real Compose container limit; empty ledger resolves the default', async () => {
        test.skip(!composeConfigAvailable(), 'docker compose CLI unavailable');

        const active = pathsFor('compose-active'),
              empty  = pathsFor('compose-empty');

        await appendDeploymentPrescription({
            ledgerPath  : active.ledgerPath,
            prescription: semanticPrescription(),
            now         : 2_000
        });
        await materializeDeploymentPrescriptions({...active, adoptExistingEnv: true, resolveContext: liveContext});
        await materializeDeploymentPrescriptions({...empty, adoptExistingEnv: true});

        const baseline = resolvedChromaMemory(null);

        expect(baseline, 'the control must differ from the probe').not.toBe(String(PRESCRIBED));
        expect(resolvedChromaMemory(active.envPath), 'store -> admission -> carrier -> production Compose')
            .toBe(String(PRESCRIBED));
        expect(resolvedChromaMemory(empty.envPath), 'no ledger retains the production default')
            .toBe(baseline)
    })
});
