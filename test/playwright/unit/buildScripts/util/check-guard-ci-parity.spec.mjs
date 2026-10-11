import {test, expect}  from '@playwright/test';
import {spawnSync}     from 'node:child_process';
import fs              from 'fs-extra';
import * as yaml       from 'js-yaml';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {SCAN_SURFACE}  from '../../../../../buildScripts/util/check-guard-ci-parity.mjs';

const
    __dirname  = path.dirname(fileURLToPath(import.meta.url)),
    // util -> buildScripts -> unit -> playwright -> test -> repo root
    REPO_ROOT  = path.resolve(__dirname, '../../../../..'),
    LINT       = path.join(REPO_ROOT, 'buildScripts/util/check-guard-ci-parity.mjs'),
    REGISTRY   = path.join(REPO_ROOT, 'buildScripts/util/check-guard-ci-parity-registry.json'),
    SELF_REL   = 'buildScripts/util/check-guard-ci-parity.mjs',
    MIRROR_REL = '.github/workflows/guard-ci-parity-lint.yml';

// Every file whose change can move the verdict. Both carriers are held to this one list, so a surface
// that grows a member reds whichever carrier stops covering it.
const VERDICT_INPUTS = [...SCAN_SURFACE, SELF_REL, MIRROR_REL];

/**
 * @summary The concrete paths that stand in for one verdict input when it is matched against a filter.
 *
 * Globs are sampled rather than compared as strings, because a filter of `.github/**` watches
 * `.github/workflows/**` without spelling it. An unsupported glob shape throws instead of sampling as
 * a literal, so widening the surface cannot pass a coverage check vacuously.
 *
 * @param {String} input a surface entry or a literal path
 * @returns {String[]}
 */
function samplesOf(input) {
    if (!input.includes('*')) {
        return [input]
    }

    if (!/^[^*]+\/\*\*$/.test(input)) {
        throw new Error(`unsupported SCAN_SURFACE glob shape: ${input}`)
    }

    const base = input.slice(0, -3);

    return [`${base}/specimen.yml`, `${base}/specimen.yaml`]
}

/**
 * @summary Which verdict inputs a set of glob patterns fails to cover.
 * @param {String[]} patterns
 * @param {String[]} inputs
 * @returns {String[]} the inputs some sample of which no pattern matches, in input order
 */
function uncoveredInputs(patterns, inputs) {
    return inputs.filter(input => !samplesOf(input).every(sample => patterns.some(pattern => path.matchesGlob(sample, pattern))))
}

/**
 * @summary The committed `lint-staged` glob whose command runs this guard.
 * @returns {String|undefined}
 */
function carrierPattern() {
    const pkg = fs.readJsonSync(path.join(REPO_ROOT, 'package.json'));

    return Object.entries(pkg['lint-staged']).find(([, commands]) => {
        return [commands].flat().some(command => `${command}`.includes(SELF_REL))
    })?.[0]
}

/**
 * @summary Which verdict inputs a workflow's `pull_request` path filter fails to watch.
 *
 * The guard's verdict changes when any of its inputs changes, so a CI mirror whose filter misses one
 * lets that change merge unexamined. A `pull_request` trigger with no `paths` key runs on every change
 * and watches everything by construction; a workflow with no `pull_request` trigger watches nothing.
 *
 * @param {Object}   workflow parsed workflow YAML
 * @param {String[]} inputs   surface entries plus the files the verdict is reproduced from
 * @returns {String[]} the inputs no filter pattern matches, in input order
 */
function unwatchedInputs(workflow, inputs) {
    const triggers = workflow.on ?? workflow[true];

    if (!triggers || !Object.hasOwn(triggers, 'pull_request')) {
        return [...inputs]
    }

    const patterns = triggers.pull_request?.paths;

    return patterns ? uncoveredInputs(patterns, inputs) : []
}

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
 * @param {Object<String, String|Object>} config.workflows String source, or `{source, defaultTrigger}`
 * @param {Object} [config.clientOnly={}]
 * @param {String} [config.preCommit='npx lint-staged\n']
 * @returns {Object} `{code, output}`
 */
function runFixture({lintStaged, workflows, clientOnly = {}, preCommit = 'npx lint-staged\n'}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-guard-parity-root-'));

    try {
        fs.writeJsonSync(path.join(dir, 'package.json'), {'lint-staged': lintStaged}, {spaces: 4});

        fs.ensureDirSync(path.join(dir, '.husky'));
        fs.writeFileSync(path.join(dir, '.husky/pre-commit'), preCommit);

        Object.entries(workflows).forEach(([file, workflow]) => {
            const
                source         = typeof workflow === 'string' ? workflow : workflow.source,
                defaultTrigger = typeof workflow === 'string' || workflow.defaultTrigger !== false,
                renderedSource = defaultTrigger && !/^on:/m.test(source)
                    ? `on:\n  pull_request:\n    branches: [dev]\n${source}`
                    : source;

            const filePath = path.join(dir, '.github/workflows', file);

            fs.ensureDirSync(path.dirname(filePath));
            fs.writeFileSync(filePath, renderedSource)
        });

        const registryPath = path.join(dir, 'buildScripts/util/check-guard-ci-parity-registry.json');

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

    test('the commit-time carrier triggers on every SCAN_SURFACE input, this guard, and its mirror', () => {
        const pattern = carrierPattern();

        expect(pattern, 'package.json must retain the local parity-guard carrier').toBeTruthy();
        expect(uncoveredInputs([pattern], VERDICT_INPUTS), 'the local carrier must trigger on every input that can change the verdict')
            .toEqual([]);

        expect(fs.readFileSync(path.join(REPO_ROOT, '.husky/pre-commit'), 'utf8').trim())
            .toMatch(/npx lint-staged$/)
    });

    test('RED: a carrier glob that drops a SCAN_SURFACE input is reported, and the input NAMED', () => {
        const pattern = carrierPattern();

        // A literal, and then the glob, whose removal must also uncover the mirror workflow it was covering.
        expect(uncoveredInputs([pattern.replace('.husky/pre-commit,', '')], VERDICT_INPUTS)).toEqual(['.husky/pre-commit']);
        expect(uncoveredInputs([pattern.replace('.github/workflows/**,', '')], VERDICT_INPUTS)).toEqual(['.github/workflows/**', MIRROR_REL])
    });

    test('the CI mirror watches every SCAN_SURFACE input, this guard, and its own workflow', () => {
        const workflow = yaml.load(fs.readFileSync(path.join(REPO_ROOT, MIRROR_REL), 'utf8'));

        expect(SCAN_SURFACE.length, 'the imported surface must not be empty').toBeGreaterThan(0);
        expect(unwatchedInputs(workflow, VERDICT_INPUTS), `${MIRROR_REL} must watch every input that can change the verdict`)
            .toEqual([])
    });

    test('RED: a mirror filter that drops a SCAN_SURFACE input is reported, and the input NAMED', () => {
        const
            inputs  = VERDICT_INPUTS,
            without = pattern => {
                const
                    workflow = yaml.load(fs.readFileSync(path.join(REPO_ROOT, MIRROR_REL), 'utf8')),
                    triggers = workflow.on ?? workflow[true];

                triggers.pull_request.paths = triggers.pull_request.paths.filter(entry => entry !== pattern);

                return workflow
            };

        // A literal, and then the harder shape: dropping the glob must unwatch both the sampled surface
        // entry and this mirror's own file, which only the glob was covering.
        expect(unwatchedInputs(without('package.json'), inputs)).toEqual(['package.json']);
        expect(unwatchedInputs(without('.github/workflows/**'), inputs)).toEqual(['.github/workflows/**', MIRROR_REL])
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

    test('RED: removing this guard commit-time carrier is detected directly', () => {
        const {code, output} = runFixture({
            lintStaged: {
                '*.mjs': ['node ./tools/arbitrary-name.mjs']
            },
            workflows: {
                'arbitrary-lint.yml': `jobs:\n  lint:\n    steps:\n      - run: node ./tools/arbitrary-name.mjs\n`
            }
        });

        expect(code, `the guard must not disappear with its own carrier.\n\n${output}`).toBe(1);
        expect(output).toContain(SELF_REL);
        expect(output).toMatch(/commit-time carrier missing/i)
    });

    test('RED: missing or unreachable Git hook lint-staged carriers are detected directly', () => {
        [
            {label: 'missing', preCommit: ''},
            {label: 'early exit', preCommit: 'exit 0\nnpx lint-staged\n'},
            {label: 'dead branch', preCommit: 'if false; then\n  npx lint-staged\nfi\n'}
        ].forEach(({label, preCommit}) => {
            const {code, output} = runFixture({
                lintStaged: {
                    '*.mjs': [`node ./${SELF_REL}`]
                },
                workflows: {
                    'guard-lint.yml': `jobs:\n  lint:\n    steps:\n      - run: node ./${SELF_REL}\n`
                },
                preCommit
            });

            expect(code, `${label} hook must not certify commit-time reachability.\n\n${output}`).toBe(1);
            expect(output).toContain('.husky/pre-commit');
            expect(output).toMatch(/npx lint-staged.*carrier missing/i)
        })
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
                'guard-lint.yml': `jobs:\n  lint:\n    steps:\n      - run: node ./${SELF_REL}\n`,
                'alpha-lint.yml': `jobs:\n  lint:\n    steps:\n      - run: node ./alpha/shared-name.mjs\n`
            }
        });

        expect(code, `beta/shared-name.mjs has no mirror and must not alias alpha.\n\n${output}`).toBe(1);
        expect(output).toContain('beta/shared-name.mjs');
        expect(output).not.toMatch(/alpha\/shared-name\.mjs\s*$/m)
    });

    test('RED: shell mentions, dead commands, and masked commands are not execution evidence', () => {
        [
            {
                label   : 'YAML comment',
                workflow: '# node ./tools/mentioned-only.mjs\njobs:\n  lint:\n    steps:\n      - run: node ./tools/other.mjs\n'
            },
            {label: 'echo', step: '      - run: "echo node ./tools/mentioned-only.mjs"\n'},
            {label: 'comment', step: '      - run: "# node ./tools/mentioned-only.mjs"\n'},
            {label: 'prefixed executable', step: '      - run: fake-node ./tools/mentioned-only.mjs\n'},
            {label: 'path prefix', step: '      - run: node ./tools/mentioned-only.mjsx\n'},
            {label: 'Node check mode', step: '      - run: node --check ./tools/mentioned-only.mjs\n'},
            {label: 'dead branch', step: '      - run: "if false; then node ./tools/mentioned-only.mjs; fi"\n'},
            {label: 'masked failure', step: '      - run: "node ./tools/mentioned-only.mjs || true"\n'},
            {
                label: 'expression injection',
                step : '      - run: node ./tools/mentioned-only.mjs ${{ matrix.suffix }}\n'
            },
            {label: 'shell directory change', step: '      - run: "cd nested && node ./tools/mentioned-only.mjs"\n'},
            {label: 'continue-on-error', step: '      - continue-on-error: true\n        run: node ./tools/mentioned-only.mjs\n'},
            {label: 'conditional step', step: '      - if: false\n        run: node ./tools/mentioned-only.mjs\n'},
            {
                label   : 'conditional job',
                workflow: 'jobs:\n  lint:\n    if: false\n    steps:\n      - run: node ./tools/mentioned-only.mjs\n'
            },
            {label: 'custom shell', step: '      - shell: "echo {0}"\n        run: node ./tools/mentioned-only.mjs\n'},
            {
                label   : 'inherited workflow shell',
                workflow: 'defaults:\n  run:\n    shell: "echo {0}"\njobs:\n  lint:\n    steps:\n      - run: node ./tools/mentioned-only.mjs\n'
            },
            {
                label   : 'inherited job shell',
                workflow: 'jobs:\n  lint:\n    defaults:\n      run:\n        shell: "echo {0}"\n    steps:\n      - run: node ./tools/mentioned-only.mjs\n'
            },
            {
                label: 'execution-sensitive environment',
                step : '      - env:\n          NODE_OPTIONS: --import=data:text/javascript,process.exit(0)\n        run: node ./tools/mentioned-only.mjs\n'
            },
            {label: 'later status mask', step: '      - run: |\n          node ./tools/mentioned-only.mjs\n          echo masked\n'}
        ].forEach(({label, step, workflow}) => {
            const {code, output} = runFixture({
                lintStaged: {
                    '*.mjs': [
                        `node ./${SELF_REL}`,
                        'node ./tools/mentioned-only.mjs'
                    ]
                },
                workflows: {
                    'guard-lint.yml'  : `jobs:\n  lint:\n    steps:\n      - run: node ./${SELF_REL}\n`,
                    'mention-lint.yml': workflow || `jobs:\n  lint:\n    steps:\n${step}`
                }
            });

            expect(code, `${label} must not certify a CI mirror.\n\n${output}`).toBe(1);
            expect(output).toContain('tools/mentioned-only.mjs')
        })
    });

    test('declarative working-directory preserves the executed script full path', () => {
        const {code, output} = runFixture({
            lintStaged: {
                '*.mjs': [
                    `node ./${SELF_REL}`,
                    'node ./nested/tools/scoped.mjs'
                ]
            },
            workflows: {
                'guard-lint.yml' : `jobs:\n  lint:\n    steps:\n      - run: node ./${SELF_REL}\n`,
                'scoped-lint.yml': 'jobs:\n  lint:\n    steps:\n      - working-directory: nested\n        run: node ./tools/scoped.mjs\n'
            }
        });

        expect(code, `declarative working-directory should resolve the full-path mirror.\n\n${output}`).toBe(0);
        expect(output).toMatch(/\[lint-guard-ci-parity\] OK/)
    });

    test('RED: workflows that do not gate dev pull requests are not mirrors', () => {
        [
            {
                label   : 'triggerless',
                workflow: {source: 'jobs:\n  lint:\n    steps:\n      - run: node ./tools/dead.mjs\n', defaultTrigger: false}
            },
            {
                label   : 'dispatch only',
                workflow: 'on:\n  workflow_dispatch:\njobs:\n  lint:\n    steps:\n      - run: node ./tools/dead.mjs\n'
            },
            {
                label   : 'other branch',
                workflow: 'on:\n  pull_request:\n    branches: [main]\njobs:\n  lint:\n    steps:\n      - run: node ./tools/dead.mjs\n'
            },
            {
                label   : 'post-close only',
                workflow: 'on:\n  pull_request:\n    branches: [dev]\n    types: [closed]\njobs:\n  lint:\n    steps:\n      - run: node ./tools/dead.mjs\n'
            },
            {
                label   : 'ignored paths',
                workflow: 'on:\n  pull_request:\n    branches: [dev]\n    paths-ignore: ["**"]\njobs:\n  lint:\n    steps:\n      - run: node ./tools/dead.mjs\n'
            }
        ].forEach(({label, workflow}) => {
            const {code, output} = runFixture({
                lintStaged: {
                    '*.mjs': [
                        `node ./${SELF_REL}`,
                        'node ./tools/dead.mjs'
                    ]
                },
                workflows: {
                    'guard-lint.yml': `jobs:\n  lint:\n    steps:\n      - run: node ./${SELF_REL}\n`,
                    'dead-lint.yml' : workflow
                }
            });

            expect(code, `${label} must not certify a dev merge gate.\n\n${output}`).toBe(1);
            expect(output).toContain('tools/dead.mjs')
        })
    })
});
