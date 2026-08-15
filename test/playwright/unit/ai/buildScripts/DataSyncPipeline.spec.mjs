import {test, expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import fs             from 'node:fs/promises';
import os             from 'node:os';
import path           from 'node:path';
import process        from 'node:process';

import {CREDENTIAL_FAMILIES} from '../../../../../ai/services/fleet/redactCredentials.mjs';

import {
    aggregateDeferredFailures,
    classifyStageFailure,
    describeStageFailure,
    emitGeneratedData,
    executeCommand,
    GENERATED_DATA_PATHS,
    isGeneratedDataPath,
    gitAuthenticated,
    rawCredentialNames,
    runDataSyncPipeline,
    scopedStageEnv,
    STAGE_FAILURE_CLASS
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
    await write(seed, 'resources/content/.sync-metadata.json', '{}\n');
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
            'apps/portal/llms.txt',
            'resources/content'
        ]);
        expect(isGeneratedDataPath('apps/devindex/resources/data/users.jsonl')).toBe(true);
        expect(isGeneratedDataPath('apps/devindex/resources/data/nested/users.jsonl')).toBe(false);
        expect(isGeneratedDataPath('apps/portal/resources/data/tickets/index.json')).toBe(true);
        expect(isGeneratedDataPath('apps/portal/sitemap.xml')).toBe(true);
        expect(isGeneratedDataPath('apps/portal/llms.txt')).toBe(true);
        expect(isGeneratedDataPath('resources/content/.sync-metadata.json')).toBe(true);
        expect(isGeneratedDataPath('resources/content/archive/pulls/v13.0.0/chunk-1/pull-1.md')).toBe(true);
        expect(isGeneratedDataPath('.neo-ai-data/concepts/nodes.jsonl')).toBe(false);
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
            [process.execPath, './ai/scripts/maintenance/syncGithubWorkflow.mjs', '--emit-only'],
            ['npm', 'run', 'devindex:optin'],
            ['npm', 'run', 'devindex:optout'],
            ['npm', 'run', 'devindex:spider', '--', '--strategy', 'random'],
            ['npm', 'run', 'devindex:update', '--', '--limit=200'],
            [process.execPath, './buildScripts/docs/rebuildContentIndexesAndSeo.mjs', '--include-labels']
        ]);
        expect(calls.every(call => call.options.cwd === '/repo')).toBe(true)
    });

    test('publishes one atomic corpus and Portal projection commit when dev stays unchanged', async () => {
        const fixture = await createRepositoryFixture();

        try {
            let emissions = 0;

            const result = await runDataSyncPipeline({
                cwd : fixture.runner,
                emit: async ({attempt, cwd}) => {
                    emissions++;
                    await write(cwd, generatedFile, `generated:v1:attempt-${attempt}\n`);
                    await write(cwd, 'resources/content/issues/chunk-10/issue-15977.md', '# Issue 15977\n');
                    await write(cwd, 'apps/portal/resources/data/tickets/index.json', '{"version":2}\n');
                    await write(
                        cwd,
                        'apps/portal/resources/data/pulls/latest/active-chunk-5.json',
                        '{"records":[]}\n'
                    );
                    await write(cwd, 'apps/portal/sitemap.xml', '<urlset><url /></urlset>\n');
                    await write(cwd, 'apps/portal/llms.txt', 'v2\n')
                },
                log: () => {}
            });

            expect(result).toMatchObject({attempts: 1, changed: true, pushed: true});
            expect(emissions).toBe(1);
            expect(readRemoteFile(fixture, generatedFile)).toBe('generated:v1:attempt-1');
            expect(readRemoteFile(
                fixture,
                'resources/content/issues/chunk-10/issue-15977.md'
            )).toBe('# Issue 15977');
            expect(readRemoteFile(
                fixture,
                'apps/portal/resources/data/tickets/index.json'
            )).toBe('{"version":2}');
            expect(readRemoteFile(
                fixture,
                'apps/portal/resources/data/pulls/latest/active-chunk-5.json'
            )).toBe('{"records":[]}');
            expect(readRemoteFile(fixture, 'apps/portal/sitemap.xml')).toBe('<urlset><url /></urlset>');
            expect(readRemoteFile(fixture, 'apps/portal/llms.txt')).toBe('v2');
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
        // repository-write identity.
        expect(workflow).toContain('persist-credentials: false');

        // The job's IMPLICIT token must not carry write. It is not merely unused: an action can
        // reach `github.token` even when the workflow never passes GITHUB_TOKEN, so an unused write
        // grant is a reachable one that per-stage env scoping cannot revoke. Leaving it at `write`
        // meant three repository-write credentials were alive while this workflow claimed two.
        expect(workflow).toContain('contents: read');
        expect(workflow).toContain('discussions: read');
        expect(workflow).toContain('pull-requests: read');
        expect(workflow).not.toMatch(/permissions:\s*\n\s*#[^\n]*\n(\s*#[^\n]*\n)*\s*contents: write/);

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
 * CONTENTS to this repository. The runner previously handed `process.env`
 * to every stage, so the repository-write identity was in scope during arbitrary data collection.
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
        DATA_SYNC_PUBLISHER_TOKEN: 'PUBLISHER-secret',
        DATA_SYNC_READER_TOKEN   : 'READER-secret'
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
        expect(values(env)).not.toContain('PUBLISHER-secret');
        // The reader source joins the strip set by DERIVATION, not by a second hand-maintained list.
        // A scope whose source is added to the vocabulary but forgotten in the strip list leaks
        // silently into every other stage — the exact failure the publisher variable had first time.
        expect(values(env)).not.toContain('READER-secret')
    });

    test('a reader stage sees ONLY the reader credential — neither App token reaches it', () => {
        const env = scopedStageEnv('reader', parentEnv);

        expect(env.GITHUB_TOKEN).toBe('READER-secret');
        expect(env.GH_TOKEN).toBe('READER-secret');
        expect(values(env)).not.toContain('INTAKE-secret');
        expect(values(env)).not.toContain('PUBLISHER-secret');
        expect(values(env)).not.toContain('ambient-default')
    });

    test('an intake or publisher stage cannot see the reader credential either', () => {
        // The grant is read-only, which makes it the easiest one to be careless with. It is still a
        // credential, and a stage granted a DIFFERENT identity must not find it lying around.
        for (const scope of ['intake', 'publisher']) {
            expect(values(scopedStageEnv(scope, parentEnv)), scope).not.toContain('READER-secret')
        }
    });

    test('non-credential environment is preserved for every scope', () => {
        for (const scope of ['none', 'intake', 'publisher', 'reader']) {
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

    test('every declared emission stage carries an explicit scope and none receives the publisher', async () => {
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

    test('the four declared scopes are accepted', () => {
        for (const scope of ['none', 'intake', 'publisher', 'reader']) {
            expect(() => scopedStageEnv(scope, {}), scope).not.toThrow()
        }
    });

    test('an INHERITED object property is not a declared scope', () => {
        // The vocabulary is an object now, so membership must be `Object.hasOwn` and not `in`:
        // `'toString' in stageTokenSources` is true, which would accept a scope nobody declared and
        // resolve its source to a FUNCTION. This test is what separates the two implementations.
        for (const scope of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
            expect(() => scopedStageEnv(scope, {}), scope).toThrow(/must declare one of/)
        }
    });

    test('the failure names every scope a stage may declare, including the newest', () => {
        // The message is the only place a stage author learns the vocabulary. A hardcoded list drifts
        // from the real one silently — this asserts the message is derived from it.
        for (const scope of ['none', 'intake', 'publisher', 'reader']) {
            expect(() => scopedStageEnv('nope', {}), scope).toThrow(new RegExp(scope))
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

    test('the label-reading stage declares a credentialled scope, NOT `none` (#15993)', async () => {
        // THE defect, asserted against the shipped table rather than a fixture. `content indexes and
        // SEO` runs `rebuildContentIndexesAndSeo.mjs --include-labels`, which pages this repository's
        // labels over GraphQL — a credentialled read. It declared `none`, so `scopedStageEnv` handed
        // it a child with no token and it failed on its own missing-auth path, correctly and for nine
        // days. Reverting the declaration to `none` fails here.
        //
        // Read from the emitted LOG rather than the child env: the log line is what the stage table
        // declares, whereas the env additionally depends on which secrets the runner exported — a
        // machine with no `DATA_SYNC_READER_TOKEN` would make an env assertion pass for the wrong
        // reason.
        const lines = [];

        await emitGeneratedData({
            attempt  : 1,
            cwd      : '/tmp',
            execute  : async () => {},
            log      : line => lines.push(line),
            preflight: async () => {}
        });

        const labelStage = lines.find(line => line.includes('stage=content indexes and SEO'));

        expect(labelStage, 'the label stage must still be in the shipped table').toBeTruthy();
        expect(labelStage).toContain('credential=reader');
        expect(labelStage).not.toContain('credential=none')
    });

    test('the corpus stage is pull-only under the reader identity (#15977)', async () => {
        const
            calls             = [],
            originalPublisher = process.env.DATA_SYNC_PUBLISHER_TOKEN,
            originalReader    = process.env.DATA_SYNC_READER_TOKEN;

        process.env.DATA_SYNC_PUBLISHER_TOKEN = 'PUBLISHER-corpus-stage-test';
        process.env.DATA_SYNC_READER_TOKEN    = 'READER-corpus-stage-test';

        try {
            await emitGeneratedData({
                attempt  : 1,
                cwd      : '/tmp',
                execute  : async (command, args, {env}) => calls.push({args, command, token: env.GITHUB_TOKEN}),
                log      : () => {},
                preflight: async () => {}
            });

            const corpus = calls.find(({args}) => args.includes('--emit-only'));

            expect(corpus).toMatchObject({
                args   : ['./ai/scripts/maintenance/syncGithubWorkflow.mjs', '--emit-only'],
                command: process.execPath,
                token  : 'READER-corpus-stage-test'
            })
        } finally {
            if (originalPublisher === undefined) {
                delete process.env.DATA_SYNC_PUBLISHER_TOKEN
            } else {
                process.env.DATA_SYNC_PUBLISHER_TOKEN = originalPublisher
            }

            if (originalReader === undefined) {
                delete process.env.DATA_SYNC_READER_TOKEN
            } else {
                process.env.DATA_SYNC_READER_TOKEN = originalReader
            }
        }
    });

    test('defers a corpus-stage failure until safe generated progress is published (#15977)', async () => {
        const fixture = await createRepositoryFixture();

        try {
            const corpusFailure = new Error('discussion resource limit');

            await expect(runDataSyncPipeline({
                cwd : fixture.runner,
                emit: async ({cwd}) => {
                    await write(cwd, generatedFile, 'generated:partial-progress\n');
                    return {deferredError: corpusFailure}
                },
                log: () => {}
            })).rejects.toBe(corpusFailure);

            expect(readRemoteFile(fixture, generatedFile)).toBe('generated:partial-progress');
            expect(remoteSubjects(fixture)[0]).toBe('chore(data): Hourly data sync pipeline update [skip ci]')
        } finally {
            await fs.rm(fixture.root, {recursive: true, force: true})
        }
    });

    test('a failing stage names the scope it was granted, not just the child error', async () => {
        // A bare child failure reads as "the tool is broken" when the finding is "this stage was
        // granted `none` and needs a credential". That misreading cost real diagnosis time: the
        // child's own missing-auth message advised an interactive login CI cannot perform, so the
        // declared-scope context is the part that makes the failure diagnosable at all.
        //
        // The annotation must therefore carry BOTH the stage label and its declared scope --
        // asserting only that the original error survives would pass without the annotation.
        const failure = new Error('child exited with code 1');

        await expect(emitGeneratedData({
            attempt  : 1,
            cwd      : '/tmp',
            execute  : async () => { throw failure },
            log      : () => {},
            preflight: async () => {}
        })).rejects.toThrow(/stage "install dependencies"[\s\S]*Declared credential scope: `none`/);

        // the child's own message is preserved, not replaced -- the annotation prefixes context
        expect(failure.message).toContain('child exited with code 1');

        // ...and a generic child error is reported as UNRECOGNIZED rather than as a credential
        // cause. The scope is context; it was never evidence about why the child died.
        expect(failure.message).toContain('UNRECOGNIZED')
    });

    test('the failure lead states the OBSERVED class, never a cause the scope cannot establish', () => {
        // Twenty consecutive Data Sync runs died on `Cannot find package 'chromadb'` while the
        // operator-visible last line read "failed under declared credential scope `reader`". The
        // annotation knows what the stage was ENTITLED to, not why it died, and led with the latter.
        const dependency = Object.assign(new Error(
                  "Cannot find package 'chromadb' imported from ai/services/knowledge-base/ChromaManager.mjs"
              ), {code: 'ERR_MODULE_NOT_FOUND'}),
              entrypoint = Object.assign(new Error('spawn node ENOENT'), {code: 'ENOENT'}),
              auth       = new Error('HttpError: Bad credentials (401)'),
              generic    = new Error('child exited with code 1');

        expect(classifyStageFailure(dependency)).toBe(STAGE_FAILURE_CLASS.dependency);
        expect(classifyStageFailure(entrypoint)).toBe(STAGE_FAILURE_CLASS.entrypoint);
        expect(classifyStageFailure(auth)).toBe(STAGE_FAILURE_CLASS.authentication);
        expect(classifyStageFailure(generic)).toBe(STAGE_FAILURE_CLASS.unrecognized);

        // The regression witness: a packaging failure must say so, and must NOT read as auth.
        expect(describeStageFailure(dependency)).toContain('NOT an authentication one');
        expect(describeStageFailure(dependency)).toMatch(/packaging|not installed/);

        // The case the annotation was originally built for must not regress.
        expect(describeStageFailure(auth)).toContain('AUTHENTICATION');
        expect(describeStageFailure(auth)).toContain('never an ambient credential');

        // An unknown class states that it is unknown rather than asserting any cause.
        expect(describeStageFailure(generic)).toContain('UNRECOGNIZED');
        expect(describeStageFailure(generic)).not.toMatch(/AUTHENTICATION|packaging/)
    });

    test('module resolution is classified before the auth heuristic — a stack trace can contain "permission"', () => {
        // Order guard: an auth-shaped substring inside an unrelated trace must not outrank an
        // unambiguous ERR_MODULE_NOT_FOUND.
        const mixed = Object.assign(
            new Error("Cannot find package 'chromadb'\n    at checkPermission (/app/permission denied.mjs:1:1)"),
            {code: 'ERR_MODULE_NOT_FOUND'}
        );

        expect(classifyStageFailure(mixed)).toBe(STAGE_FAILURE_CLASS.dependency)
    });

    test('a stack-frame LINE NUMBER of 401 or 403 is not an auth failure', () => {
        // stderr folds into `error.message` at the spawn site, so a stack trace is the ordinary
        // content of the classified string. A bare `\b(401|403)\b` matches `:401:` — `:` is a
        // non-word character on both sides — so an unrelated crash deep in a long file would have
        // led with AUTHENTICATION, which is the exact over-claim this classifier exists to end.
        // Found in review by @neo-opus-vega.
        const lineNumbered = new Error(
            'TypeError: Cannot read properties of undefined (reading \'push\')\n' +
            '    at emitCorpus (/repo/buildScripts/dataSyncPipeline.mjs:401:9)\n' +
            '    at async run (/repo/buildScripts/dataSyncPipeline.mjs:403:5)'
        );

        expect(classifyStageFailure(lineNumbered)).toBe(STAGE_FAILURE_CLASS.unrecognized);
        expect(describeStageFailure(lineNumbered)).not.toContain('AUTHENTICATION')
    });

    test('a 401 or 403 in HTTP context IS still auth — the narrowing did not delete the capability', () => {
        // Positive control for the test above. Without it, deleting the numeric half entirely would
        // pass the line-number witness while silently dropping every code-only auth failure.
        const codes = [
            new Error('request failed: HTTP/1.1 401'),
            new Error('github api responded with status: 403'),
            new Error('remote returned 403 Forbidden')
        ];

        for (const error of codes) {
            expect(classifyStageFailure(error), error.message).toBe(STAGE_FAILURE_CLASS.authentication)
        }
    });
});

/**
 * An optional DevIndex enrichment read must not decide whether the corpus publishes.
 *
 * `DevIndex Opt-In` is stage 3 of 7 and threw straight out of the emission loop, so a GitHub-side
 * denial on its stargazer read skipped stages 4-7 — including `content indexes and SEO`, which is
 * what makes the corpus consumable — and the publish path below the loop was never reached. The
 * corpus generated one stage earlier was discarded: `resources/content/**` on `dev` froze for
 * nineteen hours while every downstream consumer (portal data, KB ingestion) read the stale mirror.
 *
 * The isolation must not become suppression. The run still has to exit non-zero, because a green
 * pipeline would assert a DevIndex intake that is in fact dead — so every test below that proves the
 * corpus published is paired with one proving the run still failed.
 */
test.describe('an intake denial cannot freeze corpus publication (#17148)', () => {
    /** Fails exactly the stages whose npm script is named, so one denial can be aimed at a stage set. */
    const failingScripts = scripts => async (_command, args) => {
        if (args.some(arg => scripts.includes(arg))) {
            throw new Error(`Resource not accessible by integration (${args.join(' ')})`)
        }
    };

    test('a denied Opt-In no longer aborts emission — every later stage still runs', async () => {
        const lines = [];

        const {deferredError} = await emitGeneratedData({
            attempt  : 1,
            cwd      : '/tmp',
            execute  : failingScripts(['devindex:optin']),
            log      : line => lines.push(line),
            preflight: async () => {}
        });

        // The decisive assertion: this stage runs AFTER all four intake stages and is what makes the
        // corpus consumable. Before the deferral flag the loop threw three stages earlier.
        expect(lines.some(line => line.includes('stage=content indexes and SEO'))).toBe(true);
        expect(lines.some(line => line.includes('stage=DevIndex Opt-Out'))).toBe(true);
        // Deferred, never dropped — the caller still receives the failure to rethrow after publish.
        expect(deferredError.message).toContain('DevIndex Opt-In')
    });

    test('the corpus publishes AND the run still fails when Opt-In is denied', async () => {
        const fixture = await createRepositoryFixture();

        try {
            await expect(runDataSyncPipeline({
                cwd : fixture.runner,
                emit: async ({attempt, cwd, log}) => {
                    await write(cwd, generatedFile, 'generated:corpus-despite-denial\n');

                    return emitGeneratedData({
                        attempt,
                        cwd,
                        execute  : failingScripts(['devindex:optin']),
                        log,
                        preflight: async () => {}
                    })
                },
                log: () => {}
            })).rejects.toThrow(/DevIndex Opt-In/);

            // Both halves ARE the finding, and each alone would be the wrong outcome: the corpus
            // reached `dev` (the freeze is over) and the run still failed (the alarm is not silenced).
            expect(readRemoteFile(fixture, generatedFile)).toBe('generated:corpus-despite-denial');
            expect(remoteSubjects(fixture)[0]).toBe('chore(data): Hourly data sync pipeline update [skip ci]')
        } finally {
            await fs.rm(fixture.root, {recursive: true, force: true})
        }
    });

    test('every deferred stage failure is named, not just the last one', async () => {
        // One credential denial fails all four DevIndex stages, so a single `deferredError` slot
        // reported whichever ran last and silently dropped the rest — sizing the outage wrong.
        const {deferredError} = await emitGeneratedData({
            attempt  : 1,
            cwd      : '/tmp',
            execute  : failingScripts(['devindex:optin', 'devindex:optout', 'devindex:update']),
            log      : () => {},
            preflight: async () => {}
        });

        expect(deferredError.message).toContain('DevIndex Opt-In');
        expect(deferredError.message).toContain('DevIndex Opt-Out');
        expect(deferredError.message).toContain('DevIndex Updater');
        expect(deferredError.errors).toHaveLength(3)
    });

    test('a lone deferred failure is reported unwrapped, not buried under a count of one', async () => {
        const {deferredError} = await emitGeneratedData({
            attempt  : 1,
            cwd      : '/tmp',
            execute  : failingScripts(['devindex:spider']),
            log      : () => {},
            preflight: async () => {}
        });

        expect(deferredError).not.toBeInstanceOf(AggregateError);
        expect(deferredError.message).toContain('DevIndex Spider')
    });

    test('aggregateDeferredFailures keeps the originals reachable, not just their text', () => {
        const failures = [new Error('first cause'), new Error('second cause')];
        const folded   = aggregateDeferredFailures(failures);

        // The message carries both because a CI log tail shows the message and nothing else...
        expect(folded.message).toContain('first cause');
        expect(folded.message).toContain('second cause');
        // ...while `errors` keeps them inspectable for anything reading them programmatically.
        expect(folded.errors).toEqual(failures);
        expect(aggregateDeferredFailures([failures[0]])).toBe(failures[0])
    });

    test('a preflight denial defers and SKIPS the intake stages instead of aborting the run', async () => {
        const
            denial   = new Error('[DataSync preflight] neomjs/devindex-opt-in DENIED (OptIn stargazer read)'),
            executed = [],
            lines    = [];

        const {deferredError} = await emitGeneratedData({
            attempt  : 1,
            cwd      : '/tmp',
            execute  : async (_command, args) => {executed.push(args.join(' '))},
            log      : line => lines.push(line),
            preflight: async () => {throw denial}
        });

        // Rethrowing here would re-couple publication to the intake identity one layer ABOVE the
        // stage table that just decoupled it — the corpus would stay frozen, only faster.
        expect(deferredError).toBe(denial);

        // The intake stages are skipped: the preflight already proved they fail the same way, so
        // running them would report one cause four times.
        expect(executed.some(args => args.includes('devindex:'))).toBe(false);
        expect(lines.some(line => line.includes('reason=intake-preflight-denied'))).toBe(true);

        // The reader-scoped stages still run — that is what leaves a corpus worth publishing.
        expect(executed.some(args => args.includes('--emit-only'))).toBe(true);
        expect(executed.some(args => args.includes('--include-labels'))).toBe(true)
    });
});

/**
 * Credential exposure through argv and failure logs.
 *
 * An earlier fix moved the Publisher credential OUT of `.git/config` (where `persist-credentials`
 * had left it for the whole job) and into a `-c http.extraheader=...` argument — which made it
 * worse in a way config never was: argv is visible in `ps`, and this module interpolates
 * `args.join(' ')` into its failure message, so a failed push would PRINT a working
 * repository-write credential into the CI log.
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

    test('the child env is SCOPED, not augmented — no raw credential survives the boundary', async () => {
        // The tests above proved the credential left argv. They could not see that it also arrived,
        // raw and in quadruplicate, through the env: spreading `options.env` and appending the header
        // made the boundary ADDITIVE. `scopedStageEnv` already strips exactly these for emission
        // stages; a git invocation is not exempt because its credential takes a different route.
        process.env.DATA_SYNC_PUBLISHER_TOKEN = secret;

        // The three ambient values are drawn from DIFFERENT `CREDENTIAL_FAMILIES` entries rather
        // than all being `ghs_`-shaped. The boundary strips by KEY, so shape is not what it acts on
        // — but a fixture where every value shares one prefix is what let a format-matching
        // assertion look sufficient for as long as it did.
        // The fixture is DERIVED from `rawCredentialNames`, not hand-listed. A hand-listed fixture is how
        // this test reported green while a newly added source — the reader token — reached every Publisher
        // git child: the strip set and the fixture were both edited by hand, and neither edit reminded
        // anyone about the other. Deriving means a scope added to `stageTokenSources` is supplied here
        // automatically, so the boundary cannot outgrow its own witness.
        const suppliedEnv = {PATH: '/usr/bin'};

        rawCredentialNames.forEach((name, index) => {
            suppliedEnv[name] = name === 'DATA_SYNC_PUBLISHER_TOKEN'
                ? secret
                : CREDENTIAL_FAMILIES[index % CREDENTIAL_FAMILIES.length].secret
        });

        // Sanity-check the derivation itself: if the module ever stops declaring the sources this test
        // exists to police, the fixture silently shrinks and every assertion below passes vacuously.
        expect(Object.keys(suppliedEnv)).toContain('DATA_SYNC_READER_TOKEN');
        expect(Object.keys(suppliedEnv)).toContain('DATA_SYNC_PUBLISHER_TOKEN');

        let seenEnv = null;

        await gitAuthenticated(
            async (command, args, options) => {seenEnv = options.env; return {stderr: '', stdout: ''}},
            '/repo',
            ['push', 'origin', 'HEAD:dev'],
            {env: {...suppliedEnv}}
        );

        // By VALUE across the whole child env, not by key absence: a key that survives holding a
        // different token is the same leak wearing a different name.
        //
        // The forbidden set is DERIVED from the values this test supplied, never from a credential
        // FORMAT. The first version tested `/^ghs_/` — one shape out of the seventeen
        // `CREDENTIAL_FAMILIES` declares — so a fine-grained PAT, a GitLab token or a bearer secret
        // leaking here produced a GREEN test. That predicate failed correctly on every fixture
        // written for it and went blind only on the input nobody imagined, which is why no
        // regression run could reveal it.
        const supplied = Object.values(suppliedEnv).filter(value => value !== '/usr/bin'),
              leaked   = Object.entries(seenEnv).filter(([key, value]) =>
                  key !== 'GIT_CONFIG_VALUE_0' &&
                  typeof value === 'string' &&
                  supplied.includes(value));

        expect(leaked).toEqual([]);

        // Key absence for EVERY declared source, derived rather than enumerated — both halves matter: a
        // surviving key is a leak even when the value assertion above happens to miss it.
        rawCredentialNames.forEach(name => {
            expect(seenEnv[name], `${name} must not survive into a git child`).toBeUndefined()
        });

        // Unrelated env survives, and the ONE derived credential still gets through.
        expect(seenEnv.PATH).toBe('/usr/bin');
        expect(seenEnv.GIT_CONFIG_VALUE_0).toContain(Buffer.from(`x-access-token:${secret}`).toString('base64'))
    });
});
