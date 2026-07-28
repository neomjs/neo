import {test, expect} from '@playwright/test';

import fs              from 'fs-extra';
import os              from 'os';
import path            from 'path';
import {execFile}      from 'child_process';
import {promisify}     from 'util';
import {pathToFileURL} from 'url';

import GitMirror, {
    cloneIfMissing,
    diffRevisions,
    fetch,
    inspectCredentialReadiness,
    isAncestor,
    probeRemoteAccess,
    TenantRepoAccessCode,
    resolveHead
} from '../../../../../../ai/services/knowledge-base/helpers/gitMirror.mjs';

const execFileAsync = promisify(execFile);

/**
 * @summary Contract tests for the persistent Git mirror primitive.
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
    printf '%s\\n' "GIT_CONFIG_GLOBAL=$GIT_CONFIG_GLOBAL"
    printf '%s\\n' "GIT_CONFIG_NOSYSTEM=$GIT_CONFIG_NOSYSTEM"
    printf '%s\\n' "GIT_SSH_COMMAND=$GIT_SSH_COMMAND"
    printf '%s\\n' "HOME=$HOME"
    printf '%s\\n' "NEO_GITMIRROR_PASSWORD=$NEO_GITMIRROR_PASSWORD"
    printf '%s\\n' "NEO_GITMIRROR_USERNAME=$NEO_GITMIRROR_USERNAME"
    printf '%s\\n' "USERPROFILE=$USERPROFILE"
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

    async function withFakeGitScript(script, callback) {
        const originalPath = process.env.PATH;
        const binDir       = path.join(root, 'fake-probe-bin');
        const gitPath      = path.join(binDir, 'git');

        await fs.ensureDir(binDir);
        await fs.writeFile(gitPath, `#!/bin/sh\n${script}\n`);
        await fs.chmod(gitPath, 0o755);
        process.env.PATH = `${binDir}${path.delimiter}${originalPath}`;

        try {
            await callback();
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

    test('rejects an unsupported credentialRef scheme through the shared config grammar', async () => {
        const source = await createSourceRepo();

        await expect(cloneIfMissing({
            ...mirrorOptions(source),
            credentialRef: 'helper:github-app-installation'
        })).rejects.toMatchObject({code: 'KB_GITMIRROR_CREDENTIAL_REF_INVALID'});
    });

    test('checks env, file, and SSH credential material without exposing reference metadata', async () => {
        const tokenPath = path.join(root, 'readiness-token');
        const keyPath   = path.join(root, 'readiness-key');

        process.env.NEO_GITMIRROR_TEST_TOKEN = 'local-readiness-secret';
        await fs.writeFile(tokenPath, 'file-readiness-secret\n');
        await fs.writeFile(keyPath, '-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----\n');

        const results = await Promise.all([
            inspectCredentialReadiness({credentialRef: 'env:NEO_GITMIRROR_TEST_TOKEN'}),
            inspectCredentialReadiness({credentialRef: `file:${tokenPath}`}),
            inspectCredentialReadiness({credentialRef: `ssh:${keyPath}`})
        ]);

        for (const result of results) {
            expect(result).toMatchObject({
                status: 'ready',
                code  : TenantRepoAccessCode.CREDENTIAL_RESOLVED
            });
            expect(result.cacheFingerprint).toMatch(/^[a-f0-9]{64}$/u);
        }

        const serialized = JSON.stringify(results);
        expect(serialized).not.toContain('local-readiness-secret');
        expect(serialized).not.toContain('file-readiness-secret');
        expect(serialized).not.toContain('NEO_GITMIRROR_TEST_TOKEN');
        expect(serialized).not.toContain(tokenPath);
        expect(serialized).not.toContain(keyPath);
    });

    test('classifies missing or unreadable local credential material before Git runs', async () => {
        const unreadableKeyPath = path.join(root, 'key-directory');

        await fs.ensureDir(unreadableKeyPath);

        await expect(inspectCredentialReadiness({
            credentialRef: 'env:NEO_GITMIRROR_MISSING_TOKEN'
        })).resolves.toEqual({
            status          : 'degraded',
            code            : TenantRepoAccessCode.CREDENTIAL_INVALID,
            cacheFingerprint: null
        });
        await expect(inspectCredentialReadiness({
            credentialRef: `file:${path.join(root, 'missing-token')}`
        })).resolves.toMatchObject({
            status: 'degraded',
            code  : TenantRepoAccessCode.CREDENTIAL_INVALID
        });
        await expect(inspectCredentialReadiness({
            credentialRef: `ssh:${unreadableKeyPath}`
        })).resolves.toMatchObject({
            status: 'degraded',
            code  : TenantRepoAccessCode.CREDENTIAL_INVALID
        });
    });

    test('probes a readable repository and distinguishes a missing ref', async () => {
        const source = await createSourceRepo();
        const head   = await git(['rev-parse', 'HEAD'], source);

        await git(['branch', 'deadbee'], source);

        await expect(probeRemoteAccess({
            cloneUrl     : source,
            credentialRef: 'none',
            ref          : 'main'
        })).resolves.toMatchObject({
            status: 'ready',
            code  : TenantRepoAccessCode.READY
        });
        await expect(probeRemoteAccess({
            cloneUrl     : source,
            credentialRef: 'none',
            ref          : 'deadbee'
        })).resolves.toMatchObject({
            status: 'ready',
            code  : TenantRepoAccessCode.READY
        });
        await expect(probeRemoteAccess({
            cloneUrl     : source,
            credentialRef: 'none',
            ref          : 'missing-ref'
        })).resolves.toMatchObject({
            status: 'degraded',
            code  : TenantRepoAccessCode.REF_NOT_FOUND
        });

        await expect(probeRemoteAccess({
            cloneUrl     : source,
            credentialRef: 'none',
            ref          : head
        })).resolves.toMatchObject({
            status: 'ready',
            code  : TenantRepoAccessCode.READY
        });

        await git(['branch', '-D', 'deadbee'], source);
        await commitSecondRevision(source);

        await expect(probeRemoteAccess({
            cloneUrl     : source,
            credentialRef: 'none',
            ref          : head
        })).resolves.toMatchObject({
            status: 'unknown',
            code  : TenantRepoAccessCode.REF_UNVERIFIED
        });
    });

    test('ignores ambient HOME authority for probe, clone, and fetch (#16045)', async () => {
        const
            source          = await createSourceRepo(),
            ambientHome     = path.join(root, 'ambient-home'),
            ambientConfig   = path.join(ambientHome, '.gitconfig'),
            fakeCloneUrl    = 'https://127.0.0.1:1/private.git',
            sourceUrl       = pathToFileURL(source).href,
            originalHome    = process.env.HOME,
            originalProfile = process.env.USERPROFILE;

        await fs.ensureDir(ambientHome);
        await git([
            'config',
            '--file',
            ambientConfig,
            `url.${sourceUrl}.insteadOf`,
            fakeCloneUrl
        ], root);

        process.env.HOME        = ambientHome;
        process.env.USERPROFILE = ambientHome;

        try {
            await expect(probeRemoteAccess({
                cloneUrl     : fakeCloneUrl,
                credentialRef: 'none',
                ref          : 'main',
                timeoutMs    : 1000
            })).resolves.toMatchObject({
                status: 'degraded',
                code  : TenantRepoAccessCode.TRANSPORT_FAILED
            });

            await expect(cloneIfMissing({
                cloneUrl     : fakeCloneUrl,
                credentialRef: 'none',
                mirrorRoot   : path.join(root, 'ambient-clone-mirrors'),
                repoSlug     : 'ambient/clone',
                tenantId     : 'tenant-a'
            })).rejects.toMatchObject({code: 'KB_GITMIRROR_CLONE_FAILED'});

            const fetchOptions = {
                cloneUrl     : source,
                credentialRef: 'none',
                mirrorRoot   : path.join(root, 'ambient-fetch-mirrors'),
                repoSlug     : 'ambient/fetch',
                tenantId     : 'tenant-a'
            };
            const {mirrorPath} = await cloneIfMissing(fetchOptions);

            await git(['remote', 'set-url', 'origin', fakeCloneUrl], mirrorPath);
            await expect(fetch(fetchOptions))
                .rejects.toMatchObject({code: 'KB_GITMIRROR_FETCH_FAILED'});
        } finally {
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
    });

    test('redacts isolated-environment setup failures before they cross GitMirror (#16045)', async () => {
        const
            source            = await createSourceRepo(),
            originalWriteFile = fs.writeFile;
        let leakedHomePath;
        let setupError;

        fs.writeFile = async (filePath, ...args) => {
            if (String(filePath).includes('neo-gitmirror-home-')) {
                leakedHomePath = path.dirname(String(filePath));
                throw new Error(`injected setup failure at ${filePath}`);
            }

            return originalWriteFile.call(fs, filePath, ...args)
        };

        try {
            await cloneIfMissing(mirrorOptions(source));
        } catch (error) {
            setupError = error;
        } finally {
            fs.writeFile = originalWriteFile;
        }

        expect(setupError).toMatchObject({
            code   : 'KB_GITMIRROR_ENVIRONMENT_FAILED',
            message: 'GitMirror failed to prepare its isolated subprocess environment'
        });
        expect(leakedHomePath).toContain('neo-gitmirror-home-');
        expect(setupError.message).not.toContain(leakedHomePath);
        expect(setupError.cause?.message || '').not.toContain(leakedHomePath);
        await expect(fs.pathExists(leakedHomePath)).resolves.toBe(false);
    });

    test('bounds cleanup-only failures and preserves an earlier Git failure (#16045)', async () => {
        const
            source         = await createSourceRepo(),
            originalRemove = fs.remove,
            isolatedHomes  = [];

        fs.remove = async targetPath => {
            if (String(targetPath).includes('neo-gitmirror-home-')) {
                isolatedHomes.push(String(targetPath));
                throw new Error(`injected cleanup failure at ${targetPath}`);
            }

            return originalRemove.call(fs, targetPath)
        };

        try {
            await expect(cloneIfMissing({
                ...mirrorOptions(source),
                repoSlug: 'cleanup/success'
            })).rejects.toMatchObject({
                code   : 'KB_GITMIRROR_CLEANUP_FAILED',
                message: 'GitMirror failed to remove its isolated subprocess environment'
            });

            await expect(cloneIfMissing({
                ...mirrorOptions(path.join(root, 'missing-source')),
                repoSlug: 'cleanup/primary-failure'
            })).rejects.toMatchObject({
                code   : 'KB_GITMIRROR_CLONE_FAILED',
                message: 'GitMirror clone failed'
            });
        } finally {
            fs.remove = originalRemove;
            await Promise.all(isolatedHomes.map(homePath => fs.remove(homePath)));
        }

        expect(isolatedHomes).toHaveLength(2);
    });

    test('classifies rejected-credential, scope, absent, transport, and timeout probe failures without returning Git prose', async () => {
        const cases = [
            {
                // Was asserted as DENIED_OR_NOT_FOUND while every non-transport exit collapsed into
                // that one code. A rejected credential and an absent repository need different fixes,
                // so the shared classifier now separates them and this fixture pins the sharper answer.
                script : "printf '%s\\n' 'fatal: Authentication failed for https://example.invalid/private.git' >&2\nexit 128",
                code   : TenantRepoAccessCode.CREDENTIAL_REJECTED,
                timeout: 3000
            },
            {
                // The case the operator named: a token that authenticates but lacks the scope. Under
                // the old collapse this was indistinguishable from a wrong token.
                script : "printf '%s\\n' 'remote: Write access to repository not granted.' >&2\nexit 128",
                code   : TenantRepoAccessCode.INSUFFICIENT_SCOPE,
                timeout: 3000
            },
            {
                // Stays COMBINED on purpose. Providers answer 404 for both "no access" and "does not
                // exist" so repository existence is not probeable; splitting it would invent a
                // distinction the provider refuses to make.
                script : "printf '%s\\n' 'remote: Repository not found.' >&2\nexit 128",
                code   : TenantRepoAccessCode.DENIED_OR_NOT_FOUND,
                timeout: 3000
            },
            {
                script : "printf '%s\\n' 'fatal: Could not resolve host: example.invalid' >&2\nexit 128",
                code   : TenantRepoAccessCode.TRANSPORT_FAILED,
                timeout: 3000
            },
            {
                script : 'sleep 1\nexit 0',
                code   : TenantRepoAccessCode.TIMEOUT,
                timeout: 20
            }
        ];

        for (const item of cases) {
            await withFakeGitScript(item.script, async () => {
                const result = await probeRemoteAccess({
                    cloneUrl     : 'https://example.invalid/private.git',
                    credentialRef: 'none',
                    ref          : 'main',
                    timeoutMs    : item.timeout
                });

                expect(result).toMatchObject({status: 'degraded', code: item.code});
                expect(JSON.stringify(result)).not.toContain('Authentication failed');
                expect(JSON.stringify(result)).not.toContain('example.invalid');
            });
        }

        // The discrimination is the deliverable, so assert the fixtures actually resolve to DISTINCT
        // codes. Five per-case assertions would all pass against a classifier that returned one
        // value for everything, which is the behaviour being replaced.
        expect(new Set(cases.map(item => item.code)).size).toBe(cases.length);
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
                expect(captured.GIT_CONFIG_NOSYSTEM).toBe('1');
                expect(captured.GIT_CONFIG_GLOBAL).toBe(path.join(captured.HOME, '.gitconfig'));
                expect(captured.GIT_SSH_COMMAND).toContain('IdentitiesOnly=yes');
                expect(captured.GIT_SSH_COMMAND).toContain('IdentityAgent=none');
                expect(captured.GIT_SSH_COMMAND).toContain('IdentityFile=none');
                expect(captured.GIT_SSH_COMMAND).toContain(
                    path.join(root, 'mirrors', '.gitmirror-ssh', 'known_hosts')
                );
                expect(captured.HOME).not.toBe(process.env.HOME);
                expect(captured.USERPROFILE).toBe(captured.HOME);
                expect(captured.NEO_GITMIRROR_PASSWORD).toBe('file-secret-token');
                expect(captured.NEO_GITMIRROR_USERNAME).toBe('x-access-token');
                await expect(fs.pathExists(path.dirname(captured.GIT_ASKPASS))).resolves.toBe(false);
                await expect(fs.pathExists(captured.HOME)).resolves.toBe(false);
                await expect(fs.pathExists(
                    path.join(root, 'mirrors', '.gitmirror-ssh', 'known_hosts')
                )).resolves.toBe(true);
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

    test('passes only the explicit SSH key through the isolated runner (#16045)', async () => {
        const keyPath = path.join(root, 'tenant-ssh-key');

        await fs.writeFile(keyPath, '-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----\n');

        await withFakeGitCapture(async capturePath => {
            await expect(cloneIfMissing({
                ...mirrorOptions('ssh://git@example.com/tenant/repo.git'),
                credentialRef: `ssh:${keyPath}`
            })).rejects.toMatchObject({code: 'KB_GITMIRROR_CLONE_FAILED'});

            const captured = parseCapturedEnv(await fs.readFile(capturePath, 'utf-8'));

            expect(captured.GIT_SSH_COMMAND).toContain('IdentityAgent=none');
            expect(captured.GIT_SSH_COMMAND).toContain('IdentityFile=none');
            expect(captured.GIT_SSH_COMMAND).toContain(`-i '${keyPath}'`);
            expect(captured.GIT_SSH_COMMAND).not.toContain(process.env.HOME);
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
