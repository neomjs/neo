import {test, expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import fs             from 'node:fs/promises';
import os             from 'node:os';
import path           from 'node:path';
import process        from 'node:process';

import {
    emitGeneratedData,
    executeCommand,
    GENERATED_DATA_PATHS,
    isGeneratedDataPath,
    gitAuthenticated,
    runDataSyncPipeline,
    scopedStageEnv
} from '../../../../../buildScripts/dataSyncPipeline.mjs';

const generatedFile = 'apps/devindex/resources/data/users.jsonl';

function runGit(cwd, args) {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio   : ['ignore', 'pipe', 'pipe']
    }).trim()
}

async function write(repo, relativePath, content) {
    const filePath = path.join(repo, relativePath);

    await fs.mkdir(path.dirname(filePath), {recursive: true});
    await fs.writeFile(filePath, content)
}

function configureAuthor(repo) {
    runGit(repo, ['config', 'user.name', 'Data Sync Test']);
    runGit(repo, ['config', 'user.email', 'data-sync@example.test'])
}

async function createRepositoryFixture() {
    const
        root   = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-data-sync-')),
        origin = path.join(root, 'origin.git'),
        seed   = path.join(root, 'seed'),
        runner = path.join(root, 'runner'),
        peer   = path.join(root, 'peer');

    runGit(root, ['init', '--bare', '--initial-branch=dev', origin]);
    runGit(root, ['clone', origin, seed]);
    configureAuthor(seed);
    await write(seed, generatedFile, 'generated:v1\n');
    await write(seed, 'apps/portal/resources/data/tickets/index.json', '{"version":1}\n');
    await write(seed, 'apps/portal/sitemap.xml', '<urlset />\n');
    await write(seed, 'apps/portal/llms.txt', 'v1\n');
    await write(seed, 'source.txt', 'v1\n');
    runGit(seed, ['add', '.']);
    runGit(seed, ['commit', '-m', 'initial']);
    runGit(seed, ['push', '-u', 'origin', 'dev']);

    runGit(root, ['clone', '--branch', 'dev', origin, runner]);
    runGit(root, ['clone', '--branch', 'dev', origin, peer]);
    configureAuthor(runner);
    configureAuthor(peer);

    return {origin, peer, root, runner}
}

async function advanceRemote(peer, version) {
    runGit(peer, ['pull', '--ff-only', 'origin', 'dev']);
    await write(peer, 'source.txt', `${version}\n`);
    await write(peer, generatedFile, `peer:${version}\n`);
    runGit(peer, ['add', 'source.txt', generatedFile]);
    runGit(peer, ['commit', '-m', `advance ${version}`]);
    runGit(peer, ['push', 'origin', 'dev'])
}

function readRemoteFile({origin, root}, relativePath) {
    return runGit(root, ['--git-dir', origin, 'show', `dev:${relativePath}`])
}

function remoteSubjects({origin, root}) {
    return runGit(root, ['--git-dir', origin, 'log', '--format=%s', 'dev']).split('\n')
}

test.describe('Data Sync pipeline publisher (#15746)', () => {
    test('defines the explicit generated-data allowlist', () => {
        expect(GENERATED_DATA_PATHS).toEqual([
            ':(glob)apps/devindex/resources/data/*.json*',
            'apps/portal/resources/data',
            'apps/portal/sitemap.xml',
            'apps/portal/llms.txt'
        ]);
        expect(isGeneratedDataPath('apps/devindex/resources/data/users.jsonl')).toBe(true);
        expect(isGeneratedDataPath('apps/devindex/resources/data/nested/users.jsonl')).toBe(false);
        expect(isGeneratedDataPath('apps/portal/resources/data/tickets/index.json')).toBe(true);
        expect(isGeneratedDataPath('apps/portal/sitemap.xml')).toBe(true);
        expect(isGeneratedDataPath('apps/portal/llms.txt')).toBe(true);
        expect(isGeneratedDataPath('src/ManualEdit.mjs')).toBe(false)
    });

    test('runs the complete generated-output emission sequence in order', async () => {
        const calls = [];

        await emitGeneratedData({
            attempt: 1,
            cwd    : '/repo',
            execute: async (command, args, options) => {
                calls.push({args, command, options});
                return {stderr: '', stdout: ''}
            },
            log: () => {},
            // This test owns stage ORDER, not repository access. The real preflight makes a network
            // call and fails closed without an intake token, which is its job — so it is stubbed
            // here rather than weakened there.
            preflight: async () => {}
        });

        expect(calls.map(({args, command}) => [command, ...args])).toEqual([
            ['npm', 'ci'],
            ['npm', 'run', 'devindex:optin'],
            ['npm', 'run', 'devindex:optout'],
            ['npm', 'run', 'devindex:spider', '--', '--strategy', 'random'],
            ['npm', 'run', 'devindex:update', '--', '--limit=200'],
            [process.execPath, './buildScripts/docs/rebuildContentIndexesAndSeo.mjs', '--include-labels']
        ]);
        expect(calls.every(call => call.options.cwd === '/repo')).toBe(true)
    });

    test('publishes one atomic generated commit when dev stays unchanged', async () => {
        const fixture = await createRepositoryFixture();

        try {
            let emissions = 0;

            const result = await runDataSyncPipeline({
                cwd : fixture.runner,
                emit: async ({attempt, cwd}) => {
                    emissions++;
                    await write(cwd, generatedFile, `generated:v1:attempt-${attempt}\n`)
                },
                log: () => {}
            });

            expect(result).toMatchObject({attempts: 1, changed: true, pushed: true});
            expect(emissions).toBe(1);
            expect(readRemoteFile(fixture, generatedFile)).toBe('generated:v1:attempt-1');
            expect(remoteSubjects(fixture)).toEqual([
                'chore(data): Hourly data sync pipeline update [skip ci]',
                'initial'
            ])
        } finally {
            await fs.rm(fixture.root, {recursive: true, force: true})
        }
    });

    test('discards a stale attempt, re-emits from the new dev head, and never rebases or force-pushes', async () => {
        const
            fixture  = await createRepositoryFixture(),
            commands = [];

        try {
            let emissions = 0;

            const result = await runDataSyncPipeline({
                cwd    : fixture.runner,
                execute: async (command, args, options) => {
                    commands.push([command, ...args]);
                    return executeCommand(command, args, options)
                },
                emit: async ({attempt, cwd}) => {
                    emissions++;
                    const source = (await fs.readFile(path.join(cwd, 'source.txt'), 'utf8')).trim();

                    await write(cwd, generatedFile, `generated:${source}:attempt-${attempt}\n`);

                    if (attempt === 1) {
                        await advanceRemote(fixture.peer, 'v2')
                    }
                },
                log: () => {}
            });

            expect(result).toMatchObject({attempts: 2, changed: true, pushed: true});
            expect(emissions).toBe(2);
            expect(readRemoteFile(fixture, generatedFile)).toBe('generated:v2:attempt-2');
            expect(remoteSubjects(fixture)).toEqual([
                'chore(data): Hourly data sync pipeline update [skip ci]',
                'advance v2',
                'initial'
            ]);
            expect(commands.some(([, ...args]) => args.includes('rebase'))).toBe(false);
            expect(commands.some(([, ...args]) => args.some(arg => arg.startsWith('--force')))).toBe(false)
        } finally {
            await fs.rm(fixture.root, {recursive: true, force: true})
        }
    });

    test('cleans the runner and fails explicitly when dev advances during both attempts', async () => {
        const
            fixture = await createRepositoryFixture(),
            logs    = [];

        try {
            await expect(runDataSyncPipeline({
                cwd : fixture.runner,
                emit: async ({attempt, cwd}) => {
                    const source = (await fs.readFile(path.join(cwd, 'source.txt'), 'utf8')).trim();

                    await write(cwd, generatedFile, `generated:${source}:attempt-${attempt}\n`);
                    await advanceRemote(fixture.peer, `v${attempt + 1}`)
                },
                log: message => logs.push(message)
            })).rejects.toThrow(/dev advanced during all 2 emission attempts/u);

            expect(runGit(fixture.runner, ['rev-parse', 'HEAD'])).toBe(
                runGit(fixture.runner, ['rev-parse', 'origin/dev'])
            );
            expect(runGit(fixture.runner, ['status', '--porcelain'])).toBe('');
            expect(remoteSubjects(fixture)).toEqual(['advance v3', 'advance v2', 'initial']);
            expect(logs.some(message => message.includes('attempt=2/2'))).toBe(true)
        } finally {
            await fs.rm(fixture.root, {recursive: true, force: true})
        }
    });

    test('stages only allowlisted output even when emission touches an unrelated tracked file', async () => {
        const fixture = await createRepositoryFixture();

        try {
            await write(fixture.runner, 'source.txt', 'manual-local-change\n');

            await runDataSyncPipeline({
                cwd : fixture.runner,
                emit: async ({cwd}) => {
                    await write(cwd, generatedFile, 'generated:v1:allowlisted\n');
                    await write(cwd, 'source.txt', 'manual-emission-change\n')
                },
                log: () => {}
            });

            const publishedPaths = runGit(fixture.root, [
                '--git-dir',
                fixture.origin,
                'show',
                '--format=',
                '--name-only',
                'dev'
            ]).split('\n').filter(Boolean);

            expect(publishedPaths).toEqual([generatedFile]);
            expect(readRemoteFile(fixture, 'source.txt')).toBe('v1')
        } finally {
            await fs.rm(fixture.root, {recursive: true, force: true})
        }
    });

    test('the workflow delegates publication to the bounded publisher', async () => {
        const workflow = await fs.readFile(
            path.resolve(process.cwd(), '.github/workflows/data-sync-pipeline.yml'),
            'utf8'
        );

        expect(workflow).toContain('node ./buildScripts/dataSyncPipeline.mjs');
        expect(workflow).toContain('fetch-depth: 0');
        expect(workflow).not.toContain('git pull origin dev --rebase');
        expect(workflow).not.toContain('git push origin dev');

        // The publishing paths stay pinned to `dev`; only a preflight-only dispatch follows the
        // dispatched ref. This replaced a literal `ref: dev`, which could not express that a
        // pipeline change was untestable before merge — the defect the conditional fixes.
        expect(workflow).toContain("inputs.preflight_only) && github.ref || 'dev'");

        // The credential must not survive in `.git/config`: with the checkout default, stripping a
        // stage's ENV isolates nothing at the git layer, and any collection stage could push as the
        // ruleset-bypass identity.
        expect(workflow).toContain('persist-credentials: false');

        // A preflight-only dispatch must not reach the pages push. Without this guard it did —
        // 167 files to `pages/main` while the run logged "skipping collection and publish", because
        // a short-circuit inside the pipeline step cannot bound the steps after it.
        expect(workflow).toContain("if: ${{ !(github.event_name == 'workflow_dispatch' && inputs.preflight_only) }}")
    })
});

/**
 * Credential scoping across emission stages.
 *
 * The pipeline carries two identities with different authority: an INTAKE credential that may read
 * and comment on the DevIndex opt-in/opt-out repositories, and a PUBLISHER credential that may write
 * this repository and bypass the code-scanning ruleset. The runner previously handed `process.env`
 * to every stage, so the ruleset-bypass identity was in scope during arbitrary data collection.
 *
 * Every assertion below checks by VALUE across the whole environment rather than by reading one key.
 * That distinction is not stylistic: the first implementation stripped `GH_TOKEN`/`GITHUB_TOKEN` and
 * left `DATA_SYNC_PUBLISHER_TOKEN` in place, so a per-key check reported perfect isolation while the
 * publisher credential sat one `process.env` lookup away from every intake child.
 */
test.describe('emission-stage credential scoping', () => {
    const parentEnv = {
        PATH                     : '/usr/bin',
        GH_TOKEN                 : 'ambient-gh',
        GITHUB_TOKEN             : 'ambient-default',
        DATA_SYNC_INTAKE_TOKEN   : 'INTAKE-secret',
        DATA_SYNC_PUBLISHER_TOKEN: 'PUBLISHER-secret'
    };

    const values = env => Object.values(env);

    test('an intake stage cannot see the publisher credential ANYWHERE in its environment', () => {
        const env = scopedStageEnv('intake', parentEnv);

        expect(env.GITHUB_TOKEN).toBe('INTAKE-secret');
        expect(values(env)).not.toContain('PUBLISHER-secret');
        expect(values(env)).not.toContain('ambient-default')
    });

    test('a publisher stage cannot see the intake credential', () => {
        const env = scopedStageEnv('publisher', parentEnv);

        expect(env.GITHUB_TOKEN).toBe('PUBLISHER-secret');
        expect(values(env)).not.toContain('INTAKE-secret')
    });

    test('a `none` stage runs with NO github credential — ambient tokens do not survive', () => {
        const env = scopedStageEnv('none', parentEnv);

        expect(env.GITHUB_TOKEN).toBeUndefined();
        expect(env.GH_TOKEN).toBeUndefined();
        expect(values(env)).not.toContain('ambient-default');
        expect(values(env)).not.toContain('INTAKE-secret');
        expect(values(env)).not.toContain('PUBLISHER-secret')
    });

    test('non-credential environment is preserved for every scope', () => {
        for (const scope of ['none', 'intake', 'publisher']) {
            expect(scopedStageEnv(scope, parentEnv).PATH, scope).toBe('/usr/bin')
        }
    });

    test('a missing scoped token yields no credential rather than falling back to ambient', () => {
        // Fail closed: an unconfigured intake secret must not silently run on whatever the runner
        // happened to export, which is how the single-token pipeline masked its own boundary.
        const env = scopedStageEnv('intake', {PATH: '/usr/bin', GITHUB_TOKEN: 'ambient-default'});

        expect(env.GITHUB_TOKEN).toBeUndefined();
        expect(values(env)).not.toContain('ambient-default')
    });

    test('every declared emission stage carries an explicit scope, and only intake/none collect data', async () => {
        // Guards the annotation itself: a new stage added without `tokenScope` would inherit
        // `undefined`, land in the `none` branch, and look deliberate. This makes omission visible.
        const calls = [];

        await emitGeneratedData({
            attempt: 1,
            cwd    : '/tmp',
            execute: async (command, args, {env}) => {
                calls.push({command, token: env.GITHUB_TOKEN ?? null})
            },
            log      : () => {},
            preflight: async () => {}
        });

        expect(calls.length).toBeGreaterThan(0);
        // No emission stage may run with the publisher credential; publication is a separate phase.
        expect(calls.every(call => call.token !== 'PUBLISHER-secret')).toBe(true)
    });
});

/**
 * An undeclared `tokenScope` is an unanswered question about which identity a stage is entitled
 * to, not a default. It previously fell through to the `none` branch, so a stage added without one
 * ran credential-less and looked deliberate — and a spec comment asserted this was visible when
 * nothing distinguished "declared none" from "forgot to declare".
 */
test.describe('tokenScope validation fails closed', () => {
    test('an unrecognised or missing scope throws rather than defaulting', () => {
        for (const scope of [undefined, null, '', 'publishr', 'PUBLISHER']) {
            expect(() => scopedStageEnv(scope, {}), String(scope)).toThrow(/must declare one of/)
        }
    });

    test('the three declared scopes are accepted', () => {
        for (const scope of ['none', 'intake', 'publisher']) {
            expect(() => scopedStageEnv(scope, {}), scope).not.toThrow()
        }
    });

    test('every shipped emission stage declares a valid scope', async () => {
        // Reaches the real stage table: a stage added without `tokenScope` now fails here rather
        // than at runtime in CI, where it would present as an opaque auth error.
        await expect(emitGeneratedData({
            attempt  : 1,
            cwd      : '/tmp',
            execute  : async () => {},
            log      : () => {},
            preflight: async () => {}
        })).resolves.toBeUndefined()
    });
});

/**
 * Credential exposure through argv and failure logs.
 *
 * An earlier fix moved the Publisher credential OUT of `.git/config` (where `persist-credentials`
 * had left it for the whole job) and into a `-c http.extraheader=...` argument — which made it
 * worse in a way config never was: argv is visible in `ps`, and this module interpolates
 * `args.join(' ')` into its failure message, so a failed push would PRINT a working
 * ruleset-bypass credential into the CI log.
 *
 * Base64 is not redaction. GitHub Actions masks the literal secret string, so a transformed secret
 * does not match its own mask — the leak would have been plain, decodable and public. Masking
 * therefore cannot be the last line, which is why redaction here is by SHAPE rather than by
 * matching a known value.
 */
test.describe('credential never reaches argv or failure output', () => {
    test('a failing command redacts credential-shaped arguments', async () => {
        const secret = 'ghs_TESTSECRET_should_never_print',
              header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${secret}`).toString('base64')}`;

        let message = '';

        await executeCommand('git', ['-c', `http.extraheader=${header}`, 'push'], {
            capture: true,
            cwd    : os.tmpdir()
        }).catch(error => {message = error.message});

        expect(message).toBeTruthy();
        expect(message).not.toContain(secret);
        // The base64 form is the one masking would miss, so it is the one worth asserting on.
        expect(message).not.toMatch(/basic [A-Za-z0-9+/=]{10,}/);
        expect(message).toContain('<redacted>')
    });

    test('redaction keys on shape, so an unknown future secret is covered too', async () => {
        let message = '';

        await executeCommand('git', ['-c', 'http.extraheader=Authorization: bearer whatever', 'push'], {
            capture: true,
            cwd    : os.tmpdir()
        }).catch(error => {message = error.message});

        expect(message).toContain('<redacted>');
        expect(message).not.toContain('whatever')
    });

    test('ordinary arguments are still shown — redaction must not blind the diagnostic', async () => {
        let message = '';

        await executeCommand('git', ['push', 'origin', 'HEAD:dev'], {
            capture: true,
            cwd    : os.tmpdir()
        }).catch(error => {message = error.message});

        expect(message).toContain('push');
        expect(message).toContain('origin');
        expect(message).not.toContain('<redacted>')
    });
});

/**
 * The ACTUAL argv witness.
 *
 * The redaction tests above call `executeCommand` with synthetic arguments, so they prove the
 * failure message is scrubbed and nothing else. A regression that put the credential back into
 * `-c http.extraheader=<secret>` would still pass them — redaction would hide it in the message
 * while `ps` exposure silently returned. A test that cannot fail on the defect it exists to prevent
 * is not coverage.
 *
 * These assert the real `gitAuthenticated` boundary instead: the credential must be ABSENT from
 * every argument and PRESENT only in the child environment.
 */
test.describe('gitAuthenticated keeps the credential out of argv', () => {
    const secret = 'ghs_ARGV_WITNESS_SECRET';

    test.afterEach(() => {
        delete process.env.DATA_SYNC_PUBLISHER_TOKEN
    });

    test('no argument contains the raw OR derived credential', async () => {
        process.env.DATA_SYNC_PUBLISHER_TOKEN = secret;

        let seenArgs = null, seenEnv = null;

        await gitAuthenticated(
            async (command, args, options) => {seenArgs = args; seenEnv = options.env; return {stderr: '', stdout: ''}},
            '/repo',
            ['push', 'origin', 'HEAD:dev']
        );

        const argv    = seenArgs.join(' '),
              derived = Buffer.from(`x-access-token:${secret}`).toString('base64');

        expect(argv).not.toContain(secret);
        // The base64 form is the one Actions masking would MISS, so it is the one that matters.
        expect(argv).not.toContain(derived);
        expect(argv).not.toContain('http.extraheader');
        expect(seenArgs).toEqual(['push', 'origin', 'HEAD:dev'])
    });

    test('the credential arrives only through the child environment', async () => {
        process.env.DATA_SYNC_PUBLISHER_TOKEN = secret;

        let seenEnv = null;

        await gitAuthenticated(
            async (command, args, options) => {seenEnv = options.env; return {stderr: '', stdout: ''}},
            '/repo',
            ['fetch', 'origin']
        );

        expect(seenEnv.GIT_CONFIG_COUNT).toBe('1');
        expect(seenEnv.GIT_CONFIG_KEY_0).toBe('http.extraheader');
        expect(seenEnv.GIT_CONFIG_VALUE_0).toContain(Buffer.from(`x-access-token:${secret}`).toString('base64'))
    });

    test('with no publisher token it degrades to a plain git call, adding no config', async () => {
        let seenArgs = null, seenEnv = null;

        await gitAuthenticated(
            async (command, args, options) => {seenArgs = args; seenEnv = options.env; return {stderr: '', stdout: ''}},
            '/repo',
            ['fetch', 'origin']
        );

        expect(seenArgs).toEqual(['fetch', 'origin']);
        expect(seenEnv?.GIT_CONFIG_COUNT).toBeUndefined()
    });
});
