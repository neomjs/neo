import {test, expect} from '@playwright/test';

import {createHash} from 'node:crypto';
import fs           from 'fs-extra';
import os           from 'os';
import path         from 'path';
import {execFile}   from 'child_process';
import {promisify}  from 'util';

import {cloneIfMissing, fetch, resolveHead}
                       from '../../../../../../ai/services/knowledge-base/helpers/gitMirror.mjs';
import TenantRepoIngestEnvelopeBuilder, {
    buildIngestEnvelope,
    createTenantRepoMaterializationDigest
} from '../../../../../../ai/services/knowledge-base/helpers/tenantRepoIngestEnvelopeBuilder.mjs';

const execFileAsync = promisify(execFile);

/**
 * @summary Contract tests for the tenant GitMirror to KB ingest envelope adapter.
 *
 * The builder emits the live `KnowledgeBaseIngestionService.ingestSourceFiles()`
 * payload shape: `files`, `deleted`, `manifestSnapshot`, `baseRevision`, and
 * `headRevision`. Tests use local Git repositories only; no tenant credentials or
 * external network access are required.
 *
 * @see https://github.com/neomjs/neo/issues/11789
 * @see ai/services/knowledge-base/helpers/tenantRepoIngestEnvelopeBuilder.mjs
 * @see ai/services/knowledge-base/KnowledgeBaseIngestionService.mjs
 */

test.describe('TenantRepoIngestEnvelopeBuilder (#11789)', () => {
    let root;

    test.beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-ingest-envelope-test-'));
    });

    test.afterEach(async () => {
        await fs.remove(root);
    });

    async function git(args, cwd) {
        const {stdout} = await execFileAsync('git', args, {cwd});
        return stdout.trim();
    }

    async function createSourceRepo() {
        const source = path.join(root, 'source');

        await fs.ensureDir(source);
        await git(['init', '--initial-branch=main'], source);
        await fs.ensureDir(path.join(source, 'docs'));
        await fs.writeFile(path.join(source, 'alpha.txt'), 'alpha v1\n');
        await fs.writeFile(path.join(source, 'docs', 'guide.md'), '# Guide\n');
        await fs.writeFile(path.join(source, 'remove-me.txt'), 'remove me\n');
        await git(['add', '.'], source);
        await git(['-c', 'user.name=Neo Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'initial'], source);

        return source;
    }

    test('materialization digest is order-stable and head/parser bound (#16045)', () => {
        const envelope = {
            repoSlug        : 'org/repo',
            headRevision    : 'head-a',
            manifestSnapshot: {
                repoSlug      : 'org/repo',
                pathsAfterPush: ['z.md', 'a_b.md', 'aB.md', 'ä.md', 'a_b.md']
            },
            files: [
                {sourcePath: 'z.md', rootKind: 'bare-repo', parserId: 'markdown', parserVersion: '1'},
                {sourcePath: 'a_b.md', rootKind: 'bare-repo', parserId: 'markdown', parserVersion: '1'},
                {sourcePath: 'aB.md', rootKind: 'bare-repo', parserId: 'markdown', parserVersion: '1'},
                {sourcePath: 'ä.md', rootKind: 'bare-repo', parserId: 'markdown', parserVersion: '1'}
            ]
        };
        const
            digest         = createTenantRepoMaterializationDigest(envelope),
            expectedDigest = createHash('sha256')
                .update(JSON.stringify({
                    formatVersion : 1,
                    repoSlug      : 'org/repo',
                    headRevision  : 'head-a',
                    pathsAfterPush: ['aB.md', 'a_b.md', 'z.md', 'ä.md'],
                    parserBindings: [
                        {sourcePath: 'aB.md', rootKind: 'bare-repo', parserId: 'markdown', parserVersion: '1'},
                        {sourcePath: 'a_b.md', rootKind: 'bare-repo', parserId: 'markdown', parserVersion: '1'},
                        {sourcePath: 'z.md', rootKind: 'bare-repo', parserId: 'markdown', parserVersion: '1'},
                        {sourcePath: 'ä.md', rootKind: 'bare-repo', parserId: 'markdown', parserVersion: '1'}
                    ]
                }))
                .digest('hex');

        expect(digest).toBe(expectedDigest);
        expect(createTenantRepoMaterializationDigest({
            ...envelope,
            manifestSnapshot: {
                ...envelope.manifestSnapshot,
                pathsAfterPush: ['ä.md', 'z.md', 'a_b.md', 'aB.md']
            },
            files: [...envelope.files].reverse()
        })).toBe(digest);
        expect(createTenantRepoMaterializationDigest({...envelope, headRevision: 'head-b'})).not.toBe(digest);
        expect(createTenantRepoMaterializationDigest({
            ...envelope,
            files: [{...envelope.files[0], parserVersion: '3'}, envelope.files[1]]
        })).not.toBe(digest);
        expect(TenantRepoIngestEnvelopeBuilder.createTenantRepoMaterializationDigest).toBe(
            createTenantRepoMaterializationDigest
        );
    });

    async function commitSecondRevision(source) {
        await fs.writeFile(path.join(source, 'alpha.txt'), 'alpha v2\n');
        await fs.writeFile(path.join(source, 'beta.txt'), 'beta\n');
        await fs.remove(path.join(source, 'remove-me.txt'));
        await git(['add', '-A'], source);
        await git(['-c', 'user.name=Neo Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'second'], source);
    }

    async function createMirror(source) {
        const options = {
            cloneUrl  : source,
            mirrorRoot: path.join(root, 'mirrors'),
            repoSlug  : 'local/source',
            tenantId  : 'tenant-a'
        };

        await cloneIfMissing(options);

        return options;
    }

    test('builds a manifest-carrying full envelope when no baseline exists', async () => {
        const source   = await createSourceRepo();
        const options  = await createMirror(source);
        const newHead  = await resolveHead({...options, ref: 'main'});
        const envelope = await buildIngestEnvelope({
            ...options,
            newHead,
            rootKind: 'bare-repo'
        });

        expect(envelope).toMatchObject({
            tenantId        : 'tenant-a',
            repoSlug        : 'local/source',
            headRevision    : newHead,
            manifestSnapshot: {
                repoSlug      : 'local/source',
                pathsAfterPush: ['alpha.txt', 'docs/guide.md', 'remove-me.txt']
            }
        });
        expect(envelope.baseRevision).toBeUndefined();
        expect(envelope.deleted).toBeUndefined();
        expect(envelope.files.map(file => file.sourcePath)).toEqual(['alpha.txt', 'docs/guide.md', 'remove-me.txt']);
        expect(envelope.files.find(file => file.sourcePath === 'docs/guide.md')).toMatchObject({
            repoSlug: 'local/source',
            rootKind: 'bare-repo',
            content : '# Guide\n'
        });
    });

    test('routes revision reads through the isolated GitMirror subprocess boundary (#16045)', async () => {
        const
            source                  = await createSourceRepo(),
            options                 = await createMirror(source),
            ambientHome             = path.join(root, 'host-home'),
            capturePath             = path.join(root, 'git-environments.tsv'),
            binDir                  = path.join(root, 'capture-bin'),
            wrapperPath             = path.join(binDir, 'git'),
            originalPath            = process.env.PATH,
            originalHome            = process.env.HOME,
            originalProfile         = process.env.USERPROFILE,
            {stdout: gitPathOutput} = await execFileAsync('which', ['git']),
            realGitPath             = gitPathOutput.trim();

        await fs.ensureDir(ambientHome);
        await fs.ensureDir(binDir);
        await fs.writeFile(wrapperPath, `#!/bin/sh
printf '%s\\t%s\\t%s\\t%s\\n' "$HOME" "$GIT_CONFIG_GLOBAL" "$GIT_CONFIG_NOSYSTEM" "$GIT_SSH_COMMAND" >> ${JSON.stringify(capturePath)}
exec ${JSON.stringify(realGitPath)} "$@"
`);
        await fs.chmod(wrapperPath, 0o755);

        process.env.PATH        = `${binDir}${path.delimiter}${originalPath}`;
        process.env.HOME        = ambientHome;
        process.env.USERPROFILE = ambientHome;

        try {
            await buildIngestEnvelope({...options, newHead: 'main'});
        } finally {
            process.env.PATH = originalPath;

            if (originalHome === undefined) {
                delete process.env.HOME;
            } else {
                process.env.HOME = originalHome;
            }

            if (originalProfile === undefined) {
                delete process.env.USERPROFILE;
            } else {
                process.env.USERPROFILE = originalProfile;
            }
        }

        const observations = (await fs.readFile(capturePath, 'utf-8'))
            .trim()
            .split('\n')
            .map(line => line.split('\t'));

        expect(observations.length).toBeGreaterThan(0);

        for (const [home, globalConfig, noSystem, sshCommand] of observations) {
            expect(home).not.toBe(ambientHome);
            expect(globalConfig).toBe(path.join(home, '.gitconfig'));
            expect(noSystem).toBe('1');
            expect(sshCommand).toContain('IdentityAgent=none');
            expect(sshCommand).toContain('IdentityFile=none');
            await expect(fs.pathExists(home)).resolves.toBe(false);
        }
    });

    test('builds a bounded delta envelope for linear history advances', async () => {
        const source       = await createSourceRepo();
        const options      = await createMirror(source);
        const baseRevision = await resolveHead({...options, ref: 'main'});

        await commitSecondRevision(source);
        await fetch(options);

        const headRevision = await resolveHead({...options, ref: 'main'});
        const envelope     = await TenantRepoIngestEnvelopeBuilder.buildIngestEnvelope({
            ...options,
            lastIngestedRev: baseRevision,
            newHead        : headRevision,
            parserId       : 'raw-text',
            parserVersion  : 'test-parser-v1'
        });

        expect(envelope).toMatchObject({
            tenantId: 'tenant-a',
            repoSlug: 'local/source',
            headRevision,
            deleted : [{sourcePath: 'remove-me.txt', repoSlug: 'local/source'}]
        });

        // The delta above is AUTHORITATIVE: `diffRevisions` already resolved it, and it is
        // carried explicitly in `deleted`. Forwarding `baseRevision` would additionally ask
        // IngestionService to DERIVE the same set through a resolver that has no production
        // implementation, so the request could only fail — which is what pinned every tenant repo
        // at `consecutiveFailures: 12` and the 2h backoff cap with the corpus frozen.
        //
        // This assertion is the fix. If `baseRevision` ever returns to this envelope, the lane
        // silently goes back to asking for work it has already done, and fails on the answer.
        expect(envelope.baseRevision).toBeUndefined();
        expect(envelope.manifestSnapshot).toBeUndefined();
        expect(envelope.files.map(file => [file.sourcePath, file.content])).toEqual([
            ['alpha.txt', 'alpha v2\n'],
            ['beta.txt', 'beta\n']
        ]);
        expect(envelope.files[0]).toMatchObject({
            parserId     : 'raw-text',
            parserVersion: 'test-parser-v1'
        });
    });

    test('falls back to a full manifest snapshot when history is non-linear', async () => {
        const source       = await createSourceRepo();
        const options      = await createMirror(source);
        const baseRevision = await resolveHead({...options, ref: 'main'});

        await commitSecondRevision(source);
        await fetch(options);

        const headRevision = await resolveHead({...options, ref: 'main'});
        const envelope     = await buildIngestEnvelope({
            ...options,
            lastIngestedRev: headRevision,
            newHead        : baseRevision
        });

        expect(envelope.baseRevision).toBeUndefined();
        expect(envelope.deleted).toBeUndefined();
        expect(envelope.manifestSnapshot).toEqual({
            repoSlug      : 'local/source',
            pathsAfterPush: ['alpha.txt', 'docs/guide.md', 'remove-me.txt']
        });
        expect(envelope.files.map(file => file.sourcePath)).toEqual(['alpha.txt', 'docs/guide.md', 'remove-me.txt']);
    });

    test('throws stable errors for missing mirrors and missing head refs', async () => {
        const source  = await createSourceRepo();
        const options = await createMirror(source);

        await expect(buildIngestEnvelope({
            ...options,
            tenantId: '../bad',
            newHead : 'main'
        })).rejects.toMatchObject({code: 'KB_INGEST_ENVELOPE_MIRROR_PATH_INVALID'});
        await expect(buildIngestEnvelope({
            ...options,
            repoSlug: 'local/missing',
            newHead : 'main'
        })).rejects.toMatchObject({code: 'KB_INGEST_ENVELOPE_MIRROR_MISSING'});
        await expect(buildIngestEnvelope({
            ...options,
            newHead: 'missing-ref'
        })).rejects.toMatchObject({code: 'KB_INGEST_ENVELOPE_REF_NOT_FOUND'});
    });
});
