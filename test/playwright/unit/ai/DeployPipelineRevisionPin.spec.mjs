import {test, expect}            from '@playwright/test';
import {execFileSync, spawnSync} from 'node:child_process';
import fs                        from 'node:fs/promises';
import os                        from 'node:os';
import path                      from 'node:path';
import process                   from 'node:process';
import {load as yamlLoad}        from 'js-yaml';

/**
 * Guards the revision-pinning contract of `ai/examples/cloud-deployment/deploy-pipeline.sh`.
 *
 * WHY this is a unit spec and not an integration one: every assertion here is about what the script
 * decides BEFORE Docker runs. Faking `git` and `docker` on `PATH` keeps the whole contract testable
 * with no Docker daemon and no network — which matters because no agent sandbox has a reachable
 * daemon, and CI's integration lane builds `ai/deploy/docker-compose.test.yml`, a different stack
 * that never exercises this script.
 *
 * The load-bearing assertion is NEGATIVE: on any unresolvable selector the script must exit non-zero
 * having never invoked Docker. A pipeline that resolves ambiguously and then builds anyway is worse
 * than one that fails, because it produces an image whose provenance labels assert a revision nobody
 * chose. `fakeDocker` therefore appends to a log file, and the failure cases assert that log is empty.
 *
 * The positive case guards the other half of the contract: one canonical `NEO_REVISION` reaches
 * Compose after resolution, and Compose maps it to both internal Docker arguments. Letting the
 * selector survive as `NEO_REF` would recreate the two-input mismatch state this contract removes.
 */

const
    repoRoot       = path.resolve(process.cwd()),
    composePath    = path.join(repoRoot, 'ai/deploy/docker-compose.yml'),
    dockerfilePath = path.join(repoRoot, 'ai/deploy/Dockerfile'),
    scriptPath     = path.join(repoRoot, 'ai/examples/cloud-deployment/deploy-pipeline.sh'),
    FULL_SHA       = '6be5afc1c30000000000000000000000000000aa';

/**
 * Builds a throwaway bin dir whose `git` and `docker` shadow the real ones on `PATH`.
 *
 * `fake-git ls-remote` deliberately MODELS REAL PATTERN SEMANTICS rather than echoing a fixture:
 * an exact pattern (`v9.9.9`) advertises only the tag object, and the peeled commit
 * (`refs/tags/v9.9.9^{}`) appears ONLY when the caller also passes the `^{}` pattern. Verified
 * against a disposable annotated-tag repository. A fixture that hands back both lines regardless
 * cannot fail when the script stops asking for the peel — which is precisely the defect that
 * slipped through cycle 1: the earlier stub proved the code against input git never produces.
 *
 * `fake-docker` records every invocation plus the environment, so "Docker was never called" and
 * "only the canonical pin reached Compose" are assertable facts rather than inferences.
 *
 * @param {String} peelLine  Peel line to advertise, or '' for none (branch / lightweight tag).
 * @param {String} plainLines Non-peel lines always advertised (tag object, branches, or '').
 * @returns {Promise<Object>} `{bin, dockerLog}` paths.
 */
async function createFakeBin(plainLines, peelLine = '') {
    const
        bin         = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-deploy-pin-')),
        composeFile = path.join(bin, 'docker-compose.yml'),
        dockerLog   = path.join(bin, 'docker-invocations.log');

    // The deployment pipeline now owns a durable project `.env` carrier. Keeping composition in
    // the fixture root makes that carrier per-test instead of adopting the operator's real
    // `ai/deploy/.env` or contending on one host-global deploy lock across parallel workers.
    await fs.writeFile(composeFile, 'services: {}\n');

    await fs.writeFile(path.join(bin, 'git'), [
        '#!/usr/bin/env bash',
        // Only ls-remote is contract-relevant; `describe` keeps the host-checkout log line working.
        'if [ "$1" = "ls-remote" ]; then',
        '    printf \'%s\' "$FAKE_LS_PLAIN"',
        // The peel is advertised ONLY if some argument carries the ^{} pattern — real git behaviour.
        '    for a in "$@"; do case "$a" in *"^{}") [ -n "$FAKE_LS_PEEL" ] && printf \'\\n%s\' "$FAKE_LS_PEEL";; esac; done',
        '    exit 0',
        'fi',
        'if [ "$1" = "-C" ] && [ "$3" = "describe" ]; then echo "fake-describe"; exit 0; fi',
        // The 40-hex PROBE. Previously the fast path never called git at all, so this stub was
        // bypassed and the spec could not falsify anything about it — which is exactly how a
        // tag-object id and a nonexistent id both reached Docker through the branch that calls
        // itself the reproducible full-commit path. Modelled on real semantics:
        //   fetch  fails when the id is absent    -> FAKE_FETCH_FAILS
        //   ^{commit} yields '' for a non-commit  -> FAKE_PEEL_TO empty
        //   ^{commit} peels a tag object          -> FAKE_PEEL_TO = the commit
        'if [ "$1" = "-C" ] && [ "$3" = "init" ]; then exit 0; fi',
        'if [ "$1" = "-C" ] && [ "$3" = "fetch" ]; then [ -n "$FAKE_FETCH_FAILS" ] && exit 128; exit 0; fi',
        'if [ "$1" = "-C" ] && [ "$3" = "rev-parse" ]; then',
        // Require the load-bearing peel expression: returning FAKE_PEEL_TO for plain FETCH_HEAD
        // would let the annotated-tag test stay green while production reintroduced the tag-object bug.
        '    [ "${@: -1}" != "FETCH_HEAD^{commit}" ] && exit 1',
        '    [ -z "$FAKE_PEEL_TO" ] && exit 1',
        '    printf \'%s\\n\' "$FAKE_PEEL_TO"; exit 0',
        'fi',
        'exit 0'
    ].join('\n'), {mode: 0o755});

    // Record the ENVIRONMENT, not only argv. The selector enters as NEO_REF, while the canonical
    // pin exits as NEO_REVISION. A docker stub logging `$*` alone cannot prove that the selector
    // was removed before Compose.
    await fs.writeFile(path.join(bin, 'docker'), [
        '#!/usr/bin/env bash',
        `echo "invoked: $* | NEO_REF=${'$'}{NEO_REF-<unset>} NEO_REVISION=${'$'}{NEO_REVISION-<unset>}" >> ${JSON.stringify(dockerLog)}`,
        'exit 0'
    ].join('\n'), {mode: 0o755});

    await fs.writeFile(dockerLog, '');

    return {bin, composeFile, dockerLog, plainLines, peelLine}
}

/**
 * Runs the pipeline with the 40-hex probe stubbed. Separate from `runPipeline` because the probe
 * env is meaningless on the ls-remote path and passing it there would blur which branch is under test.
 * @param {Object} fake The `createFakeBin` result.
 * @param {String} selector 40-char id under test.
 * @param {Object} probe `{fetchFails, peelTo}` — the remote's answers.
 * @returns {Object} `{code, output}`.
 */
/**
 * Environment that lets a revision-pinning fixture past the survivability preflight.
 *
 * The script now refuses to touch containers without a verified pre-transition bundle. A test
 * fixture has none — it is a GENUINE first deployment — so the honest way through is the same
 * explicit declaration a real first install uses, not a skip flag. `NEO_BACKUP_PATH` is redirected
 * into the fake-bin temp dir so the marker the gate writes never touches real deployment state.
 *
 * Passing `declareInitialization: false` runs the pipeline with the gate fully armed, which is how
 * the refusal itself is asserted below. This spec's subject is revision resolution, so it must not
 * become a bundle-construction harness — but it also must not silently disarm a safety gate, and an
 * env var that turned the preflight off would be exactly the bypass the gate refuses to have.
 *
 * @param {Object} fake The `createFakeBin` result.
 * @param {Boolean} declareInitialization
 * @param {String} projectName Explicit deployment project identity; empty exercises the fail-closed path.
 * @returns {Object}
 */
function preflightEnv(fake, declareInitialization, projectName) {
    return {
        // INSIDE the per-test temp dir, never `fake.bin/..` — that resolved to `os.tmpdir()` itself, so
        // every test AND every run on the machine shared one backup root. The gate's own contract is
        // that `--initialize` works once per host, so a shared root made the first initializing test
        // write a marker that made all the later ones refuse. Diagnosed by @neo-gpt.
        //
        // It also made the suite non-idempotent in a way a single local run cannot show: the first run
        // passed because the marker did not exist yet, and created the state that failed the second.
        NEO_BACKUP_PATH        : path.join(fake.bin, 'preflight-backups'),
        // Revision tests need a valid explicit composition so the mandatory caller-owned boundary does
        // not stop them before their actual subject. The fake Docker never starts this base file.
        NEO_DEPLOY_COMPOSE_FILE              : fake.composeFile,
        NEO_DEPLOY_INITIALIZE                : declareInitialization ? '1' : '0',
        NEO_DEPLOY_PROJECT_NAME              : projectName,
        NEO_HOST_DEPLOYMENT_PRESCRIPTION_ROOT: path.join(fake.bin, 'deployment-prescriptions')
    }
}

function runPipelineWithProbe(fake, selector, {
    declareInitialization = true,
    fetchFails            = false,
    peelTo                = '',
    projectName           = declareInitialization ? 'neo-test-project' : ''
} = {}) {
    // `spawnSync` rather than `execFileSync`, and NO shell. Both streams are needed on the SUCCESS
    // path too — the peel note is a stderr WARNING, and `execFileSync` discards stderr when the
    // command succeeds, so an assertion about it could never pass even when the script emits it
    // correctly (the same wrong-channel mistake as observing argv when the payload travels as env).
    // The obvious fix, `bash -c '"$0" 2>&1'`, builds a shell command out of `scriptPath` — which is
    // derived from `process.cwd()` — and CodeQL correctly flagged that as a shell command built from
    // an uncontrolled absolute path. `spawnSync` returns `{status, stdout, stderr}` on both paths, so
    // it removes the shell AND the try/catch instead of sanitising an interpolation.
    const result = spawnSync('bash', [scriptPath], {
        cwd     : repoRoot,
        encoding: 'utf8',
        env     : {
            ...process.env,
            FAKE_FETCH_FAILS: fetchFails ? '1' : '',
            FAKE_LS_PEEL    : '',
            FAKE_LS_PLAIN   : '',
            FAKE_PEEL_TO    : peelTo,
            NEO_REF         : selector,
            PATH            : `${fake.bin}:${process.env.PATH}`,
            ...preflightEnv(fake, declareInitialization, projectName)
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    if (result.error) {
        throw result.error
    }

    return {code: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}`}
}

/**
 * Runs the pipeline script with a faked `PATH`, never throwing on non-zero exit so the spec can
 * assert on the code and the streams together.
 * @param {Object} fake The `createFakeBin` result.
 * @param {String} selector Value for `NEO_REF`.
 * @returns {Object} `{code, output}`.
 */
function runPipeline(fake, selector, {
    declareInitialization = true,
    projectName           = declareInitialization ? 'neo-test-project' : ''
} = {}) {
    try {
        const output = execFileSync('bash', [scriptPath], {
            cwd     : repoRoot,
            encoding: 'utf8',
            env     : {
                ...process.env,
                FAKE_LS_PEEL : fake.peelLine,
                FAKE_LS_PLAIN: fake.plainLines,
                NEO_REF      : selector,
                PATH         : `${fake.bin}:${process.env.PATH}`,
                ...preflightEnv(fake, declareInitialization, projectName)
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        return {code: 0, output}
    } catch (error) {
        return {code: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}`}
    }
}

/**
 * @param {String} dockerLog
 * @returns {Promise<Number>} Count of recorded Docker invocations.
 */
async function dockerInvocations(dockerLog) {
    const contents = await fs.readFile(dockerLog, 'utf8');

    return contents.split('\n').filter(Boolean).length
}

/**
 * @summary Executes the Dockerfile's actual revision-integrity RUN body against a temporary receipt.
 * @param {String} assertedRevision Value exposed to the RUN instruction as `NEO_REVISION`.
 * @param {String} actualRevision Value stored in the stand-in `.neo-revision` receipt.
 * @returns {Promise<Object>} Spawn result with numeric status and captured streams.
 */
async function runRevisionIntegrityGate(assertedRevision, actualRevision) {
    const
        dockerfile = await fs.readFile(dockerfilePath, 'utf8'),
        start      = dockerfile.indexOf('RUN actual_revision='),
        end        = dockerfile.indexOf('\nLABEL org.neomjs.image.requested-ref', start);

    expect(start, 'Dockerfile revision-integrity RUN instruction is missing').toBeGreaterThan(-1);
    expect(end, 'Dockerfile revision-integrity RUN instruction has no label boundary').toBeGreaterThan(start);

    const
        tempDir      = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-revision-integrity-')),
        revisionFile = path.join(tempDir, '.neo-revision'),
        command      = dockerfile.slice(start + 4, end)
            .replace(/\\\n\s*/g, ' ')
            .replace('/app/.neo-revision', JSON.stringify(revisionFile));

    await fs.writeFile(revisionFile, actualRevision);

    const result = spawnSync('sh', ['-c', command], {
        encoding: 'utf8',
        env     : {...process.env, NEO_REVISION: assertedRevision},
        stdio   : ['ignore', 'pipe', 'pipe']
    });

    await fs.rm(tempDir, {force: true, recursive: true});

    return result
}

test.describe('deploy revision boundary (#16087)', () => {
    test('one operator pin maps to both Docker arguments for the full service cohort', async () => {
        const
            compose  = yamlLoad(await fs.readFile(composePath, 'utf8')),
            services = Object.entries(compose.services || {})
                .filter(([, service]) => service?.build?.args?.TARGET_SERVER ||
                    service?.build?.args?.SERVICE_ENTRYPOINT);

        expect(services.map(([name]) => name).sort()).toEqual(['fleet-server', 'kb-server', 'mc-server', 'orchestrator']);

        for (const [name, service] of services) {
            expect(
                service.build.args.NEO_REF,
                `${name} does not derive source acquisition from the one resolved operator pin`
            ).toBe('${NEO_REVISION:-dev}');
            expect(
                service.build.args.NEO_REVISION,
                `${name} does not derive the OCI assertion from the same operator pin`
            ).toBe('${NEO_REVISION:-}')
        }
    });

    test('the Docker integrity gate accepts an unset assertion', async () => {
        const result = await runRevisionIntegrityGate('', FULL_SHA);

        expect(result.status).toBe(0);
        expect(result.stderr).toBe('')
    });

    test('the Docker integrity gate accepts an assertion matching measured artifact truth', async () => {
        const result = await runRevisionIntegrityGate(FULL_SHA, FULL_SHA);

        expect(result.status).toBe(0);
        expect(result.stderr).toBe('')
    });

    test('the Docker integrity gate rejects a mismatched assertion with a clear error', async () => {
        const result = await runRevisionIntegrityGate('a'.repeat(40), FULL_SHA);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('NEO_REVISION integrity mismatch');
        expect(result.stderr).toContain(FULL_SHA)
    })
});

test.describe('deploy-pipeline.sh revision pinning (#15792)', () => {
    test('a selector matching zero refs fails closed without invoking Docker', async () => {
        const fake   = await createFakeBin(''),
              result = runPipeline(fake, 'no-such-branch');

        expect(result.code).not.toBe(0);
        expect(result.output).toContain('no-such-branch');
        expect(result.output).toContain('matched 0 refs');
        // The whole point: an unresolvable selector must never reach a build.
        expect(await dockerInvocations(fake.dockerLog)).toBe(0)
    });

    test('an ambiguous selector matching many refs fails closed without invoking Docker', async () => {
        const
            manyRefs = `aaaa111111111111111111111111111111111111\trefs/heads/x\n` +
                       `bbbb222222222222222222222222222222222222\trefs/heads/y`,
            fake     = await createFakeBin(manyRefs),
            result   = runPipeline(fake, 'ambiguous');

        expect(result.code).not.toBe(0);
        expect(result.output).toContain('matched 2 refs');
        expect(await dockerInvocations(fake.dockerLog)).toBe(0)
    });

    test('an abbreviated SHA fails closed — an abbreviated ref is not a reproducible pin', async () => {
        const fake   = await createFakeBin(''),
              result = runPipeline(fake, FULL_SHA.slice(0, 10));

        expect(result.code).not.toBe(0);
        expect(await dockerInvocations(fake.dockerLog)).toBe(0)
    });

    test('every SCRIPT_DIR-relative path in the script actually RESOLVES', async () => {
        // Both instances of one bug shipped here: `$SCRIPT_DIR` is `ai/examples/cloud-deployment`, so
        // `../..` is ALREADY `ai/`, and two lines re-added `ai/` on top of it. The old `COMPOSE_FILE`
        // default was removed because composition is caller-owned; the prescription materializer and
        // maintenance preflight are the script's two sibling-path references.
        //
        // So this asserts resolution directly rather than trusting the next author to count `../`.
        const source    = await fs.readFile(scriptPath, 'utf8'),
              scriptRel = path.dirname(scriptPath),
              refs      = [...source.matchAll(/\$SCRIPT_DIR\/([A-Za-z0-9/._-]+)/g)].map(match => match[1]),
              unique    = [...new Set(refs)];

        // Positive control: pin the intended script-relative dependencies so removal or accidental
        // reintroduction of an implicit Compose path changes this contract loudly.
        expect(unique).toEqual([
            '../../scripts/maintenance/materializeDeploymentPrescriptions.mjs',
            '../../scripts/maintenance/redeployPreflight.mjs'
        ]);

        for (const ref of unique) {
            const resolved = path.resolve(scriptRel, ref);

            await expect(
                fs.access(resolved),
                `deploy-pipeline.sh references $SCRIPT_DIR/${ref}, which resolves to a path that does not exist: ${resolved}`
            ).resolves.toBeUndefined();
        }
    });

    test('an ordinary redeploy keeps the default project and refuses BEFORE Docker without a bundle', async () => {
        // My change to this script broke the six positive-path tests here, and the honest repair is not
        // just to hand the fixture a declaration — it is to assert at this seam what the gate does.
        //
        // Revision resolution succeeding is precisely the dangerous case: everything about the deploy
        // looks correct, and the only thing standing between it and an unrecoverable plane is this
        // gate. So the assertion is ordering, proven by the strongest available witness — Docker was
        // never invoked at all.
        const fake   = await createFakeBin(''),
              result = runPipelineWithProbe(fake, FULL_SHA, {declareInitialization: false, peelTo: FULL_SHA});

        expect(result.code).toBe(1);
        expect(result.output).toMatch(/REFUSING to proceed/);
        expect(result.output).toMatch(/REFUSE_NO_VERIFIED_BUNDLE/);
        // An unset declaration is allowed on the non-destructive path and still resolves the
        // reference deployment identity. Requiring the env var here would make the safety split
        // costly enough to invite bypasses; sharing the initialize-path default would reopen it.
        expect(result.output).toContain('[deploy] project:  neo-agent-os');
        // The resolvable revision is not what stopped it — the revision resolved fine.
        expect(result.output).toContain(FULL_SHA);
        // The load-bearing half: nothing touched containers.
        expect(await dockerInvocations(fake.dockerLog)).toBe(0)
    });

    test('declared initialization without a declared project identity fails before Docker', async () => {
        // The pipeline's ordinary-redeploy default is not an initialization declaration. If this
        // value is inferred, a truthful project-scoped absence can be misread as plane-wide absence
        // while another Compose project still owns the populated primary volume.
        const fake   = await createFakeBin(''),
              result = runPipelineWithProbe(fake, FULL_SHA, {
                  declareInitialization: true,
                  peelTo               : FULL_SHA,
                  projectName          : ''
              });

        expect(result.code).toBe(1);
        expect(result.output).toContain('NEO_DEPLOY_PROJECT_NAME');
        expect(result.output).toMatch(/explicitly declared.*--initialize/i);
        expect(await dockerInvocations(fake.dockerLog)).toBe(0)
    });

    test('a full 40-char SHA is VERIFIED against the remote, not trusted for its shape', async () => {
        // The old version of this test asserted the selector "passes through" — which asserted the
        // defect. A 40-hex id is only the deployed revision once the remote confirms it is a commit.
        const fake   = await createFakeBin(''),
              result = runPipelineWithProbe(fake, FULL_SHA, {peelTo: FULL_SHA});

        expect(result.code, result.output).toBe(0);
        expect(result.output).toContain(FULL_SHA);
        // The host checkout must be reported as explicitly NOT the deployed revision.
        expect(result.output).toContain('host-checkout:');
        expect(result.output).toContain('NOT what is deployed');
        expect(await dockerInvocations(fake.dockerLog)).toBeGreaterThan(0)
    });

    test('a nonexistent 40-hex id fails closed without invoking Docker', async () => {
        // Shape is not existence. The fail-before-Docker contract binds here too, and this was the
        // one branch that skipped it entirely.
        const fake   = await createFakeBin(''),
              result = runPipelineWithProbe(fake, 'dead' + 'b'.repeat(36), {fetchFails: true});

        expect(result.code).not.toBe(0);
        expect(result.output).toContain('could not be fetched');
        expect(await dockerInvocations(fake.dockerLog)).toBe(0)
    });

    test('a 40-hex ANNOTATED-TAG OBJECT id exports the PEELED COMMIT, never the tag object', async () => {
        // The original wrong-attestation defect's last hiding place: a tag object id is also 40 hex,
        // and the Dockerfile's `checkout --detach FETCH_HEAD; rev-parse HEAD` peels it — so trusting
        // the shape stamps a label that /app/.neo-revision truthfully contradicts.
        const
            TAG_OBJECT_ID = '231f84c368e0351933e95dc51e7bd73b1e15bdff',
            PEELED_COMMIT = '4a972d07e6eb08975b15eaf3499f16c742ad70bb',
            fake          = await createFakeBin(''),
            result        = runPipelineWithProbe(fake, TAG_OBJECT_ID, {peelTo: PEELED_COMMIT});

        expect(result.code).toBe(0);

        const log = await fs.readFile(fake.dockerLog, 'utf8');

        expect(log).toContain(`NEO_REVISION=${PEELED_COMMIT}`);
        expect(log).toContain('NEO_REF=<unset>');
        // The tag object must never be attested, and the substitution must be stated out loud.
        expect(log).not.toContain(TAG_OBJECT_ID);
        expect(result.output).toContain('peeled to commit')
    });

    test('a 40-hex id that is not a commit (tree/blob) fails closed without invoking Docker', async () => {
        // `^{commit}` yields nothing for a tree or blob. Reaching Docker with a non-commit would
        // produce an image whose revision label names an object that is not source history.
        const fake   = await createFakeBin(''),
              result = runPipelineWithProbe(fake, 'c'.repeat(40), {peelTo: ''});

        expect(result.code).not.toBe(0);
        expect(result.output).toContain('is not a commit');
        expect(await dockerInvocations(fake.dockerLog)).toBe(0)
    });

    test('a resolvable channel resolves to its single SHA rather than staying mutable', async () => {
        const
            fake   = await createFakeBin(`${FULL_SHA}\trefs/heads/dev`),
            result = runPipeline(fake, 'dev');

        expect(result.code).toBe(0);
        // Resolved, not passed through as the channel name.
        expect(result.output).toContain(FULL_SHA);
        expect(result.output).toContain('selector:');
        expect(await dockerInvocations(fake.dockerLog)).toBeGreaterThan(0)
    });

    test('one canonical NEO_REVISION reaches Compose after the selector is removed', async () => {
        const
            fake   = await createFakeBin(`${FULL_SHA}\trefs/heads/dev`),
            result = runPipeline(fake, 'dev');

        expect(result.code, result.output).toBe(0);

        // Compose maps this one value to both Docker args. Keeping NEO_REF in the outgoing
        // environment would preserve the conflicting second input at the boundary.
        const log = await fs.readFile(fake.dockerLog, 'utf8');

        expect(log).toContain('NEO_REF=<unset>');
        expect(log).toContain(`NEO_REVISION=${FULL_SHA}`);
        expect(log).not.toContain('NEO_REVISION=<unset>')
    });

    test('an annotated tag resolves to the PEELED COMMIT, never the tag object', async () => {
        // An annotated tag advertises two lines. Docker checks out the peel, so stamping the
        // tag object would make NEO_REVISION disagree with /app/.neo-revision — a 40-char git
        // object id is not necessarily a commit id.
        const
            TAG_OBJECT    = '9c18ce0000000000000000000000000000000000',
            PEELED_COMMIT = 'a312fc0000000000000000000000000000000000',
            // The peel is the SECOND argument, so fake-git advertises it only when the script
            // actually asks for the `^{}` pattern. Staging both as always-advertised would make
            // this test unable to fail — which is how the cycle-1 fixture passed a broken script.
            fake          = await createFakeBin(
                `${TAG_OBJECT}\trefs/tags/v13.2.0`,
                `${PEELED_COMMIT}\trefs/tags/v13.2.0^{}`
            ),
            result = runPipeline(fake, 'v13.2.0');

        expect(result.code).toBe(0);

        const log = await fs.readFile(fake.dockerLog, 'utf8');

        expect(log).toContain(`NEO_REVISION=${PEELED_COMMIT}`);
        expect(log).toContain('NEO_REF=<unset>');
        // The tag object must never be attested as the deployed revision.
        expect(log).not.toContain(TAG_OBJECT);
        expect(result.output).not.toContain(TAG_OBJECT)
    });

    test('a branch + annotated-tag collision ABORTS instead of silently picking the tag', async () => {
        // git itself treats `refs/heads/X` + `refs/tags/X` as ambiguous. Deciding ambiguity AFTER
        // peeling would collapse three advertised lines to one and deploy the tag while ignoring
        // the branch — an abort bypass created by the peel preference itself.
        const
            BRANCH_COMMIT = 'b1b1b10000000000000000000000000000000000',
            TAG_OBJECT    = 'c2c2c20000000000000000000000000000000000',
            TAG_COMMIT    = 'd3d3d30000000000000000000000000000000000',
            fake          = await createFakeBin(
                `${BRANCH_COMMIT}\trefs/heads/collide\n${TAG_OBJECT}\trefs/tags/collide`,
                `${TAG_COMMIT}\trefs/tags/collide^{}`
            ),
            result = runPipeline(fake, 'collide');

        expect(result.code).not.toBe(0);
        expect(result.output).toContain('matched 2 refs');
        // Nothing may be deployed, and no candidate may be attested.
        expect(await dockerInvocations(fake.dockerLog)).toBe(0)
    });

    test('a lightweight tag (single line, no peel) still resolves', async () => {
        const
            fake   = await createFakeBin(`${FULL_SHA}\trefs/tags/lightweight`),
            result = runPipeline(fake, 'lightweight');

        expect(result.code).toBe(0);
        expect(await fs.readFile(fake.dockerLog, 'utf8')).toContain(`NEO_REVISION=${FULL_SHA}`)
    })
})
