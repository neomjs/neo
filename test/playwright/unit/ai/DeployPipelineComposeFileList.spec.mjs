import {test, expect}  from '@playwright/test';
import fs              from 'fs-extra';
import path            from 'path';
import {execFile}      from 'node:child_process';
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
 * Runs the pipeline with recording stubs for `docker` and `node`.
 * @param {Object}  config
 * @param {String}  [config.composeFileValue] Value for `NEO_DEPLOY_COMPOSE_FILE`.
 * @param {Boolean} [config.omitComposeFile]  Leave the variable UNSET rather than setting it — the only
 * way to exercise the default path, since an empty string is a *supplied* value with different meaning.
 * @param {String}  [config.revision]         Selector for `NEO_REF`; defaults to this checkout's `HEAD`.
 * @returns {Promise<Object>} `{code, stdout, calls, dockerCalls, composeArgs, preflightCallIndex, firstDockerIndex}`
 */
async function runPipeline({composeFileValue, omitComposeFile, revision}) {
    const workDir = await fs.mkdtemp(path.join(repoRoot, 'test/playwright/test-results/compose-list-')),
          binDir  = path.join(workDir, 'bin'),
          logPath = path.join(workDir, 'calls.log');

    await fs.ensureDir(binDir);
    await fs.writeFile(logPath, '');

    // Recording stubs. `exit 0` so the script proceeds past them and we observe every call it makes.
    for (const name of ['docker', 'node']) {
        const stubPath = path.join(binDir, name);

        await fs.writeFile(stubPath, `#!/usr/bin/env bash\nprintf '${name} %s\\n' "$*" >> "$CALL_LOG"\nexit 0\n`);
        await fs.chmod(stubPath, 0o755)
    }

    const selector = revision || (await execFileAsync('git', ['rev-parse', 'HEAD'], {cwd: repoRoot})).stdout.trim();

    let code   = 0,
        stdout = '';

    // Built by DELETION rather than by assigning `undefined`: Node coerces an `undefined` env value to
    // the string "undefined", which the script would read as a supplied path. Only an absent key
    // reaches bash as genuinely unset, which is the distinction under test.
    const childEnv = {
        ...process.env,
        PATH                   : `${binDir}:${process.env.PATH}`,
        CALL_LOG               : logPath,
        NEO_REPO_URL           : repoRoot,
        NEO_REF                : selector,
        NEO_DEPLOY_PROJECT_NAME: 'compose-list-spec',
        NEO_DEPLOY_COMPOSE_FILE: composeFileValue ?? ''
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

    const calls       = (await fs.readFile(logPath, 'utf8')).split('\n').filter(Boolean),
          dockerCalls = calls.filter(line => line.startsWith('docker ')),
          firstUp     = dockerCalls.find(line => line.includes(' up ')) || '';

    await fs.remove(workDir);

    // `calls` is the ORDERED interleaving of both stubs. Order assertions must read it rather than the
    // filtered per-tool lists, which discard exactly the relative position under test.
    return {
        code,
        stdout,
        calls,
        dockerCalls,
        composeArgs       : firstUp,
        preflightCallIndex: calls.findIndex(line => line.startsWith('node ') && line.includes('redeployPreflight')),
        firstDockerIndex  : calls.findIndex(line => line.startsWith('docker '))
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

    test('a zero-entry value aborts with Docker NEVER invoked', async () => {
        // The guarantee is "stopped before touching containers", not merely "stopped". A non-zero exit
        // alone would not distinguish the two.
        const result = await runPipeline({composeFileValue: ':::'});

        expect(result.code).not.toBe(0);
        expect(result.dockerCalls).toEqual([]);
        expect(result.stdout).toContain('no usable path')
    });

    test('the operator-facing count reports FILES, not argv elements', async () => {
        // It reported double during rehearsal: `${#arr[@]}` counts argv elements and each file
        // contributes both a `-f` and a path, so two files printed "(4 file(s))".
        const twoFiles = await runPipeline({composeFileValue: '/tmp/a.yml:/tmp/b.yml'}),
              oneFile  = await runPipeline({composeFileValue: '/tmp/a.yml'});

        expect(twoFiles.stdout).toContain('(2 file(s)');
        expect(oneFile.stdout).toContain('(1 file(s)')
    });

    test('the preflight runs BEFORE any Docker call — asserted on recorded POSITION', async () => {
        // The earlier version of this test only checked that both the preflight message and some Docker
        // call appeared, which is true for ANY ordering and so proved nothing about the guarantee it
        // claimed. The property is positional: the survivability gate must precede every container
        // call, so compare indices in the ordered interleaving of both stubs.
        const result = await runPipeline({composeFileValue: '/tmp/a.yml:/tmp/b.yml'});

        expect(result.preflightCallIndex).toBeGreaterThan(-1);
        expect(result.firstDockerIndex).toBeGreaterThan(-1);
        expect(result.preflightCallIndex).toBeLessThan(result.firstDockerIndex)
    });

    test('the health gate and project pinning are unchanged, and `down` is never issued', async () => {
        const result = await runPipeline({composeFileValue: '/tmp/a.yml:/tmp/b.yml'});

        expect(result.composeArgs).toContain('up -d --build --wait');
        expect(result.composeArgs).toContain('-p compose-list-spec');
        expect(result.dockerCalls.some(line => line.includes(' down '))).toBe(false)
    });

    test('an EXPLICIT empty value aborts; an UNSET variable keeps the compatible default', async () => {
        // These are different inputs and `${VAR:-default}` collapses them: an explicit empty string
        // would fall back to the base compose file, deploying the base contract to a plane that needs
        // an overlay — precisely what the zero-entry abort exists to prevent. Unset must still default,
        // or every existing caller breaks.
        const explicitEmpty = await runPipeline({composeFileValue: ''});

        expect(explicitEmpty.code).not.toBe(0);
        expect(explicitEmpty.dockerCalls).toEqual([]);
        expect(explicitEmpty.stdout).toContain('no usable path');

        const unset      = await runPipeline({omitComposeFile: true}),
              unsetFiles = orderedComposeFiles(unset.composeArgs);

        expect(unset.code).toBe(0);
        expect(unsetFiles).toHaveLength(1);
        // Compared on what the path RESOLVES to, not on its spelling: the script builds the default
        // from `$SCRIPT_DIR/../..`, so the literal argv contains `../..` un-normalized. Asserting the
        // string would pin an incidental spelling rather than the file being addressed.
        expect(path.resolve(unsetFiles[0])).toBe(path.join(repoRoot, 'ai/deploy/docker-compose.yml'))
    });
});
