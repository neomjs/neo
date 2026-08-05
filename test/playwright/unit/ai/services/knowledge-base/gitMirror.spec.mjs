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
    readRevisionFile,
    TenantRepoAccessCode,
    resolveHead
} from '../../../../../../ai/services/knowledge-base/helpers/gitMirror.mjs';

// Imported from the contract rather than re-exported through GitMirror: the clone-URL grammar has an
// owner, and this predicate is a member of it. Re-exporting it only for a test would blur that.
import {isTransportCloneUrl} from '../../../../../../ai/services/knowledge-base/helpers/tenantRepoAccessContract.mjs';

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

    /**
     * The mirror is blobless. A plain `--mirror` pulled every blob in history — 4.9 GB for one
     * repository on the container plane — while the ingestion only ever reads the current tree plus the
     * blobs of the paths it consumes.
     *
     * These use `file://` rather than a path, because git IGNORES `--filter` for local path clones, and
     * the source sets `uploadpack.allowFilter` because a remote that does not advertise filter support
     * makes git ignore it too — silently, with exit 0.
     */
    async function servesPartialClones(source) {
        await git(['config', 'uploadpack.allowFilter', 'true'], source);

        return `file://${source}`;
    }

    async function localObjectExists(mirrorPath, oid) {
        // GIT_NO_LAZY_FETCH is what makes this honest: without it the promisor machinery fetches the
        // very object under test and a full mirror is indistinguishable from a filtered one.
        return await execFileAsync('git', ['cat-file', '-e', oid], {
            cwd: mirrorPath,
            env: {...process.env, GIT_NO_LAZY_FETCH: '1'}
        }).then(() => true).catch(() => false);
    }

    test('a transport clone omits historical blobs, and the full-clone control proves the probe can see them', async () => {
        const source = await createSourceRepo();

        await commitSecondRevision(source);

        const cloneUrl = await servesPartialClones(source),
              head     = await git(['rev-parse', 'HEAD'], source),
              blobOid  = (await git(['ls-tree', '-r', '--object-only', head], source)).split('\n')[0];

        const {mirrorPath} = await cloneIfMissing({...mirrorOptions(source), cloneUrl});

        expect(await localObjectExists(mirrorPath, blobOid),
            'a blobless mirror must not hold the blob locally').toBe(false);

        // The control. Without it, a probe that always answered "absent" would pass the assertion above
        // while proving nothing — and every config-shaped check (promisor flag, partialclonefilter,
        // .promisor pack marker) is set on an IGNORED filter too, so none of them can stand in for this.
        const full = path.join(root, 'full-control');

        await execFileAsync('git', ['clone', '--mirror', cloneUrl, full]);
        expect(await localObjectExists(full, blobOid),
            'the control must report the blob PRESENT, or the probe cannot distinguish anything').toBe(true)
    });

    test('an incremental diff is identical on a blobless mirror — base-to-head is unaffected', async () => {
        // The reason this is `--filter=blob:none` and not `--depth`: a shallow clone makes the base
        // revision unreachable and breaks exactly this, forcing a full re-ingest every sync.
        const source = await createSourceRepo(),
              base   = await git(['rev-parse', 'HEAD'], source);

        await commitSecondRevision(source);

        const head     = await git(['rev-parse', 'HEAD'], source),
              cloneUrl = await servesPartialClones(source),
              blobless = await cloneIfMissing({...mirrorOptions(source), cloneUrl}),
              full     = path.join(root, 'full-diff-control');

        await execFileAsync('git', ['clone', '--mirror', cloneUrl, full]);

        const rawDiff = async cwd => (await execFileAsync(
            'git', ['diff', '--name-status', '-M', base, head], {cwd}
        )).stdout;

        // Byte-identical is the claim: the filter must not perturb the diff at all.
        expect(await rawDiff(blobless.mirrorPath)).toBe(await rawDiff(full));

        // And the real API must work over the blobless mirror, not just raw git.
        const {addedOrChanged, deleted} = await diffRevisions({...mirrorOptions(source), baseRevision: base, headRevision: head});

        expect(addedOrChanged.length + deleted.length,
            'the fixture must actually change paths, or the comparison above is two empty strings')
            .toBeGreaterThan(0)
    });

    test('reading a file from a blobless mirror returns its real content', async () => {
        // The lazy fetch, exercised rather than assumed. `show` is the one read that needs a blob, and
        // it is the operation that makes the trade acceptable — content arrives on demand.
        const source   = await createSourceRepo(),
              cloneUrl = await servesPartialClones(source),
              head     = await git(['rev-parse', 'HEAD'], source);

        await cloneIfMissing({...mirrorOptions(source), cloneUrl});

        expect(await readRevisionFile({...mirrorOptions(source), revision: head, sourcePath: 'alpha.txt'}))
            .toBe('alpha v1\n')
    });

    test('a remote that IGNORES the filter is refused, and the half-trusted mirror is removed', async () => {
        // git warns on stderr and exits 0, then records promisor config over a mirror holding every
        // blob. Accepting that would restore the 4.9 GB invisibly with the suite still green.
        const source = await createSourceRepo();

        // Deliberately NOT setting uploadpack.allowFilter — this is the unsupported-remote case.
        const cloneUrl = `file://${source}`,
              options  = {...mirrorOptions(source), cloneUrl};

        await expect(cloneIfMissing(options)).rejects.toThrow(/ignored it|blob filter/i);

        const mirrorPath = path.join(root, 'mirrors', 'tenant-a', 'local', 'source');

        expect(await fs.pathExists(mirrorPath),
            'a rejected mirror must not survive, or isUsableMirror accepts the full clone forever').toBe(false)
    });

    test('a bare local path is not held to the filter — git ignores it there by design', async () => {
        // Local path clones hardlink their object store, so there is no history to save and git
        // documents that it ignores `--filter`. Enforcing there would break every path-based caller.
        const source = await createSourceRepo();

        await expect(cloneIfMissing(mirrorOptions(source))).resolves.toMatchObject({cloned: true})
    });

    test('the guard is scoped by TRANSPORT, not by scheme — an SCP-style URL is still held to it', () => {
        // The gap this pins: `git@host:org/repo.git` carries no `://`, so a scheme test skipped the
        // assertion on the one documented tenant URL form that has no scheme — and therefore the one
        // form where a full mirror would pass every config-shaped check unchallenged. Found in review
        // by @neo-opus-grace. Both directions are asserted, because a predicate that answered `true`
        // for everything would satisfy the first three rows alone.
        [
            ['https://github.com/neomjs/neo.git',  true],
            ['ssh://git@github.com/neomjs/neo.git', true],
            ['file:///tmp/fixture.git',            true],
            ['git@github.com:neomjs/neo.git',      true],
            ['github.com:neomjs/neo.git',          true],
            ['/var/lib/mirrors/repo.git',          false],
            ['./relative/path.git',                false],
            // A Windows drive letter is a path, not a host. git resolves the same ambiguity the same way.
            ['C:\\repos\\mirror',                  false]
        ].forEach(([cloneUrl, expected]) => {
            expect(isTransportCloneUrl(cloneUrl), cloneUrl).toBe(expected)
        })
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
