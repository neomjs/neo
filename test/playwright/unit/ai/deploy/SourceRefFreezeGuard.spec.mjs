import {test, expect} from '@playwright/test';
import {spawnSync}    from 'node:child_process';
import fs             from 'node:fs/promises';
import os             from 'node:os';
import path           from 'node:path';
import process        from 'node:process';

/**
 * Guards the source-acquisition ref contract of `ai/deploy/Dockerfile`.
 *
 * ## The defect this exists to keep closed
 *
 * The source stage's fetch is ONE cache-keyed `RUN`. With a channel name like `dev`, its cache key is
 * byte-identical on every build, so Docker reuses the layer and the fetch never runs again — the image
 * packages whatever the channel pointed at the FIRST time the layer was built, and the build log still
 * prints the fetch command, because that is what Docker prints for a cached layer.
 *
 * Not hypothetical (ticket-ref-ok: D#16304 is the incident RECORD this spec encodes, not a tracking
 * ref — it holds the measured SHA pair below and stays true after the Discussion closes): a
 * `docker compose up -d --build --wait` against this stack was a full cache hit and moved the running
 * plane BACKWARDS (`cf5f366344` -> `c2304ea118`) while `redeployPreflight`, `--wait` health, and exit
 * code zero all reported success.
 *
 * ## Why this is a unit spec, and what it therefore does NOT establish
 *
 * Every assertion here runs the Dockerfile's OWN shell text — extracted from the file that ships and
 * executed under `sh` — so it cannot drift from a paraphrase. It needs no Docker daemon and no network,
 * matching the sibling contract in `DeployPipelineRevisionPin.spec.mjs`.
 *
 * The boundary, stated rather than implied: this proves the guard's LOGIC and its POSITION in the
 * stage. It does not prove Docker executes it, because that is a property of the builder, not of the
 * text. That half is covered by real `docker build --target source-git` receipts recorded on the PR;
 * if the two ever disagree, the daemon is authoritative and this spec is the thing that is wrong.
 *
 * The load-bearing arms are the NEGATIVE ones. A guard that only proves a full SHA is accepted passes
 * on the pre-fix Dockerfile too and proves nothing — the shape that must fail is an UNCHANGED mutable
 * ref, which is exactly the shape that used to succeed.
 */

const
    repoRoot       = path.resolve(process.cwd()),
    dockerfilePath = path.join(repoRoot, 'ai/deploy/Dockerfile'),

    REPO_URL       = 'https://github.com/neomjs/neo.git',
    SHA_A          = '6b52663db329aa90df52d0b5d64d9a9bac07312e',
    SHA_B          = 'cdad885348aa1f2e3b4c5d6e7f8091a2b3c4d5e6';

/**
 * @summary Lifts one `RUN` instruction's shell body out of the shipping Dockerfile.
 *
 * The body is taken verbatim and only line-continuations are folded, so what executes here is the same
 * text Docker hands to `/bin/sh`. Re-typing the condition into the spec would let the two drift, and
 * the drifting copy is the one nobody is testing.
 * @param {String} source    Full Dockerfile text.
 * @param {String} startsWith Unique opening of the RUN instruction.
 * @returns {String} Shell-ready command body, `RUN ` stripped.
 */
function extractRunBody(source, startsWith) {
    const start = source.indexOf(startsWith);

    expect(start, `Dockerfile is missing the "${startsWith}" instruction`).toBeGreaterThan(-1);

    // A RUN block is one paragraph; the next blank line ends it.
    const end = source.indexOf('\n\n', start);

    expect(end, `"${startsWith}" has no paragraph boundary`).toBeGreaterThan(start);

    return source.slice(start + 4, end).replace(/\\\n\s*/g, ' ')
}

/**
 * @summary Runs the extracted ref guard under `sh` with a controlled build-arg environment.
 * @param {Object} env `NEO_REF`, and optionally `NEO_ALLOW_MUTABLE_REF`.
 * @returns {Object} `{status, stderr}` from the spawn.
 */
async function runRefGuard(env) {
    const command = extractRunBody(await fs.readFile(dockerfilePath, 'utf8'), 'RUN neo_ref_is_sha=');

    return spawnSync('sh', ['-c', command], {
        encoding: 'utf8',
        // A build ARG reaches the RUN as an environment variable, so this is the real delivery path.
        env  : {...process.env, NEO_ALLOW_MUTABLE_REF: '', NEO_REPO_URL: REPO_URL, ...env},
        stdio: ['ignore', 'pipe', 'pipe']
    })
}

/**
 * @summary Runs the extracted final-stage integrity gate against a stand-in revision receipt.
 * @param {Object} env       `NEO_REF` / `NEO_REVISION` as the build would supply them.
 * @param {String} packaged  Contents of the stand-in `/app/.neo-revision`.
 * @returns {Object} `{status, stderr}` from the spawn.
 */
async function runIntegrityGate(env, packaged) {
    const
        source = await fs.readFile(dockerfilePath, 'utf8'),
        start  = source.indexOf('RUN actual_revision='),
        end    = source.indexOf('\nLABEL org.neomjs.image.requested-ref', start);

    expect(start, 'Dockerfile revision-integrity RUN instruction is missing').toBeGreaterThan(-1);
    expect(end, 'Dockerfile revision-integrity RUN instruction has no label boundary').toBeGreaterThan(start);

    const
        tempDir      = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-ref-freeze-')),
        revisionFile = path.join(tempDir, '.neo-revision'),
        command      = source.slice(start + 4, end)
            .replace(/\\\n\s*/g, ' ')
            .replace('/app/.neo-revision', JSON.stringify(revisionFile));

    await fs.writeFile(revisionFile, packaged);

    const result = spawnSync('sh', ['-c', command], {
        encoding: 'utf8',
        env     : {...process.env, NEO_REF: '', NEO_REVISION: '', ...env},
        stdio   : ['ignore', 'pipe', 'pipe']
    });

    await fs.rm(tempDir, {force: true, recursive: true});

    return result
}

test.describe('source ref freeze guard (#16635)', () => {
    test('a mutable ref is refused, because it freezes the source layer', async () => {
        const result = await runRefGuard({NEO_REF: 'dev'});

        expect(result.status, '`dev` must not reach the fetch — it is the shape that freezes').toBe(1);
        expect(result.stderr).toContain("NEO_REF='dev' is not a full 40-hex commit SHA");
    });

    test('the refusal explains the freeze and names the resolve command, not just the rule', async () => {
        const {stderr} = await runRefGuard({NEO_REF: 'dev'});

        // A refusal that only states the rule sends the reader looking for the reason, and the reason
        // is the whole point: the cost is freshness, not merely reproducibility.
        expect(stderr).toContain('freezes this layer');
        expect(stderr).toContain('reports success while doing it');
        // The way out has to be copy-pasteable, with the real repository substituted in.
        expect(stderr).toContain(`git ls-remote ${REPO_URL}`);
        expect(stderr).toContain('NEO_SOURCE=local');
        // And the escape hatch must advertise both its exact spelling and what it does NOT buy.
        expect(stderr).toContain('NEO_ALLOW_MUTABLE_REF=1 exactly');
        expect(stderr).toContain('no');
        expect(stderr).toContain('other value opts in');
        expect(stderr).toContain('FROZEN layer');
        expect(stderr).toContain('--no-cache');
    });

    // Positive control sharing the property under test: these are all HEX, differing only in the
    // dimension the guard claims to police. A control that failed for an unrelated reason (a URL, a
    // path) would pass against a guard that merely rejected non-refs.
    for (const [label, ref] of [
        ['an abbreviated 12-char SHA', SHA_A.slice(0, 12)],
        ['a 39-char SHA',              SHA_A.slice(0, 39)],
        ['a 41-char SHA',              `${SHA_A}0`],
        ['an uppercased SHA',          SHA_A.toUpperCase()]
    ]) {
        test(`${label} is refused — a ref must be exactly a full lowercase commit SHA`, async () => {
            const result = await runRefGuard({NEO_REF: ref});

            expect(result.status).toBe(1);
        });
    }

    test('an empty ref is refused rather than defaulting to anything', async () => {
        expect((await runRefGuard({NEO_REF: ''})).status).toBe(1);
    });

    test('a full commit SHA is admitted — the guard constrains the ref, it does not block builds', async () => {
        const result = await runRefGuard({NEO_REF: SHA_A});

        expect(result.status, 'a content-addressed ref is the sanctioned input').toBe(0);
        expect(result.stderr).toBe('');
    });

    test('the explicit opt-in re-admits a channel for a hand-run build', async () => {
        const result = await runRefGuard({NEO_ALLOW_MUTABLE_REF: '1', NEO_REF: 'dev'});

        expect(result.status).toBe(0);
    });

    // The override is an authorization parser, so it is tested like one. The arm above supplies the
    // documented value, which is the arm where exact-equality and shell-truthiness agree BY
    // CONSTRUCTION — it passed against a `[ -n "$VAR" ]` predicate that admitted every non-empty
    // value, including `0`. These are the cells that separate the two readings; without them, green
    // cannot distinguish "opts in on 1" from "opts in on anything at all".
    for (const [label, value] of [
        ['0',                '0'],
        ['false',            'false'],
        ['true',             'true'],
        ['yes',              'yes'],
        ['TRUE',             'TRUE'],
        ['a single space',   ' '],
        ['1 with a trailing space', '1 '],
        ['1 with a leading space',  ' 1'],
        ['11',               '11'],
        ['a typo',           'allow']
    ]) {
        test(`NEO_ALLOW_MUTABLE_REF=${label} does NOT opt in — only the exact value 1 does`, async () => {
            const result = await runRefGuard({NEO_ALLOW_MUTABLE_REF: value, NEO_REF: 'dev'});

            expect(
                result.status,
                `"${value}" admitted a mutable ref; misspelling a safety override must fail closed, not open`
            ).toBe(1);
        });
    }

    test('the guard runs BEFORE the fetch, so a refused ref never reaches the network', async () => {
        const
            source     = await fs.readFile(dockerfilePath, 'utf8'),
            guardIndex = source.indexOf('RUN neo_ref_is_sha='),
            fetchIndex = source.indexOf('RUN git init -q');

        expect(guardIndex).toBeGreaterThan(-1);
        expect(fetchIndex).toBeGreaterThan(-1);
        // Reordering these would leave the guard technically present and practically absent: the fetch
        // layer would already be cached by the time the refusal ran.
        expect(guardIndex, 'the ref guard must precede the fetch it protects').toBeLessThan(fetchIndex);
    });
});

test.describe('revision integrity is asserted without a caller (#16635 AC4)', () => {
    test('a SHA-pinned build that packaged a different commit fails — the cache-hit catch', async () => {
        // This is the arm that was a no-op before: NEO_REVISION defaults to empty, so the original
        // gate's `[ -n "$NEO_REVISION" ]` guard switched the whole check off in exactly the
        // configuration that produces a stale package.
        const result = await runIntegrityGate({NEO_REF: SHA_A}, SHA_B);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('NEO_REF integrity mismatch');
        expect(result.stderr).toContain('served from cache');
    });

    test('a SHA-pinned build that packaged that commit passes, with no caller assertion', async () => {
        const result = await runIntegrityGate({NEO_REF: SHA_A}, SHA_A);

        expect(result.status, 'NEO_REF alone is now a sufficient, checkable claim').toBe(0);
    });

    test('a NEO_SOURCE=local build stays silent — its non-SHA ref asserts nothing', async () => {
        const result = await runIntegrityGate({NEO_REF: 'dev'}, 'local-build');

        expect(result.status).toBe(0);
    });

    test('a local build handed a SHA fails — a revision claim over `local-build` is a fabrication', async () => {
        const result = await runIntegrityGate({NEO_REF: SHA_A}, 'local-build');

        expect(result.status).toBe(1);
    });

    test('the pre-existing caller-supplied assertion still governs', async () => {
        expect((await runIntegrityGate({NEO_REVISION: SHA_A}, SHA_B)).status).toBe(1);
        expect((await runIntegrityGate({NEO_REVISION: SHA_A}, SHA_A)).status).toBe(0);
    });
});
