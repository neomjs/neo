import {test, expect}  from '@playwright/test';
import fs              from 'fs-extra';
import path            from 'path';
import {execFile}      from 'node:child_process';
import {randomUUID}    from 'node:crypto';
import {promisify}     from 'node:util';
import {fileURLToPath} from 'url';

const execFileAsync = promisify(execFile),
      repoRoot      = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
      PIPELINE      = path.join(repoRoot, 'ai/examples/cloud-deployment/deploy-pipeline.sh');

/**
 * Regressions for the ordered Compose-file set in `deploy-pipeline.sh`.
 *
 * ## Why a faked `docker` rather than a mocked shell function
 *
 * The behaviour under test is the **argv the script hands to Docker**, and only a real `bash` run
 * produces it — array expansion under `set -u`, word-splitting and quoting are exactly where this
 * class of change breaks. So `docker` and `node` are replaced by recording stubs on `PATH` and the
 * real script runs unmodified.
 *
 * `NEO_REPO_URL` points at this checkout so revision resolution stays local: the script resolves a
 * selector against a remote before Docker runs, and a spec that reached the network would be both
 * slow and offline-fragile.
 *
 * ## Why the zero-entry case asserts on the ABSENCE of a Docker call
 *
 * A non-zero exit proves the script stopped; it does not prove it stopped *before touching
 * containers*. Those are different guarantees, and only the second one matters here — so that test
 * asserts the recorded Docker invocation count is zero rather than merely checking the status.
 */

/**
 * Runs the pipeline with recording stubs for `docker`, `node`, and optionally `git`.
 * @param {Object}  config
 * @param {String}  [config.composeFileValue] Value for `NEO_DEPLOY_COMPOSE_FILE`.
 * @param {Boolean} [config.omitComposeFile]  Leave the variable UNSET rather than setting it.
 * @param {Boolean} [config.failIfGitCalled]  Install a recording `git` stub that fails if the pipeline
 * reaches revision resolution. Used only for missing-composition cases, which must stop first.
 * @param {Boolean} [config.failMaterialize]  Fail the prescription materializer before Docker.
 * @param {Boolean} [config.failDockerUp]     Fail the health-gated `docker compose up` call.
 * @param {Boolean} [config.holdDeployLock]   Present an existing atomic deploy claim.
 * @param {String}  [config.deploymentRunId]  UUID returned by the recording Node runtime.
 * @param {String}  [config.revision]         Selector for `NEO_REF`; defaults to this checkout's `HEAD`.
 * @returns {Promise<Object>} Ordered call evidence and derived prescription paths.
 */
async function runPipeline({
    composeFileValue,
    omitComposeFile,
    failIfGitCalled,
    failMaterialize,
    failDockerUp,
    holdDeployLock,
    deploymentRunId,
    revision
}) {
    const workDir          = await fs.mkdtemp(path.join(repoRoot, 'test/playwright/test-results/compose-list-')),
          binDir           = path.join(workDir, 'bin'),
          logPath          = path.join(workDir, 'calls.log'),
          prescriptionRoot = path.join(workDir, 'deployment-prescriptions'),
          runId            = deploymentRunId || randomUUID();

    await fs.ensureDir(binDir);
    await fs.writeFile(logPath, '');

    if (holdDeployLock) {
        await fs.ensureDir(path.join(prescriptionRoot, 'deploy.lock'))
    }

    // Recording stubs. Their opt-in failures prove that a failed phase cannot leak into a later one.
    const dockerStubPath = path.join(binDir, 'docker'),
          nodeStubPath   = path.join(binDir, 'node');

    await fs.writeFile(
        dockerStubPath,
        '#!/usr/bin/env bash\n' +
        'printf \'docker %s\\n\' "$*" >> "$CALL_LOG"\n' +
        'if [ "${FAIL_DOCKER_UP:-0}" = "1" ] && [[ " $* " == *" up "* ]]; then exit 92; fi\n' +
        'exit 0\n'
    );
    await fs.chmod(dockerStubPath, 0o755);

    await fs.writeFile(
        nodeStubPath,
        '#!/usr/bin/env bash\n' +
        'printf \'node %s\\n\' "$*" >> "$CALL_LOG"\n' +
        'if [[ "$*" == *"randomUUID"* ]]; then printf \'%s\' "$STUB_DEPLOYMENT_RUN_ID"; exit 0; fi\n' +
        'if [ "${FAIL_MATERIALIZE:-0}" = "1" ] && [[ " $* " == *"materializeDeploymentPrescriptions.mjs materialize "* ]]; then exit 91; fi\n' +
        'exit 0\n'
    );
    await fs.chmod(nodeStubPath, 0o755);

    if (failIfGitCalled) {
        const gitStubPath = path.join(binDir, 'git');

        await fs.writeFile(gitStubPath, '#!/usr/bin/env bash\nprintf \'git %s\\n\' "$*" >> "$CALL_LOG"\nexit 97\n');
        await fs.chmod(gitStubPath, 0o755)
    }

    const selector = revision || (await execFileAsync('git', ['rev-parse', 'HEAD'], {cwd: repoRoot})).stdout.trim();

    let code   = 0,
        stdout = '';

    // Built by DELETION rather than by assigning `undefined`: Node coerces an `undefined` env value to
    // the string "undefined", which the script would read as a supplied path. Only an absent key
    // reaches bash as genuinely unset, which is the distinction under test.
    const childEnv = {
        ...process.env,
        PATH                                 : `${binDir}:${process.env.PATH}`,
        CALL_LOG                             : logPath,
        FAIL_DOCKER_UP                       : failDockerUp ? '1' : '0',
        FAIL_MATERIALIZE                     : failMaterialize ? '1' : '0',
        STUB_DEPLOYMENT_RUN_ID               : runId,
        NEO_REPO_URL                         : repoRoot,
        NEO_REF                              : selector,
        NEO_DEPLOY_PROJECT_NAME              : 'compose-list-spec',
        NEO_DEPLOY_COMPOSE_FILE              : composeFileValue ?? '',
        NEO_HOST_DEPLOYMENT_PRESCRIPTION_ROOT: prescriptionRoot
    };

    if (omitComposeFile) {
        delete childEnv.NEO_DEPLOY_COMPOSE_FILE
    }

    try {
        const result = await execFileAsync('bash', [PIPELINE], {cwd: repoRoot, env: childEnv});

        stdout = result.stdout
    } catch (error) {
        code   = error.code ?? 1;
        stdout = (error.stdout || '') + (error.stderr || '')
    }

    const calls                = (await fs.readFile(logPath, 'utf8')).split('\n').filter(Boolean),
          dockerCalls          = calls.filter(line => line.startsWith('docker ')),
          gitCalls             = calls.filter(line => line.startsWith('git ')),
          firstUp              = dockerCalls.find(line => line.includes(' up ')) || '',
          preflightCallIndex   = calls.findIndex(line => line.startsWith('node ') && line.includes('redeployPreflight')),
          materializeCallIndex = calls.findIndex(line => line.startsWith('node ') && line.includes('materializeDeploymentPrescriptions.mjs materialize ')),
          firstDockerIndex     = calls.findIndex(line => line.startsWith('docker ')),
          receiptCallIndex     = calls.findIndex(line => line.startsWith('node ') && line.includes('materializeDeploymentPrescriptions.mjs receipt ')),
          deployLockExists     = await fs.pathExists(path.join(prescriptionRoot, 'deploy.lock'));

    await fs.remove(workDir);

    // `calls` is the ORDERED interleaving of both stubs. Order assertions must read it rather than the
    // filtered per-tool lists, which discard exactly the relative position under test.
    return {
        code,
        stdout,
        calls,
        dockerCalls,
        gitCalls,
        composeArgs    : firstUp,
        prescriptionRoot,
        deploymentRunId: runId,
        preflightCallIndex,
        materializeCallIndex,
        firstDockerIndex,
        receiptCallIndex,
        deployLockExists
    }
}

/**
 * Extracts the ordered `-f` operands from a recorded `docker compose …` line.
 * @param {String} line
 * @returns {String[]} File paths in the order Docker received them.
 */
function orderedComposeFiles(line) {
    const tokens = line.split(/\s+/),
          files  = [];

    tokens.forEach((token, index) => {
        if (token === '-f' && tokens[index + 1]) {
            files.push(tokens[index + 1])
        }
    });

    return files
}

test.describe('deploy-pipeline.sh — ordered Compose-file set', () => {
    test('a two-file value expands to repeated -f in DECLARATION ORDER', async () => {
        // Order is the assertion, not presence. Compose merge order decides which value wins, so a
        // set-like implementation that happened to include both paths would still be wrong.
        const base    = '/tmp/spec-base.yml',
              overlay = '/tmp/spec-overlay.yml',
              result  = await runPipeline({composeFileValue: `${base}:${overlay}`});

        expect(result.code).toBe(0);
        expect(orderedComposeFiles(result.composeArgs)).toEqual([base, overlay]);

        const reversed = await runPipeline({composeFileValue: `${overlay}:${base}`});

        expect(orderedComposeFiles(reversed.composeArgs)).toEqual([overlay, base])
    });

    test('a single path stays byte-compatible with one -f', async () => {
        const only   = '/tmp/spec-only.yml',
              result = await runPipeline({composeFileValue: only});

        expect(result.code).toBe(0);
        expect(orderedComposeFiles(result.composeArgs)).toEqual([only])
    });

    test('empty entries between delimiters are ignored rather than becoming empty -f operands', async () => {
        // An empty operand would make Docker read a directory-relative default, which is a silently
        // different file rather than an error.
        const base    = '/tmp/spec-base.yml',
              overlay = '/tmp/spec-overlay.yml',
              result  = await runPipeline({composeFileValue: `${base}::${overlay}:`});

        expect(result.code).toBe(0);
        expect(orderedComposeFiles(result.composeArgs)).toEqual([base, overlay])
    });

    test('unset, empty, and delimiter-only values abort BEFORE external transaction work', async () => {
        // A non-zero exit alone would not prove the boundary. The failing git stub is the mutation
        // witness for revision lookup: reaching it would leave a recorded call and change the exit code.
        const missingCompositionCases = [
            {omitComposeFile: true},
            {composeFileValue: ''},
            {composeFileValue: ':::'}
        ];

        for (const missingComposition of missingCompositionCases) {
            const result = await runPipeline({
                ...missingComposition,
                failIfGitCalled: true,
                revision       : '0'.repeat(40)
            });

            expect(result.code).not.toBe(0);
            expect(result.gitCalls).toEqual([]);
            expect(result.preflightCallIndex).toBe(-1);
            expect(result.dockerCalls).toEqual([]);
            expect(result.stdout).toContain('NEO_DEPLOY_COMPOSE_FILE');
            expect(result.stdout).toContain('auth-complete')
        }
    });

    test('the operator-facing count reports FILES, not argv elements', async () => {
        // It reported double during rehearsal: `${#arr[@]}` counts argv elements and each file
        // contributes both a `-f` and a path, so two files printed "(4 file(s))".
        const twoFiles = await runPipeline({composeFileValue: '/tmp/a.yml:/tmp/b.yml'}),
              oneFile  = await runPipeline({composeFileValue: '/tmp/a.yml'});

        expect(twoFiles.stdout).toContain('(2 file(s)');
        expect(oneFile.stdout).toContain('(1 file(s)')
    });

    test('preflight, prescription materialization, Docker health gate, and receipt run in delivery order', async () => {
        // The earlier version of this test only checked that both the preflight message and some Docker
        // call appeared, which is true for ANY ordering and so proved nothing about the guarantee it
        // claimed. The property is positional: the survivability gate must precede every container
        // call, so compare indices in the ordered interleaving of both stubs.
        const result = await runPipeline({composeFileValue: '/tmp/a.yml:/tmp/b.yml'});

        expect(result.preflightCallIndex).toBeGreaterThan(-1);
        expect(result.materializeCallIndex).toBeGreaterThan(-1);
        expect(result.firstDockerIndex).toBeGreaterThan(-1);
        expect(result.receiptCallIndex).toBeGreaterThan(-1);
        expect(result.preflightCallIndex).toBeLessThan(result.materializeCallIndex);
        expect(result.materializeCallIndex).toBeLessThan(result.firstDockerIndex);
        expect(result.firstDockerIndex).toBeLessThan(result.receiptCallIndex);
        expect(result.deployLockExists).toBe(false);

        const materializeCall = result.calls[result.materializeCallIndex],
              receiptCall     = result.calls[result.receiptCallIndex],
              runRoot         = path.join(
                  result.prescriptionRoot,
                  'runs',
                  result.deploymentRunId
              ),
              uuidCalls       = result.calls.filter(line => line.startsWith('node ') && line.includes('randomUUID'));

        expect(materializeCall).toContain(`--ledger ${result.prescriptionRoot}/prescriptions.jsonl`);
        expect(materializeCall).toContain(`--env ${result.prescriptionRoot}/active.env`);
        expect(materializeCall).toContain(`--state ${runRoot}/materialized-state.json`);
        expect(materializeCall).toContain('--project-env /tmp/.env');
        expect(materializeCall).toContain('--compose-project compose-list-spec');
        expect(materializeCall).toContain(`--run-id ${result.deploymentRunId}`);
        expect(materializeCall).toContain('--adopt-existing-env');
        expect(receiptCall).toContain(`--state ${runRoot}/materialized-state.json`);
        expect(receiptCall).toContain(`--receipt ${runRoot}/delivery-receipt.json`);
        expect(receiptCall).toContain(`--run-id ${result.deploymentRunId}`);
        expect(materializeCall).not.toContain('--receipt');
        expect(uuidCalls).toHaveLength(1);
        expect(result.calls.indexOf(uuidCalls[0])).toBeGreaterThan(result.preflightCallIndex);
        expect(result.calls.indexOf(uuidCalls[0])).toBeLessThan(result.materializeCallIndex);

        // The script runs from `repoRoot`, while the first composition lives in `/tmp`. An explicit
        // env-file operand is therefore the production contract that makes the materialized carrier
        // authoritative rather than depending on Compose's cwd/project-directory discovery.
        for (const dockerCall of result.dockerCalls) {
            expect(dockerCall).toContain(`compose --env-file ${result.prescriptionRoot}/active.env`)
        }
    });

    test('an existing deploy claim refuses a concurrent materialization transaction', async () => {
        const result = await runPipeline({
            composeFileValue: '/tmp/a.yml:/tmp/b.yml',
            holdDeployLock  : true
        });

        expect(result.code).not.toBe(0);
        expect(result.preflightCallIndex).toBeGreaterThan(-1);
        expect(result.materializeCallIndex).toBe(-1);
        expect(result.dockerCalls).toEqual([]);
        expect(result.receiptCallIndex).toBe(-1);
        expect(result.deployLockExists).toBe(true);
        expect(result.stdout).toContain('deployment lock exists');
        expect(result.stdout).toContain('No prescription was materialized')
    });

    test('a materialization refusal stops before every Docker lifecycle call', async () => {
        const result = await runPipeline({
            composeFileValue: '/tmp/a.yml:/tmp/b.yml',
            failMaterialize : true
        });

        expect(result.code).not.toBe(0);
        expect(result.preflightCallIndex).toBeGreaterThan(-1);
        expect(result.materializeCallIndex).toBeGreaterThan(result.preflightCallIndex);
        expect(result.dockerCalls).toEqual([]);
        expect(result.receiptCallIndex).toBe(-1);
        expect(result.deployLockExists).toBe(false)
    });

    test('a failed Docker health gate cannot emit a delivery receipt', async () => {
        const result = await runPipeline({
            composeFileValue: '/tmp/a.yml:/tmp/b.yml',
            failDockerUp    : true
        });

        expect(result.code).not.toBe(0);
        expect(result.materializeCallIndex).toBeGreaterThan(result.preflightCallIndex);
        expect(result.firstDockerIndex).toBeGreaterThan(result.materializeCallIndex);
        expect(result.receiptCallIndex).toBe(-1);
        expect(result.deployLockExists).toBe(false);
        expect(result.dockerCalls).toHaveLength(1);
        expect(result.dockerCalls[0]).toContain(' up ')
    });

    test('the health gate and project pinning are unchanged, and `down` is never issued', async () => {
        const result = await runPipeline({composeFileValue: '/tmp/a.yml:/tmp/b.yml'});

        expect(result.composeArgs).toContain('up -d --build --wait');
        expect(result.composeArgs).toContain('-p compose-list-spec');
        expect(result.composeArgs).toContain(`--env-file ${result.prescriptionRoot}/active.env`);
        expect(result.dockerCalls.some(line => line.includes(' down '))).toBe(false)
    });

});
