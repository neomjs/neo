import {test, expect} from '@playwright/test';

import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';
import {execFile}     from 'child_process';
import {promisify}    from 'util';

import GitMirror, {
    cloneIfMissing,
    diffRevisions,
    fetch,
    isAncestor,
    resolveHead
} from '../../../../../../ai/services/knowledge-base/helpers/gitMirror.mjs';

const execFileAsync = promisify(execFile);

/**
 * @summary Contract tests for the persistent Git mirror primitive (#11788).
 *
 * The tests use local fixture repositories only. Credentialed remote acquisition is
 * represented by no-leak failure assertions so the suite never depends on provider
 * credentials or network availability.
 *
 * @see https://github.com/neomjs/neo/issues/11788
 * @see ai/services/knowledge-base/helpers/gitMirror.mjs
 */

test.describe('GitMirror (#11788)', () => {
    let root;

    test.beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-gitmirror-test-'));
    });

    test.afterEach(async () => {
        delete process.env.NEO_GITMIRROR_TEST_TOKEN;
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
        await fs.writeFile(path.join(source, 'alpha.txt'), 'alpha v1\n');
        await fs.writeFile(path.join(source, 'remove-me.txt'), 'remove me\n');
        await git(['add', '.'], source);
        await git(['-c', 'user.name=Neo Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'initial'], source);

        return source;
    }

    async function commitSecondRevision(source) {
        await fs.writeFile(path.join(source, 'alpha.txt'), 'alpha v2\n');
        await fs.writeFile(path.join(source, 'beta.txt'), 'beta\n');
        await fs.remove(path.join(source, 'remove-me.txt'));
        await git(['add', '-A'], source);
        await git(['-c', 'user.name=Neo Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'second'], source);
    }

    async function commitRenameRevision(source) {
        await git(['mv', 'alpha.txt', 'renamed-alpha.txt'], source);
        await git(['add', '-A'], source);
        await git(['-c', 'user.name=Neo Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'rename alpha'], source);
    }

    function mirrorOptions(source) {
        return {
            cloneUrl  : source,
            mirrorRoot: path.join(root, 'mirrors'),
            repoSlug  : 'local/source',
            tenantId  : 'tenant-a'
        };
    }

    async function withFakeGitCapture(callback) {
        const originalPath = process.env.PATH;
        const binDir       = path.join(root, 'fake-bin');
        const capturePath  = path.join(root, 'git-env.txt');
        const gitPath      = path.join(binDir, 'git');

        await fs.ensureDir(binDir);
        await fs.writeFile(gitPath, `#!/bin/sh
{
    printf '%s\\n' "GIT_ASKPASS=$GIT_ASKPASS"
    printf '%s\\n' "NEO_GITMIRROR_PASSWORD=$NEO_GITMIRROR_PASSWORD"
    printf '%s\\n' "NEO_GITMIRROR_USERNAME=$NEO_GITMIRROR_USERNAME"
} > ${JSON.stringify(capturePath)}
printf 'fatal: token %s\\n' "$NEO_GITMIRROR_PASSWORD" >&2
exit 1
`);
        await fs.chmod(gitPath, 0o755);

        process.env.PATH = `${binDir}${path.delimiter}${originalPath}`;

        try {
            await callback(capturePath);
        } finally {
            process.env.PATH = originalPath;
        }
    }

    function parseCapturedEnv(raw) {
        return Object.fromEntries(raw.trim().split('\n').map(line => {
            const index = line.indexOf('=');

            return [line.slice(0, index), line.slice(index + 1)];
        }));
    }

    test('clones a local source repo as an idempotent bare mirror', async () => {
        const source = await createSourceRepo();
        const first  = await cloneIfMissing(mirrorOptions(source));
        const second = await GitMirror.cloneIfMissing(mirrorOptions(source));

        expect(first.cloned).toBe(true);
        expect(second).toEqual({mirrorPath: first.mirrorPath, cloned: false});
        await expect(fs.pathExists(path.join(first.mirrorPath, 'HEAD'))).resolves.toBe(true);
    });

    test('fetches new revisions and resolves refs', async () => {
        const source = await createSourceRepo();
        const mirror = await cloneIfMissing(mirrorOptions(source));
        const before = await resolveHead({...mirrorOptions(source), ref: 'main'});

        await commitSecondRevision(source);

        const result = await fetch(mirrorOptions(source));
        const after  = await resolveHead({...mirrorOptions(source), ref: 'main'});

        expect(result.mirrorPath).toBe(mirror.mirrorPath);
        expect(result.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
        expect(result.newRevisions.some(item => item.ref === 'refs/heads/main')).toBe(true);
        expect(after).not.toBe(before);
    });

    test('checks ancestry and returns changed plus deleted paths between revisions', async () => {
        const source = await createSourceRepo();

        await cloneIfMissing(mirrorOptions(source));

        const baseRevision = await resolveHead({...mirrorOptions(source), ref: 'main'});

        await commitSecondRevision(source);
        await fetch(mirrorOptions(source));

        const headRevision = await resolveHead({...mirrorOptions(source), ref: 'main'});
        const diff         = await diffRevisions({...mirrorOptions(source), baseRevision, headRevision});

        await expect(isAncestor({...mirrorOptions(source), ancestor: baseRevision, descendant: headRevision}))
            .resolves.toBe(true);
        await expect(isAncestor({...mirrorOptions(source), ancestor: headRevision, descendant: baseRevision}))
            .resolves.toBe(false);
        expect(diff.addedOrChanged.sort()).toEqual(['alpha.txt', 'beta.txt']);
        expect(diff.deleted).toEqual(['remove-me.txt']);
    });

    test('represents renames as new live paths plus old tombstones', async () => {
        const source = await createSourceRepo();

        await cloneIfMissing(mirrorOptions(source));

        const baseRevision = await resolveHead({...mirrorOptions(source), ref: 'main'});

        await commitRenameRevision(source);
        await fetch(mirrorOptions(source));

        const headRevision = await resolveHead({...mirrorOptions(source), ref: 'main'});
        const diff         = await diffRevisions({...mirrorOptions(source), baseRevision, headRevision});

        expect(diff.addedOrChanged).toEqual(['renamed-alpha.txt']);
        expect(diff.deleted).toEqual(['alpha.txt']);
    });

    test('throws stable errors for missing refs and invalid mirrors', async () => {
        const source = await createSourceRepo();

        await cloneIfMissing(mirrorOptions(source));

        await expect(resolveHead({...mirrorOptions(source), ref: 'missing-ref'}))
            .rejects.toMatchObject({code: 'KB_GITMIRROR_REF_NOT_FOUND'});
        await expect(cloneIfMissing({...mirrorOptions(source), tenantId: '../bad'}))
            .rejects.toMatchObject({code: 'KB_GITMIRROR_MIRROR_PATH_INVALID'});
        await expect(cloneIfMissing({
            ...mirrorOptions(source),
            cloneUrl: 'https://token:secret@example.com/tenant-a/repo-x.git',
            repoSlug: 'local/credential-url'
        })).rejects.toMatchObject({code: 'KB_GITMIRROR_CLONE_FAILED'});
        await expect(cloneIfMissing({
            ...mirrorOptions(source),
            cloneUrl     : path.join(root, 'other-source'),
            credentialRef: 'env:NEO_GITMIRROR_MISSING_TOKEN',
            repoSlug     : 'local/other-source'
        })).rejects.toMatchObject({code: 'KB_GITMIRROR_CREDENTIAL_REF_INVALID'});
    });

    test('resolves file credentialRef strings through askpass and redacts the resolved secret', async () => {
        const secretPath = path.join(root, 'tenant-token');

        await fs.writeFile(secretPath, ' file-secret-token \n');

        await withFakeGitCapture(async capturePath => {
            try {
                await cloneIfMissing({
                    ...mirrorOptions('https://example.com/tenant/repo.git'),
                    credentialRef: `file:${secretPath}`
                });
            } catch (error) {
                const captured = parseCapturedEnv(await fs.readFile(capturePath, 'utf-8'));

                expect(error).toMatchObject({code: 'KB_GITMIRROR_CLONE_FAILED'});
                expect(error.stderr).toContain('[REDACTED]');
                expect(error.stderr).not.toContain('file-secret-token');
                expect(captured.NEO_GITMIRROR_PASSWORD).toBe('file-secret-token');
                expect(captured.NEO_GITMIRROR_USERNAME).toBe('x-access-token');
                await expect(fs.pathExists(path.dirname(captured.GIT_ASKPASS))).resolves.toBe(false);
                return;
            }

            throw new Error('Expected fake git failure');
        });
    });

    test('passes file credentialRef objects through with explicit username', async () => {
        const secretPath = path.join(root, 'tenant-token-object');

        await fs.writeFile(secretPath, 'object-secret-token\n');

        await withFakeGitCapture(async capturePath => {
            await expect(cloneIfMissing({
                ...mirrorOptions('https://example.com/tenant/repo.git'),
                credentialRef: {
                    type    : 'file',
                    filePath: secretPath,
                    username: 'deploy-token'
                }
            })).rejects.toMatchObject({code: 'KB_GITMIRROR_CLONE_FAILED'});

            const captured = parseCapturedEnv(await fs.readFile(capturePath, 'utf-8'));

            expect(captured.NEO_GITMIRROR_PASSWORD).toBe('object-secret-token');
            expect(captured.NEO_GITMIRROR_USERNAME).toBe('deploy-token');
        });
    });

    test('rejects empty or missing file credentialRef targets', async () => {
        const emptyPath   = path.join(root, 'empty-token');
        const missingPath = path.join(root, 'missing-token');

        await fs.writeFile(emptyPath, ' \n');

        await expect(cloneIfMissing({
            ...mirrorOptions('https://example.com/tenant/repo.git'),
            credentialRef: `file:${emptyPath}`
        })).rejects.toMatchObject({code: 'KB_GITMIRROR_CREDENTIAL_REF_INVALID'});

        await expect(cloneIfMissing({
            ...mirrorOptions('https://example.com/tenant/repo.git'),
            credentialRef: {type: 'file', filePath: missingPath}
        })).rejects.toMatchObject({code: 'KB_GITMIRROR_CREDENTIAL_REF_INVALID'});
    });

    test('keeps credential hints out of durable error surfaces', async () => {
        process.env.NEO_GITMIRROR_TEST_TOKEN = 'super-secret-token';

        await expect(cloneIfMissing({
            ...mirrorOptions(path.join(root, 'missing-source')),
            credentialRef: 'env:NEO_GITMIRROR_TEST_TOKEN'
        })).rejects.toMatchObject({code: 'KB_GITMIRROR_CLONE_FAILED'});

        try {
            await cloneIfMissing({
                ...mirrorOptions(path.join(root, 'missing-source')),
                credentialRef: 'env:NEO_GITMIRROR_TEST_TOKEN'
            });
        } catch (error) {
            expect(error.message).not.toContain('super-secret-token');
            expect(error.stderr || '').not.toContain('super-secret-token');
        }
    });
});
