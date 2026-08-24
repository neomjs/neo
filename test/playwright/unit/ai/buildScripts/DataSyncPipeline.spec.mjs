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
    CONFIDENTIAL_TERMS_ENV_VAR,
    describeStageFailure,
    emitGeneratedData,
    findConfidentialProse,
    readConfidentialTerms,
    executeCommand,
    GENERATED_DATA_PATHS,
    isGeneratedDataPath,
    gitAuthenticated,
    rawCredentialNames,
    runDataSyncPipeline,
    scopedStageEnv,
    STAGE_FAILURE_CLASS
} from '../../../../../buildScripts/dataSyncPipeline.mjs';

// The moving generated file — seeded, rewritten on every emission attempt, and rewritten again by
// `advanceRemote` to simulate a concurrent `dev` advance. It must therefore be an allowlisted path
// that NO other assertion in this file owns: the emission below writes six further paths and checks
// each one individually, so reusing any of them makes the seed and the emission fight over the same
// bytes and the failure reads as a publication bug rather than a fixture collision.
const generatedFile = 'resources/content/issues/chunk-1/issue-9486.md';

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
            'apps/portal/resources/data',
            'apps/portal/sitemap.xml',
            'apps/portal/llms.txt',
            'resources/content'
        ]);
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
            log: () => {}
        });

        expect(calls.map(({args, command}) => [command, ...args])).toEqual([
            ['npm', 'ci'],
            [process.execPath, './ai/scripts/maintenance/syncGithubWorkflow.mjs', '--emit-only'],
            [process.execPath, './buildScripts/docs/rebuildContentIndexesAndSeo.mjs', '--include-labels']
        ]);
        expect(calls.every(call => call.options.cwd === '/repo')).toBe(true)
    });

    test('publishes one atomic corpus and Portal projection commit when dev stays unchanged', async () => {
        const fixture = await createRepositoryFixture();

        try {
            let emissions = 0;

            const result = await runDataSyncPipeline({
                denylist: [],
                cwd     : fixture.runner,
                emit    : async ({attempt, cwd}) => {
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
                denylist: [],
                cwd     : fixture.runner,
                execute : async (command, args, options) => {
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
                denylist: [],
                cwd     : fixture.runner,
                emit    : async ({attempt, cwd}) => {
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
                denylist: [],
                cwd     : fixture.runner,
                emit    : async ({cwd}) => {
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

        // Pinned to `dev`. This was briefly a conditional so a preflight-only dispatch could follow
        // the dispatched ref and verify a pipeline change before merge — that mode existed solely to
        // answer the DevIndex intake credential question, and went with the stages.
        expect(workflow).toContain('ref: dev');

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

        // The pages push no longer carries the contributor index: `neomjs/devindex` publishes its own
        // working set as objects. This asserts the copy is gone rather than merely absent from a diff
        // — it is the step that made the same 23 MB file land in a SECOND repository every hour, and
        // 76% of `neomjs/pages` blob bytes are its history.
        expect(workflow).not.toContain('apps/devindex/resources/data/users.jsonl')
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
        DATA_SYNC_PUBLISHER_TOKEN: 'PUBLISHER-secret',
        DATA_SYNC_READER_TOKEN   : 'READER-secret'
    };

    const values = env => Object.values(env);

    test('a publisher stage sees ONLY the publisher credential, never an ambient one', () => {
        const env = scopedStageEnv('publisher', parentEnv);

        expect(env.GITHUB_TOKEN).toBe('PUBLISHER-secret');
        expect(values(env)).not.toContain('ambient-default')
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

    test('a publisher stage cannot see the reader credential either', () => {
        // The grant is read-only, which makes it the easiest one to be careless with. It is still a
        // credential, and a stage granted a DIFFERENT identity must not find it lying around.
        for (const scope of ['publisher']) {
            expect(values(scopedStageEnv(scope, parentEnv)), scope).not.toContain('READER-secret')
        }
    });

    test('non-credential environment is preserved for every scope', () => {
        for (const scope of ['none', 'publisher', 'reader']) {
            expect(scopedStageEnv(scope, parentEnv).PATH, scope).toBe('/usr/bin')
        }
    });

    test('a missing scoped token yields no credential rather than falling back to ambient', () => {
        // Fail closed: an unconfigured secret must not silently run on whatever the runner happened
        // to export, which is how the single-token pipeline masked its own boundary.
        const env = scopedStageEnv('publisher', {PATH: '/usr/bin', GITHUB_TOKEN: 'ambient-default'});

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
            log      : () => {}
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
        for (const scope of ['none', 'publisher', 'reader']) {
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
        for (const scope of ['none', 'publisher', 'reader']) {
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
            log    : () => {}
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
            log    : line => lines.push(line)
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
                denylist: [],
                cwd     : fixture.runner,
                emit    : async ({cwd}) => {
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
            log    : () => {}
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
 * @summary A stage that defers its failure must not take corpus publication down with it.
 *
 * The mechanism exists because DevIndex enrichment once shared this process with corpus
 * publication: one denied enrichment stage threw out of the loop, `content indexes and SEO` never ran,
 * and the corpus was discarded unpublished for nineteen hours. Those stages have since moved to
 * `neomjs/devindex`, so the original scenario cannot recur here — but the flag outlived them on the
 * `GitHub Workflow corpus` stage, and an untested mechanism is one that quietly stops working.
 *
 * The block shrank from eight tests to two because the surface shrank, not because coverage was
 * traded away: six of them proved properties of an intake identity this repository no longer holds.
 *
 * Isolation must not become suppression — a green run would assert a corpus that is in fact stale —
 * so the test proving publication is paired with one proving the run still fails.
 */
test.describe('a deferred stage failure cannot freeze corpus publication (#17148)', () => {
    /** Fails exactly the stages whose argv contains the marker, so one denial can be aimed. */
    const failingScripts = markers => async (_command, args) => {
        if (args.some(arg => markers.some(marker => String(arg).includes(marker)))) {
            throw new Error(`Resource not accessible by integration (${args.join(' ')})`)
        }
    };

    test('a deferred stage failure still lets every later stage run', async () => {
        const lines = [];

        const {deferredError} = await emitGeneratedData({
            attempt: 1,
            cwd    : '/tmp',
            execute: failingScripts(['syncGithubWorkflow.mjs']),
            log    : line => lines.push(line)
        });

        // The decisive assertion: this stage runs AFTER the failing one and is what makes the corpus
        // consumable. Without the deferral the loop throws here instead.
        expect(lines.some(line => line.includes('stage=content indexes and SEO'))).toBe(true);
        // Deferred, never dropped — the caller still receives the failure to rethrow after publish.
        expect(deferredError.message).toContain('GitHub Workflow corpus')
    });

    test('the corpus publishes AND the run still fails', async () => {
        const fixture = await createRepositoryFixture();

        try {
            await expect(runDataSyncPipeline({
                denylist: [],
                cwd     : fixture.runner,
                emit    : async ({attempt, cwd, log}) => {
                    await write(cwd, generatedFile, 'generated:corpus-despite-denial\n');

                    return emitGeneratedData({
                        attempt,
                        cwd,
                        execute: failingScripts(['syncGithubWorkflow.mjs']),
                        log
                    })
                }
            })).rejects.toThrow(/Resource not accessible by integration/);

            // Both halves matter: the corpus reached `dev` (no freeze) and the run still failed (the
            // alarm is not silenced). Either alone is the wrong outcome.
            expect(readRemoteFile(fixture, generatedFile)).toContain('corpus-despite-denial')
        } finally {
            await fs.rm(fixture.root, {recursive: true, force: true})
        }
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

// The mirror commits every issue/PR/discussion comment into this PUBLIC tree on the next hourly
// run, so a leaked comment becomes a committed file within the hour and sanitizing the comment
// afterwards does not un-commit it. The window between publishing a leak and the next run is the
// entire remediation budget. These arms use a synthetic token exclusively — the guard's own tests
// must never carry the values it exists to withhold.
test.describe('confidential-content publication guard (#17730)', () => {
    const TERM = 'zzsynthetictenantzz';

    test('a staged file carrying a denylisted term fails the run, and nothing is published', async () => {
        const fixture = await createRepositoryFixture();

        try {
            await expect(runDataSyncPipeline({
                denylist: [TERM],
                cwd     : fixture.runner,
                emit    : async ({cwd}) => {
                    await write(cwd, generatedFile, `# Issue\n\nThe ${TERM} plane is red.\n`)
                },
                log: () => {}
            })).rejects.toThrow(/refused to publish confidential content/u);

            // It GATES. A check whose result does not stop the publication is a log line.
            expect(remoteSubjects(fixture)).toEqual(['initial'])
        } finally {
            await fs.rm(fixture.root, {recursive: true, force: true})
        }
    });

    test('the failure names the file and WHICH rule fired, never the matched value', async () => {
        const fixture = await createRepositoryFixture();

        try {
            let message = '';

            await runDataSyncPipeline({
                denylist: [TERM],
                cwd     : fixture.runner,
                emit    : async ({cwd}) => {
                    await write(cwd, generatedFile, `# Issue\n\nline two\nThe ${TERM} plane is red.\n`)
                },
                log: () => {}
            }).catch(error => { message = error.message });

            expect(message).toContain(generatedFile);
            expect(message).toContain(':4');
            expect(message).toContain('term #1');

            // CI logs for a public repository are themselves a public artifact. A guard that
            // echoes the term leaks it into the record of catching it.
            expect(message).not.toContain(TERM)
        } finally {
            await fs.rm(fixture.root, {recursive: true, force: true})
        }
    });

    test('identity forms publish normally, so the hourly sync is not broken by trailers and handles', async () => {
        const fixture = await createRepositoryFixture();

        try {
            const result = await runDataSyncPipeline({
                denylist: [TERM],
                cwd     : fixture.runner,
                emit    : async ({cwd}) => {
                    await write(cwd, generatedFile,
                        `# Issue\n\nCo-Authored-By: A Person <person@${TERM}.com>\nThanks @${TERM}!\n`)
                },
                log: () => {}
            });

            // The census behind this ticket found identity forms outnumbering real leaks 2:1. A
            // denylist that fails on them fails EVERY hourly run, and would be switched off in a day.
            expect(result).toMatchObject({changed: true, pushed: true});
            expect(remoteSubjects(fixture)).toEqual([
                'chore(data): Hourly data sync pipeline update [skip ci]',
                'initial'
            ])
        } finally {
            await fs.rm(fixture.root, {recursive: true, force: true})
        }
    });

    test('a publication run must state its policy — an inherited one is refused', async () => {
        await expect(runDataSyncPipeline({cwd: '/repo'})).rejects.toThrow(/denylist must be an array/u)
    });

    test('an ABSENT denylist variable is a configuration failure, an empty one is a policy', () => {
        expect(() => readConfidentialTerms({})).toThrow(new RegExp(CONFIDENTIAL_TERMS_ENV_VAR, 'u'));

        // Explicitly none — a deployment with nothing to guard says so, and that is not the same
        // statement as nobody having configured the guard at all.
        expect(readConfidentialTerms({[CONFIDENTIAL_TERMS_ENV_VAR]: ''})).toEqual([]);
        expect(readConfidentialTerms({[CONFIDENTIAL_TERMS_ENV_VAR]: ' Alpha , beta ,'})).toEqual(['alpha', 'beta'])
    });

    test('prose matches, identity forms do not — one character of lookbehind separates them', () => {
        const terms = ['acme'];

        expect(findConfidentialProse('the acme plane', terms)).toEqual([{line: 1, termIndex: 0}]);
        expect(findConfidentialProse('acme-memory-core', terms)).toEqual([{line: 1, termIndex: 0}]);

        // A private HOST is a real leak and is preceded by `.`, not `@`.
        expect(findConfidentialProse('https://mcp.acme.net/x', terms)).toEqual([{line: 1, termIndex: 0}]);

        expect(findConfidentialProse('uhlig@acme.com', terms)).toEqual([]);
        expect(findConfidentialProse('thanks @acme for the fix', terms)).toEqual([]);

        expect(findConfidentialProse('one\ntwo\nthe acme plane', terms)).toEqual([{line: 3, termIndex: 0}]);
        expect(findConfidentialProse('ACME shipped', terms)).toEqual([{line: 1, termIndex: 0}])
    })
});
