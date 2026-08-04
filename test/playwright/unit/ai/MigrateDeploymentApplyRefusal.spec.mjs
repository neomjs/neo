import {test, expect}  from '@playwright/test';
import fs              from 'fs-extra';
import path            from 'path';
import {execFile}      from 'node:child_process';
import {promisify}     from 'node:util';
import {fileURLToPath} from 'url';

const execFileAsync = promisify(execFile),
      repoRoot      = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
      DRIVER_REL    = 'ai/scripts/maintenance/migrateDeployment.mjs',
      TARGET_SHA    = '8a5808007ac4647041d2b425ceba76426a707a50';

/**
 * `apply` refusing a dirty plan is a two-part guarantee, and only the second part matters: it must stop,
 * and it must stop BEFORE touching containers. An exit-code assertion proves the first and is blind to
 * the second — the vacuous form @neo-gpt-emmy named when she rejected an earlier positional test here for
 * checking that two things merely *appeared*. So the real driver runs with recording stubs on `PATH` and
 * the assertion is that the pipeline appears in the call log ZERO times.
 *
 * The stubs succeed (`exit 0`) rather than failing, so the script proceeds as far as its own logic allows
 * and we observe every call it chooses to make. A stub that failed would stop the run for the wrong
 * reason and the test would pass while proving nothing.
 * @param {Object} options
 * @param {Boolean} options.dirty Whether the observed env should be missing a required input.
 * @returns {Promise<Object>} `{code, stdout, calls}` — `calls` is the ordered interleaving of all stubs.
 */
async function runApply({dirty}) {
    const workDir = await fs.mkdtemp(path.join(repoRoot, 'test/playwright/test-results/apply-refusal-')),
          binDir  = path.join(workDir, 'bin'),
          callLog = path.join(workDir, 'calls.log');

    await fs.ensureDir(binDir);
    await fs.writeFile(callLog, '');

    // A satisfied cohort needs every census-required key. Rather than enumerate today's list, the clean
    // case reads the live census — so this fixture cannot drift into a false CLEAN when the census grows.
    // A satisfied cohort needs every required input AND every declared secret — omitting the secrets is
    // what kept the clean path red on the first attempt, and it is the reason this reads the census rather
    // than a hand-listed fixture: a hand-list drifts into a false CLEAN as the census grows.
    const parity    = await fs.readJson(path.join(repoRoot, 'ai/scripts/lint/config-leaf-parity.json')),
          {census}  = parity.$composeDefaultParity,
          satisfied = [...census.requiredDeploymentInputs, ...census.secrets],
          declared  = dirty ? satisfied.slice(1) : satisfied;

    // The inspect payload is written to a FILE and `cat`-ed, never interpolated into the stub's shell
    // source. Interpolating it put the JSON array outside bash's single quotes, so bash stripped the inner
    // quotes and the stub emitted `{"Env":[A=1,B=2]}` — unparseable. The driver then observed nothing and
    // the plan refused with `no-observed-service`, so the refusal test PASSED for the wrong reason: a dirty
    // plan refuses on any blocker, and "nothing was measured" is a blocker. A test that cannot tell why it
    // is green is not a witness.
    const inspectJson = path.join(workDir, 'inspect.json');

    await fs.writeJson(inspectJson, {
        Env   : declared.map(key => `${key}=fixture-value`),
        Labels: {
            'com.docker.compose.project'             : 'probe-project',
            'com.docker.compose.project.config_files': '/x/base.yml,/x/overlay.yml'
        }
    });

    const dockerStub = `#!/bin/bash
printf 'docker %s\\n' "$*" >> "${callLog}"
case "$1" in
  ps)
    if [[ "$*" == *'.Names'* ]]; then
      echo "probe-\${RANDOM}-1"
    elif [[ "$*" == *'com.docker.compose.service'* ]]; then
      # The config cohort is DISCOVERED from these labels, so the stub must answer as a real plane does:
      # the Neo services plus a compose-owned proxy that carries the ingress-owned hostname.
      printf '%s\\n' mc-server orchestrator kb-server ingress
    else
      echo "probe-project"
    fi ;;
  inspect)
    cat "${inspectJson}" ;;
  exec)
    echo "${TARGET_SHA}" ;;
esac
exit 0
`;

    await fs.writeFile(path.join(binDir, 'docker'), dockerStub);
    await fs.writeFile(path.join(binDir, 'git'), `#!/bin/bash
printf 'git %s\\n' "$*" >> "${callLog}"
echo -e "${TARGET_SHA}\\trefs/heads/dev"
exit 0
`);
    // The pipeline is a bash script the driver invokes via `run('bash', …)`, which resolves through PATH,
    // so `bash` is the stub that records whether the transaction was reached at all.
    //
    // Every stub's shebang is ABSOLUTE `#!/bin/bash`, never `#!/usr/bin/env bash`. `env` resolves through
    // PATH, so with a `bash` stub on PATH each stub's own interpreter became this stub: it logged its own
    // invocation and exited without ever running the stub body, the driver got empty output from `docker`,
    // and all three tests timed out at 30s. The stub set has to not intercept itself.
    // The stub also records NEO_DEPLOY_COMPOSE_FILE, because the repair fragment reaches the transaction
    // through that env var rather than through argv. Without it, "the fragment was generated" is the most a
    // test could assert; with it, the test can read what the transaction would actually merge.
    await fs.writeFile(path.join(binDir, 'bash'), `#!/bin/bash
printf 'bash %s\\n' "$*" >> "${callLog}"
printf 'compose-files %s\\n' "$NEO_DEPLOY_COMPOSE_FILE" >> "${callLog}"
exit 0
`);

    for (const name of ['docker', 'git', 'bash']) {
        await fs.chmod(path.join(binDir, name), 0o755)
    }

    let code = 0, stdout = '';

    try {
        const result = await execFileAsync(process.execPath, [path.join(repoRoot, DRIVER_REL), 'apply', '--project', 'probe-project'], {
            env: {...process.env, PATH: `${binDir}:${process.env.PATH}`}
        });

        stdout = result.stdout
    } catch (error) {
        code   = error.code ?? 1;
        stdout = `${error.stdout || ''}${error.stderr || ''}`
    }

    return {code, stdout, calls: (await fs.readFile(callLog, 'utf8')).split('\n').filter(Boolean)}
}

test.describe('migrateDeployment apply refuses a dirty plan BEFORE touching containers', () => {
    test('a dirty plan refuses, and the pipeline is invoked ZERO times', async () => {
        const {code, stdout, calls} = await runApply({dirty: true});

        expect(code, stdout.slice(-1200)).not.toBe(0);
        expect(stdout).toContain('apply refused');

        // It must refuse for the RIGHT reason. Without this, "nothing was observed" satisfies the test and
        // the guarantee under assertion is never exercised — which is exactly how this test first went
        // green while the stub was emitting unparseable JSON.
        expect(stdout, stdout.slice(-1500)).toContain('missing-required-input');
        expect(stdout).not.toContain('no-observed-service');

        // The guarantee. Not "exited non-zero" — "never reached the transaction".
        const pipelineCalls = calls.filter(line => line.includes('deploy-pipeline.sh'));

        expect(pipelineCalls, `pipeline must not be invoked; calls:\n${calls.join('\n')}`).toEqual([]);

        // And no mutating Docker verb either, since the driver's own reads are all non-mutating.
        expect(calls.filter(line => /docker (compose (up|down)|rm|stop|start|restart)\b/.test(line))).toEqual([])
    });

    test('the refusal names the failing condition rather than exiting silently', async () => {
        const {stdout} = await runApply({dirty: true});

        // An operator reading only stdout must learn WHICH condition refused, or the tool is a black box
        // that says no. The blocker count plus the per-blocker reason lines carry that.
        expect(stdout).toMatch(/blocker\(s\)/);
        expect(stdout).toContain('missing-required-input');
        expect(stdout).toContain('Docker was NOT invoked')
    });

    test('the stubs CAN observe a pipeline invocation — the positive control for the assertion above', async () => {
        // Without this, "zero pipeline calls" is unfalsifiable: a stub set that could never record the
        // pipeline would pass the refusal test no matter what the driver did. A satisfied cohort takes the
        // apply path, so this asserts the same call log CAN be non-empty.
        const {calls, stdout} = await runApply({dirty: false});

        expect(calls.some(line => line.includes('deploy-pipeline.sh')), `calls:\n${calls.join('\n')}\n---\n${stdout.slice(-1200)}`).toBe(true);
        expect(calls.filter(line => line.includes('deploy-pipeline.sh'))).toHaveLength(1)
    });

    test('the established ingress hostname is PRESERVED into the transaction, not reset to the fallback', async () => {
        // The defect this closes: Compose supplies NEO_DEPLOY_HOSTNAME by interpolation
        // (`${NEO_DEPLOY_HOSTNAME:-localhost}`), so a repair run whose environment lacks it re-renders the
        // FALLBACK and silently resets a plane that had a real hostname. It is invisible on any plane whose
        // hostname already equals the fallback — ours does, which is why this needs an assertion and not an
        // inspection. Read from the fragment the transaction would actually merge, not from a log line.
        const {calls}  = await runApply({dirty: false}),
              recorded = calls.find(line => line.startsWith('compose-files '));

        expect(recorded, `no compose-file env recorded; calls:\n${calls.join('\n')}`).toBeTruthy();

        const fragmentPath = recorded.replace('compose-files ', '').trim().split(':').at(-1);

        expect(fragmentPath).toMatch(/repair\.compose\.json$/);

        const fragment = await fs.readJson(fragmentPath);

        expect(fragment.services.ingress.environment.NEO_DEPLOY_HOSTNAME).toBe('fixture-value')
    })
});
