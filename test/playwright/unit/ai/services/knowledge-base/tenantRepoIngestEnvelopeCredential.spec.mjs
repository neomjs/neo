import {test, expect} from '@playwright/test';

import fs          from 'fs-extra';
import os          from 'os';
import path        from 'path';
import {execFile}  from 'child_process';
import {promisify} from 'util';

import {cloneIfMissing, listRevisionPaths, readRevisionFile, resolveHead}
                                  from '../../../../../../ai/services/knowledge-base/helpers/gitMirror.mjs';
import {buildIngestEnvelope}      from '../../../../../../ai/services/knowledge-base/helpers/tenantRepoIngestEnvelopeBuilder.mjs';

const execFileAsync = promisify(execFile);

/**
 * @summary The blobless mirror's content read is the one git call that reaches the network, so it is
 * the one call that needs a credential.
 *
 * The tenant mirror is cloned `--filter=blob:none`. That keeps commits and trees
 * complete — `for-each-ref`, `rev-parse`, `merge-base`, `diff --name-status` and `ls-tree` are all
 * answered from disk — but leaves every blob absent, so `show <revision>:<path>` resolves through a
 * lazy promisor fetch against `remote.origin`. `gitMirror.mjs` documents that trade and asserts it is
 * "behind the same credential"; it was not. `credentialRef` reached `runGit` at the clone and fetch
 * call sites only, so against a private remote every tenant listed fine and then failed per file with
 * `KB_INGEST_ENVELOPE_FILE_READ_FAILED`.
 *
 * It survived every prior test because the only tenant repo this project has ingested is public, and
 * a public remote serves a promisor fetch to an anonymous client. These specs therefore avoid a
 * fixture that can succeed anonymously: the first makes the promisor remote genuinely unreachable, so
 * a read that did not need the network could not fail; the second asserts the credential reaches the
 * content read and NOT the graph and tree reads, which must stay unable to resolve a secret.
 *
 * @see https://github.com/neomjs/neo/issues/16631
 * @see ai/services/knowledge-base/helpers/gitMirror.mjs
 * @see ai/services/knowledge-base/helpers/tenantRepoIngestEnvelopeBuilder.mjs
 */

test.describe('Tenant repo ingest: content reads carry a credential (#16631)', () => {
    let root;

    test.beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-ingest-credential-test-'));
    });

    test.afterEach(async () => {
        await fs.remove(root);
    });

    async function git(args, cwd) {
        const {stdout} = await execFileAsync('git', args, {cwd});
        return stdout.trim();
    }

    /**
     * `file://` rather than a bare path: git ignores `--filter` for local path clones and hardlinks
     * the object store instead, which would hand the mirror every blob and make these specs vacuous.
     * `uploadpack.allowFilter` is what makes the source advertise filter support — without it git
     * warns, writes the promisor config anyway, and clones everything.
     */
    async function createFilterCapableSource() {
        const source = path.join(root, 'source');

        await fs.ensureDir(source);
        await git(['init', '--initial-branch=main'], source);
        await fs.writeFile(path.join(source, 'alpha.txt'), 'alpha v1\n');
        await git(['add', '.'], source);
        await git(['-c', 'user.name=Neo Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'initial'], source);
        await git(['config', 'uploadpack.allowFilter', 'true'], source);

        return {source, cloneUrl: `file://${source}`};
    }

    test('the content read needs the remote; the tree read does not', async () => {
        const
            {source, cloneUrl} = await createFilterCapableSource(),
            identity           = {mirrorRoot: path.join(root, 'mirrors'), tenantId: 'tenant-a', repoSlug: 'org/repo'};

        await cloneIfMissing({...identity, cloneUrl});

        const revision = await resolveHead({...identity, ref: 'HEAD'});

        // Make the promisor remote unreachable. Nothing else changes: the mirror, its refs and its
        // trees are untouched on disk, so any read answered locally must still succeed.
        await fs.remove(source);

        const paths = await listRevisionPaths({...identity, revision});

        expect(paths).toContain('alpha.txt');

        // The control above is what makes this assertion meaningful — the mirror is intact, so this
        // can only fail because `show` had to leave the machine.
        let readError = null;

        try {
            await readRevisionFile({...identity, revision, sourcePath: 'alpha.txt'});
        } catch (error) {
            readError = error;
        }

        expect(readError).not.toBeNull();
        expect(readError.code).toBe('KB_GITMIRROR_FILE_READ_FAILED');
    });

    test('the production read hands the credential to git, not merely to the builder', async () => {
        const
            {source} = await createFilterCapableSource(),
            identity = {mirrorRoot: path.join(root, 'mirrors'), tenantId: 'tenant-b', repoSlug: 'org/prod'};

        // A BARE PATH, not file://. git ignores --filter for a local path clone and hardlinks the
        // object store instead, so this mirror holds every blob. That is the point: the read below
        // cannot fail for want of the network, so the only variable left is the credential.
        await cloneIfMissing({...identity, cloneUrl: source});

        const revision = await resolveHead({...identity, ref: 'HEAD'});

        // Control. Without a credential the read succeeds — proving the failure asserted next is
        // caused by the credential reaching git, and not by a broken mirror or an absent blob.
        expect(await readRevisionFile({...identity, revision, sourcePath: 'alpha.txt'})).toContain('alpha');

        // Witness. An `env:` credentialRef naming a variable that does not exist can only fail inside
        // runGit's credential resolution. So this throws if and only if credentialRef travelled all
        // the way from readRevisionFile's signature into the real runGit call — which is the seam a
        // fake gitMirror can never exercise, and the one deleting the argument would break.
        let credentialError = null;

        try {
            await readRevisionFile({
                ...identity,
                revision,
                sourcePath   : 'alpha.txt',
                credentialRef: 'env:NEO_TEST_DELIBERATELY_ABSENT_TOKEN'
            });
        } catch (error) {
            credentialError = error;
        }

        expect(credentialError).not.toBeNull();
        expect(credentialError.code).toBe('KB_GITMIRROR_CREDENTIAL_REF_INVALID');
    });

    test('credentialRef reaches the content read and only the content read', async () => {
        const
            credentialRef = 'env:TENANT_TEST_TOKEN',
            seen          = {
                resolveHead      : [],
                isAncestor       : [],
                diffRevisions    : [],
                listRevisionPaths: [],
                readRevisionFile : []
            },
            record        = (name, options) => {
                seen[name].push(options.credentialRef);
            };

        const gitMirrorFake = {
            resolveHead(options) {
                record('resolveHead', options);
                return 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
            },
            isAncestor(options) {
                record('isAncestor', options);
                return true;
            },
            diffRevisions(options) {
                record('diffRevisions', options);
                return {addedOrChanged: ['alpha.txt'], deleted: []};
            },
            listRevisionPaths(options) {
                record('listRevisionPaths', options);
                return ['alpha.txt'];
            },
            readRevisionFile(options) {
                record('readRevisionFile', options);
                return 'alpha v1\n';
            }
        };

        const
            mirrorRoot = path.join(root, 'mirrors'),
            {cloneUrl} = await createFilterCapableSource();

        // buildIngestEnvelope refuses a mirror that is not on disk before it reaches any git call, so
        // a real one has to exist even though every read below is faked. Created through
        // cloneIfMissing rather than mkdir so the fixture lands wherever the mirror-path derivation
        // puts it — a hand-built path would encode a layout this spec has no business pinning.
        await cloneIfMissing({mirrorRoot, tenantId: 'tenant-a', repoSlug: 'org/repo', cloneUrl});

        // BOTH envelope shapes, because they read through different call chains and a single run
        // exercises only one of them: with a base revision the builder diffs and never calls
        // listRevisionPaths, so asserting on that call from the incremental run alone is an
        // assertion over an empty array — vacuously true, and green against a mirror that leaks the
        // credential to every read.
        await buildIngestEnvelope({
            tenantId       : 'tenant-a',
            repoSlug       : 'org/repo',
            mirrorRoot,
            lastIngestedRev: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            gitMirror      : gitMirrorFake,
            credentialRef
        });
        await buildIngestEnvelope({
            tenantId       : 'tenant-a',
            repoSlug       : 'org/repo',
            mirrorRoot,
            lastIngestedRev: null,
            gitMirror      : gitMirrorFake,
            credentialRef
        });

        // Every guarded call must have been OBSERVED before its polarity means anything.
        for (const [name, refs] of Object.entries(seen)) {
            expect(refs.length, `${name} was never called, so its assertion proves nothing`).toBeGreaterThan(0);
        }

        // The fix.
        expect(seen.readRevisionFile.every(ref => ref === credentialRef)).toBe(true);

        // The invariant the fix must not break. A read that cannot reach the network must stay unable
        // to resolve a secret, so a later "consistency" pass cannot widen this by spreading
        // credentialRef onto `identity`.
        expect(seen.resolveHead.every(ref => ref === undefined)).toBe(true);
        expect(seen.isAncestor.every(ref => ref === undefined)).toBe(true);
        expect(seen.diffRevisions.every(ref => ref === undefined)).toBe(true);
        expect(seen.listRevisionPaths.every(ref => ref === undefined)).toBe(true);
    });
});
