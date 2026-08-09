import {test, expect}  from '@playwright/test';
import {spawnSync}     from 'node:child_process';
import fs              from 'fs-extra';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const
    __dirname  = path.dirname(fileURLToPath(import.meta.url)),
    // lint -> scripts -> ai -> unit -> playwright -> test -> repo root
    REPO_ROOT  = path.resolve(__dirname, '../../../../../..'),
    LINT       = path.join(REPO_ROOT, 'ai/scripts/lint/lint-guard-ci-parity.mjs'),
    REGISTRY   = path.join(REPO_ROOT, 'ai/scripts/lint/guard-ci-parity-registry.json'),
    SELF_REL   = 'ai/scripts/lint/lint-guard-ci-parity.mjs';

/**
 * @summary Proves the guard-CI-parity lint actually fails, and fails for the stated reason.
 *
 * ## Why this file exists at all
 *
 * The lint it exercises asserts that every `lint-staged` guard is invoked by some workflow — it
 * exists because a guard nobody mirrors is skipped entirely by `git commit --no-verify`. A
 * coverage guard that has never been observed RED is exactly the thing that guard is about, so
 * shipping it on a green run alone would reproduce the defect one level up.
 *
 * Each case therefore drives the real script in a spawned process and asserts **the exit code and
 * the reason**, never merely that something failed. A lint that dies of a missing file also exits
 * non-zero.
 *
 * ## Why a fixture registry rather than editing the real one
 *
 * The lint reads `NEO_GUARD_CI_PARITY_REGISTRY` when set. A red-proof that mutated the committed
 * registry would leave the repo dirty if an assertion threw, and could not run in parallel. The
 * override exists for this file; production never sets it.
 *
 * @param {Object} [config]
 * @param {Function} [config.mutate] receives the parsed registry and edits it in place
 * @returns {Object} `{code, output}`
 */
function runLint({mutate} = {}) {
    const registry = fs.readJsonSync(REGISTRY);

    let registryPath = REGISTRY,
        dir          = null;

    if (mutate) {
        mutate(registry);
        dir          = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-guard-parity-'));
        registryPath = path.join(dir, 'registry.json');
        fs.writeJsonSync(registryPath, registry, {spaces: 4})
    }

    try {
        const result = spawnSync(process.execPath, [LINT], {
            cwd     : REPO_ROOT,
            encoding: 'utf8',
            env     : {...process.env, NEO_GUARD_CI_PARITY_REGISTRY: registryPath}
        });

        return {code: result.status, output: `${result.stdout || ''}${result.stderr || ''}`}
    } finally {
        dir && fs.removeSync(dir)
    }
}

/**
 * @summary Runs the production lint against an isolated synthetic repository.
 *
 * Classifier falsifiers need to control all three authorities together: configured commands,
 * workflow executions, and accepted client-only paths. The production entrypoint remains the code
 * under test; only its repo root is redirected to the bounded fixture.
 *
 * @param {Object} config
 * @param {Object} config.lintStaged
 * @param {Object<String, String>} config.workflows
 * @param {Object} [config.clientOnly={}]
 * @returns {Object} `{code, output}`
 */
function runFixture({lintStaged, workflows, clientOnly = {}}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-guard-parity-root-'));

    try {
        fs.writeJsonSync(path.join(dir, 'package.json'), {'lint-staged': lintStaged}, {spaces: 4});

        Object.entries(workflows).forEach(([file, source]) => {
            const filePath = path.join(dir, '.github/workflows', file);

            fs.ensureDirSync(path.dirname(filePath));
            fs.writeFileSync(filePath, source)
        });

        const registryPath = path.join(dir, 'ai/scripts/lint/guard-ci-parity-registry.json');

        fs.ensureDirSync(path.dirname(registryPath));
        fs.writeJsonSync(registryPath, {
            $schema: {baselineAtIntroduction: Object.keys(clientOnly).length},
            clientOnly
        }, {spaces: 4});

        const result = spawnSync(process.execPath, [LINT], {
            cwd     : dir,
            encoding: 'utf8',
            env     : {
                ...process.env,
                NEO_GUARD_CI_PARITY_REGISTRY : registryPath,
                NEO_GUARD_CI_PARITY_REPO_ROOT: dir
            }
        });

        return {code: result.status, output: `${result.stdout || ''}${result.stderr || ''}`}
    } finally {
        fs.removeSync(dir)
    }
}

test.describe('every lint-staged guard has a CI mirror or a recorded reason', () => {
    test('the committed registry is GREEN — the population is fully classified today', () => {
        const {code, output} = runLint();

        expect(code, `the guard should pass against the committed registry.\n\n${output}`).toBe(0);
        expect(output).toMatch(/\[lint-guard-ci-parity\] OK/)
    });

    test('the commit-time carrier covers both workflow suffixes and every local authority', () => {
        const
            pkg     = fs.readJsonSync(path.join(REPO_ROOT, 'package.json')),
            carrier = Object.entries(pkg['lint-staged']).find(([, commands]) => {
                return [commands].flat().some(command => `${command}`.includes(SELF_REL))
            });

        expect(carrier, 'package.json must retain the local parity-guard carrier').toBeTruthy();

        const [pattern] = carrier;

        [
            'package.json',
            '.github/workflows/specimen.yml',
            '.github/workflows/specimen.yaml',
            SELF_REL,
            'ai/scripts/lint/guard-ci-parity-registry.json'
        ].forEach(source => {
            expect(path.matchesGlob(source, pattern), `${source} must trigger the local carrier`).toBe(true)
        })
    });

    test('RED: an unmirrored guard missing from the registry fails, and is NAMED', () => {
        // The load-bearing case. `check-parse` is a SYNTAX guard with no workflow; dropping its
        // acceptance entry must fail rather than pass silently.
        const {code, output} = runLint({
            mutate: registry => { delete registry.clientOnly['buildScripts/util/check-parse.mjs'] }
        });

        expect(code, `removing an accepted entry must FAIL.\n\n${output}`).toBe(1);
        expect(output, 'the failure must name the guard, or it is not actionable').toMatch(/check-parse\.mjs/);
        expect(output).toMatch(/no workflow/i)
    });

    test('RED: registering an already-mirrored guard fails as STALE, naming its workflow', () => {
        // The other direction. Without this, the registry could only grow: an entry for a guard
        // that has since gained a mirror would sit there forever, silently widening the accepted
        // set. Shrinking the registry has to be enforced, not merely encouraged.
        const {code, output} = runLint({
            mutate: registry => {
                registry.clientOnly['buildScripts/util/check-jsdoc-types.mjs'] = {
                    reason : 'fixture — this guard IS mirrored',
                    witness: 'fixture'
                }
            }
        });

        expect(code, `a stale entry must FAIL.\n\n${output}`).toBe(1);
        expect(output).toMatch(/STALE/);
        expect(output, 'the failure must name the workflow that already mirrors it').toMatch(/jsdoc-type-lint\.yml/)
    });

    test('RED: an entry without a reason or witness is a suppression, not an acceptance', () => {
        const {code, output} = runLint({
            mutate: registry => {
                registry.clientOnly['buildScripts/util/check-parse.mjs'] = {reason: 'x'}
            }
        });

        expect(code, `an entry missing its witness must FAIL.\n\n${output}`).toBe(1);
        expect(output).toMatch(/INVALID/);
        expect(output).toMatch(/suppression/)
    });

    test('a guard NAMED in a workflow comment is not counted as INVOKED by it', () => {
        // The detection trap. `ticket-archaeology-lint.yml` mentions block-alignment in prose while
        // not invoking it. Comment stripping is what keeps a prose mention from reading as coverage;
        // this pins the behaviour so a later "simplification" cannot quietly remove it.
        const workflow = fs.readFileSync(
            path.join(REPO_ROOT, '.github/workflows/ticket-archaeology-lint.yml'), 'utf8'
        );

        const commentedMention = workflow
            .split('\n')
            .some(line => line.trim().startsWith('#') && line.includes('block-alignment'));

        expect(commentedMention, 'fixture drift: the prose mention this case pins is gone').toBe(true);

        // …and with that mention present, the guard is still reported as client-only.
        const {output} = runLint();

        expect(output).toMatch(/\[lint-guard-ci-parity\] OK/);
        expect(
            fs.readJsonSync(REGISTRY).clientOnly['buildScripts/util/check-block-alignment.mjs'],
            'block-alignment must still be classified client-only despite being named in a comment'
        ).toBeTruthy()
    })

    test('RED: removing this guard commit-time carrier is detected directly', () => {
        const {code, output} = runFixture({
            lintStaged: {
                '*.mjs': ['node ./tools/arbitrary-name.mjs']
            },
            workflows: {
                'arbitrary.yml': `jobs:\n  lint:\n    steps:\n      - run: node ./tools/arbitrary-name.mjs\n`
            }
        });

        expect(code, `the guard must not disappear with its own carrier.\n\n${output}`).toBe(1);
        expect(output).toContain(SELF_REL);
        expect(output).toMatch(/commit-time carrier missing/i)
    });

    test('RED: a same-basename workflow execution does not mirror a different path', () => {
        const {code, output} = runFixture({
            lintStaged: {
                '*.mjs': [
                    `node ./${SELF_REL}`,
                    'node ./alpha/shared-name.mjs',
                    'node ./beta/shared-name.mjs'
                ]
            },
            workflows: {
                'guard.yml': `jobs:\n  lint:\n    steps:\n      - run: node ./${SELF_REL}\n`,
                'alpha.yml': `jobs:\n  lint:\n    steps:\n      - run: node ./alpha/shared-name.mjs\n`
            }
        });

        expect(code, `beta/shared-name.mjs has no mirror and must not alias alpha.\n\n${output}`).toBe(1);
        expect(output).toContain('beta/shared-name.mjs');
        expect(output).not.toMatch(/alpha\/shared-name\.mjs\s*$/m)
    });

    test('RED: an mjs argument inside run is a mention, not a Node execution', () => {
        const {code, output} = runFixture({
            lintStaged: {
                '*.mjs': [
                    `node ./${SELF_REL}`,
                    'node ./tools/mentioned-only.mjs'
                ]
            },
            workflows: {
                'guard.yml'  : `jobs:\n  lint:\n    steps:\n      - run: node ./${SELF_REL}\n`,
                'mention.yml': `jobs:\n  lint:\n    steps:\n      - run: echo ./tools/mentioned-only.mjs\n`
            }
        });

        expect(code, `echoing a path is not executing its guard.\n\n${output}`).toBe(1);
        expect(output).toContain('tools/mentioned-only.mjs')
    })
});
