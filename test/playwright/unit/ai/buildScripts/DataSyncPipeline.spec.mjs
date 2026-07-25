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
            log: () => {}
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
        expect(workflow).toContain('ref: dev');
        expect(workflow).toContain('fetch-depth: 0');
        expect(workflow).not.toContain('git pull origin dev --rebase');
        expect(workflow).not.toContain('git push origin dev')
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
            log: () => {}
        });

        expect(calls.length).toBeGreaterThan(0);
        // No emission stage may run with the publisher credential; publication is a separate phase.
        expect(calls.every(call => call.token !== 'PUBLISHER-secret')).toBe(true)
    });
});
