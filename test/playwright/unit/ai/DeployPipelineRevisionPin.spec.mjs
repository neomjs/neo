import {test, expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import fs             from 'node:fs/promises';
import os             from 'node:os';
import path           from 'node:path';
import process        from 'node:process';

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
 * The positive case guards the other half of the contract: BOTH `NEO_REF` and `NEO_REVISION` must reach
 * Compose as the resolved SHA. Exporting only `NEO_REVISION` would label the image with a resolved
 * revision while the Dockerfile's source stage still fetched `${NEO_REF}` — a label asserting a fact
 * the artifact does not hold, and an unchanged cache input so `--build` might not even re-fetch.
 */

const
    repoRoot   = path.resolve(process.cwd()),
    scriptPath = path.join(repoRoot, 'ai/examples/cloud-deployment/deploy-pipeline.sh'),
    FULL_SHA   = '6be5afc1c30000000000000000000000000000aa';

/**
 * Builds a throwaway bin dir whose `git` and `docker` shadow the real ones on `PATH`.
 * `fake-git ls-remote` echoes `lsRemote` verbatim so a spec can stage zero, one, or many refs.
 * `fake-docker` records every invocation, so "Docker was never called" is an assertable fact
 * rather than an inference from the exit code.
 * @param {String} lsRemote Raw `git ls-remote` stdout to stage (empty string = zero matches).
 * @returns {Promise<Object>} `{bin, dockerLog}` paths.
 */
async function createFakeBin(lsRemote) {
    const
        bin       = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-deploy-pin-')),
        dockerLog = path.join(bin, 'docker-invocations.log');

    await fs.writeFile(path.join(bin, 'git'), [
        '#!/usr/bin/env bash',
        // Only ls-remote is contract-relevant; `describe` keeps the host-checkout log line working.
        'if [ "$1" = "ls-remote" ]; then printf \'%s\' "$FAKE_LS_REMOTE"; exit 0; fi',
        'if [ "$1" = "-C" ] && [ "$3" = "describe" ]; then echo "fake-describe"; exit 0; fi',
        'exit 0'
    ].join('\n'), {mode: 0o755});

    // Record the ENVIRONMENT, not only argv. NEO_REF / NEO_REVISION reach Compose as exported
    // env, never as arguments — so a docker stub logging `$*` alone can never falsify
    // "both variables reach Compose", which is the claim the pinning contract rests on.
    await fs.writeFile(path.join(bin, 'docker'), [
        '#!/usr/bin/env bash',
        `echo "invoked: $* | NEO_REF=${'$'}{NEO_REF-<unset>} NEO_REVISION=${'$'}{NEO_REVISION-<unset>}" >> ${JSON.stringify(dockerLog)}`,
        'exit 0'
    ].join('\n'), {mode: 0o755});

    await fs.writeFile(dockerLog, '');

    return {bin, dockerLog, lsRemote}
}

/**
 * Runs the pipeline script with a faked `PATH`, never throwing on non-zero exit so the spec can
 * assert on the code and the streams together.
 * @param {Object} fake The `createFakeBin` result.
 * @param {String} selector Value for `NEO_REF`.
 * @returns {Object} `{code, output}`.
 */
function runPipeline(fake, selector) {
    try {
        const output = execFileSync('bash', [scriptPath], {
            cwd     : repoRoot,
            encoding: 'utf8',
            env     : {
                ...process.env,
                FAKE_LS_REMOTE: fake.lsRemote,
                NEO_REF       : selector,
                PATH          : `${fake.bin}:${process.env.PATH}`
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

test.describe('deploy-pipeline.sh revision pinning (#15792)', () => {
    test('a selector matching zero refs fails closed without invoking Docker', async () => {
        const fake   = await createFakeBin(''),
              result = runPipeline(fake, 'no-such-branch');

        expect(result.code).not.toBe(0);
        expect(result.output).toContain('no-such-branch');
        expect(result.output).toContain('resolved to 0 commits');
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
        expect(result.output).toContain('resolved to 2 commits');
        expect(await dockerInvocations(fake.dockerLog)).toBe(0)
    });

    test('an abbreviated SHA fails closed — an abbreviated ref is not a reproducible pin', async () => {
        const fake   = await createFakeBin(''),
              result = runPipeline(fake, FULL_SHA.slice(0, 10));

        expect(result.code).not.toBe(0);
        expect(await dockerInvocations(fake.dockerLog)).toBe(0)
    });

    test('a full 40-char SHA passes through and is reported as the deployed revision', async () => {
        const fake   = await createFakeBin(''),
              result = runPipeline(fake, FULL_SHA);

        expect(result.code).toBe(0);
        expect(result.output).toContain(FULL_SHA);
        // The host checkout must be reported as explicitly NOT the deployed revision.
        expect(result.output).toContain('host-checkout:');
        expect(result.output).toContain('NOT what is deployed');
        expect(await dockerInvocations(fake.dockerLog)).toBeGreaterThan(0)
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

    test('BOTH NEO_REF and NEO_REVISION reach Compose as the resolved commit', async () => {
        const
            fake   = await createFakeBin(`${FULL_SHA}\trefs/heads/dev`),
            result = runPipeline(fake, 'dev');

        expect(result.code).toBe(0);

        // The env, not argv: NEO_REVISION alone would label the image while the source stage
        // still fetched ${NEO_REF} — a label attesting a commit the build never checked out.
        const log = await fs.readFile(fake.dockerLog, 'utf8');

        expect(log).toContain(`NEO_REF=${FULL_SHA}`);
        expect(log).toContain(`NEO_REVISION=${FULL_SHA}`);
        expect(log).not.toContain('NEO_REF=dev');
        expect(log).not.toContain('NEO_REVISION=<unset>')
    });

    test('an annotated tag resolves to the PEELED COMMIT, never the tag object', async () => {
        // An annotated tag advertises two lines. Docker checks out the peel, so stamping the
        // tag object would make NEO_REVISION disagree with /app/.neo-revision — a 40-char git
        // object id is not necessarily a commit id.
        const
            TAG_OBJECT    = '9c18ce0000000000000000000000000000000000',
            PEELED_COMMIT = 'a312fc0000000000000000000000000000000000',
            fake          = await createFakeBin(
                `${TAG_OBJECT}\trefs/tags/v13.2.0\n${PEELED_COMMIT}\trefs/tags/v13.2.0^{}`
            ),
            result = runPipeline(fake, 'v13.2.0');

        expect(result.code).toBe(0);

        const log = await fs.readFile(fake.dockerLog, 'utf8');

        expect(log).toContain(`NEO_REVISION=${PEELED_COMMIT}`);
        expect(log).toContain(`NEO_REF=${PEELED_COMMIT}`);
        // The tag object must never be attested as the deployed revision.
        expect(log).not.toContain(TAG_OBJECT);
        expect(result.output).not.toContain(TAG_OBJECT)
    });

    test('a lightweight tag (single line, no peel) still resolves', async () => {
        const
            fake   = await createFakeBin(`${FULL_SHA}\trefs/tags/lightweight`),
            result = runPipeline(fake, 'lightweight');

        expect(result.code).toBe(0);
        expect(await fs.readFile(fake.dockerLog, 'utf8')).toContain(`NEO_REVISION=${FULL_SHA}`)
    })
})
