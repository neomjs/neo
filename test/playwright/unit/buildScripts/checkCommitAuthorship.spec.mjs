import {test, expect}  from '@playwright/test';
import {execFileSync}  from 'node:child_process';
import fs              from 'fs-extra';
import os              from 'os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const
    repoRoot  = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
    guardPath = path.join(repoRoot, 'buildScripts/util/check-commit-authorship.mjs');

/**
 * @summary The authorship guard, run against real git repositories rather than a mocked `execSync`.
 *
 * The guard's entire job is reading git's actual answers — which working tree it is in, and who
 * authored what. A suite that stubbed `execSync` would prove only that the guard parses strings the
 * test invented, and the defect it exists to catch (a real worktree silently resolving a real global
 * identity) lives precisely in the part a stub replaces.
 *
 * So these build throwaway repos on disk: a main checkout, linked worktrees, and an agent-owned
 * independent clone distinguished by the same `NEO_AGENT_IDENTITY` pin the bootstrap consumes.
 */
test.describe('check-commit-authorship — the operator must not author from an agent checkout', () => {
    let tmpRoot;

    const git = (cwd, args, env=process.env) =>
        execFileSync('git', args, {cwd, encoding: 'utf8', env, stdio: ['pipe', 'pipe', 'pipe']});

    /**
     * @summary Writes the test-owned global Git identity and returns its HOME.
     * @param {String} globalEmail
     * @returns {String}
     */
    function writeGlobalIdentity(globalEmail) {
        const home = path.join(tmpRoot, 'home');

        fs.outputFileSync(path.join(home, '.gitconfig'), `[user]\n\temail = ${globalEmail}\n\tname = Operator\n`);

        return home
    }

    /**
     * @summary Runs the guard in `cwd` with an injected global identity.
     * @param {String} cwd
     * @param {String} globalEmail The operator identity the guard should treat as the leak source.
     * @param {String} stdin The pre-push hook payload.
     * @param {Object} [options]
     * @param {String} [options.agentIdentity] The agent-ownership pin; absent means operator checkout.
     * @returns {{status: Number, stderr: String}}
     */
    function runGuard(cwd, globalEmail, stdin = '', {agentIdentity} = {}) {
        // HOME is redirected so the guard reads THIS as `git config --global user.email` rather than
        // the real developer's — the global config is an input to the rule, so the test owns it.
        const
            home = writeGlobalIdentity(globalEmail),
            env  = {...process.env, HOME: home};

        if (agentIdentity) {
            env.NEO_AGENT_IDENTITY = agentIdentity
        } else {
            delete env.NEO_AGENT_IDENTITY
        }

        try {
            execFileSync('node', [guardPath], {cwd, encoding: 'utf8', env, input: stdin, stdio: ['pipe', 'pipe', 'pipe']});
            return {status: 0, stderr: ''}
        } catch (error) {
            return {status: error.status, stderr: `${error.stderr || ''}`}
        }
    }

    /**
     * @summary A main checkout with an `origin/dev` to measure the push range against.
     * @returns {String} the main checkout path
     */
    function createMainCheckout() {
        const main = path.join(tmpRoot, 'main');

        fs.ensureDirSync(main);
        git(main, ['init', '-b', 'dev', '--quiet']);
        git(main, ['config', 'user.email', 'operator@example.com']);
        git(main, ['config', 'user.name', 'Operator']);
        fs.outputFileSync(path.join(main, 'seed.txt'), 'seed\n');
        git(main, ['add', '.']);
        git(main, ['commit', '-m', 'seed', '--quiet', '--no-verify']);

        // the guard measures `origin/dev..HEAD`; a self-remote gives it a real ref to resolve
        git(main, ['remote', 'add', 'origin', main]);
        git(main, ['fetch', 'origin', '--quiet']);

        return main
    }

    test.beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'authorship-guard-'))
    });

    test.afterEach(() => fs.removeSync(tmpRoot));

    test('FIRES on an operator-authored commit in a linked worktree — and names the commit', () => {
        const
            main = createMainCheckout(),
            tree = path.join(tmpRoot, 'wt');

        git(main, ['worktree', 'add', '-b', 'agent/lane', tree, 'dev', '--quiet']);

        // the defect exactly: the worktree sets no identity, so git resolves the operator's global one
        fs.outputFileSync(path.join(tree, 'work.txt'), 'agent work\n');
        git(tree, ['add', '.']);
        git(tree, ['-c', 'user.email=operator@example.com', '-c', 'user.name=Operator',
            'commit', '-m', 'feat: work the agent actually did', '--quiet', '--no-verify']);

        const result = runGuard(tree, 'operator@example.com');

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('authored as the operator');
        // naming the commit matters: a count tells nobody which commit to repair
        expect(result.stderr).toContain('feat: work the agent actually did')
    });

    test('FIRES in an agent-owned independent clone that still resolves the operator identity', () => {
        const
            clone = createMainCheckout(),
            home  = writeGlobalIdentity('operator@example.com'),
            env   = {...process.env, HOME: home};

        git(clone, ['checkout', '-b', 'agent/lane', '--quiet']);
        git(clone, ['config', '--unset', 'user.email']);
        git(clone, ['config', '--unset', 'user.name']);

        expect(git(clone, ['config', '--local', '--list'], env)).not.toContain('user.email');

        fs.outputFileSync(path.join(clone, 'work.txt'), 'agent work from a stale clone\n');
        git(clone, ['add', '.']);
        git(clone, ['commit', '-m', 'feat: stale independent-clone identity', '--quiet', '--no-verify'], env);

        const result = runGuard(clone, 'operator@example.com', '', {agentIdentity: 'neo-gpt-emmy'});

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('feat: stale independent-clone identity')
    });

    test('SILENT in the operator\'s OWN checkout — his commits there are correct', () => {
        const main = createMainCheckout();

        git(main, ['checkout', '-b', 'agent/lane', '--quiet']);
        fs.outputFileSync(path.join(main, 'work.txt'), 'operator work\n');
        git(main, ['add', '.']);
        git(main, ['commit', '-m', 'feat: operator work', '--quiet', '--no-verify']);

        // The false positive that would make the guard unusable. The main checkout answers
        // `--git-dir` relatively and `--git-common-dir` relatively too, so a naive string compare
        // reports it as linked and blocks every commit the operator makes in his own repo.
        const result = runGuard(main, 'operator@example.com');

        expect(result.status).toBe(0);
        expect(result.stderr).toBe('')
    });

    test('SILENT in a linked worktree that authors correctly — the guard targets identity, not worktrees', () => {
        const
            main = createMainCheckout(),
            tree = path.join(tmpRoot, 'wt');

        git(main, ['worktree', 'add', '-b', 'agent/lane', tree, 'dev', '--quiet']);
        fs.outputFileSync(path.join(tree, 'work.txt'), 'agent work\n');
        git(tree, ['add', '.']);
        // `neo-opus-4-7@` rather than `ada@`: the latter is the display-name DERIVATION that
        // agentCoAuthorEmails.mjs documents as having produced 19 mis-credited commits, so a
        // fixture calling it "authors correctly" quietly propagated the defect next door.
        git(tree, ['-c', 'user.email=neo-opus-4-7@neomjs.com', '-c', 'user.name=Ada',
            'commit', '-m', 'feat: properly attributed work', '--quiet', '--no-verify']);

        const result = runGuard(tree, 'operator@example.com');

        expect(result.status).toBe(0)
    });

    test('a SIBLING-ref push cannot smuggle an operator commit past a clean HEAD', () => {
        // @neo-gpt's RA-1. The guard hard-coded `origin/dev..HEAD`, so pushing an explicit sibling ref
        // was measured against whatever HEAD happened to be — clean — and exited green while shipping
        // the operator-authored commit. A bypass in a guard whose whole purpose is being unbypassable.
        const
            main = createMainCheckout(),
            tree = path.join(tmpRoot, 'wt');

        git(main, ['worktree', 'add', '-b', 'agent/dirty', tree, 'dev', '--quiet']);
        fs.outputFileSync(path.join(tree, 'work.txt'), 'agent work\n');
        git(tree, ['add', '.']);
        git(tree, ['-c', 'user.email=operator@example.com', '-c', 'user.name=Operator',
            'commit', '-m', 'feat: smuggled on a sibling ref', '--quiet', '--no-verify']);

        const dirtySha = git(tree, ['rev-parse', 'agent/dirty']).trim();

        // HEAD moves to a CLEAN branch — exactly the state the old range measured
        git(tree, ['checkout', '-b', 'agent/clean', 'dev', '--quiet']);

        // git's real pre-push payload: <localRef> <localSha> <remoteRef> <remoteSha>; zero-sha = new branch
        const payload = `refs/heads/agent/dirty ${dirtySha} refs/heads/agent/dirty ${'0'.repeat(40)}\n`;

        const result = runGuard(tree, 'operator@example.com', payload);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('feat: smuggled on a sibling ref')
    });

    test('a ref DELETION sends no commits — the guard stays silent', () => {
        const
            main = createMainCheckout(),
            tree = path.join(tmpRoot, 'wt');

        git(main, ['worktree', 'add', '-b', 'agent/lane', tree, 'dev', '--quiet']);

        // a delete pushes a zero localSha; scanning it would be scanning nothing, loudly
        const payload = `(delete) ${'0'.repeat(40)} refs/heads/agent/lane ${'0'.repeat(40)}\n`;

        expect(runGuard(tree, 'operator@example.com', payload).status).toBe(0)
    });

    test('catches an operator commit buried among correctly-authored ones', () => {
        const
            main = createMainCheckout(),
            tree = path.join(tmpRoot, 'wt');

        git(main, ['worktree', 'add', '-b', 'agent/lane', tree, 'dev', '--quiet']);

        // one bad commit in the middle: scanning only HEAD would miss it, and the real incident was
        // 38 commits deep across branches nobody re-read
        [['neo-opus-4-7@neomjs.com', 'feat: first'], ['operator@example.com', 'feat: the buried one'], ['neo-opus-4-7@neomjs.com', 'feat: third']]
            .forEach(([email, subject], index) => {
                fs.outputFileSync(path.join(tree, `work-${index}.txt`), `${subject}\n`);
                git(tree, ['add', '.']);
                git(tree, ['-c', `user.email=${email}`, '-c', 'user.name=Author', 'commit', '-m', subject, '--quiet', '--no-verify'])
            });

        const result = runGuard(tree, 'operator@example.com');

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('1 commit(s)');
        expect(result.stderr).toContain('feat: the buried one');
        expect(result.stderr).not.toContain('feat: first')
    })

    /**
     * The co-author half of the same guard. It shares this file's discipline deliberately: the unit
     * suite over `findUnknownCoAuthors` proves the PREDICATE, and only running the real script
     * against a real repository proves the EXIT CODE, which is the part that actually stops a push.
     * A predicate that returns offenders into a caller that warns is what shipped 16 mis-credited
     * commits.
     */
    test.describe('co-author trailers — GitHub credits by address, so a wrong one credits a person', () => {
        const
            ROSTER_AUTHOR  = 'neo-opus-4-7@neomjs.com',
            ROSTER_TRAILER = 'neo-opus-vega@neomjs.com',
            OFF_DOMAIN     = 'real.person@example.com';

        /**
         * @summary Commits one file under an explicit author, with an optional trailer block.
         * @param {String} cwd
         * @param {Object} options
         * @param {String} options.authorEmail
         * @param {String} options.subject
         * @param {String} [options.trailer]
         */
        function commitAs(cwd, {authorEmail, subject, trailer}) {
            fs.outputFileSync(path.join(cwd, `${subject.replace(/\W+/gu, '-')}.txt`), 'x\n');
            git(cwd, ['add', '.']);
            git(cwd, ['commit', '-m', trailer ? `${subject}\n\n${trailer}` : subject, '--quiet', '--no-verify'], {
                ...process.env,
                GIT_AUTHOR_NAME    : 'Seat',
                GIT_AUTHOR_EMAIL   : authorEmail,
                GIT_COMMITTER_NAME : 'Seat',
                GIT_COMMITTER_EMAIL: authorEmail
            })
        }

        test('BLOCKS an agent-authored commit whose trailer address is off-domain', () => {
            // The shipped defect, at the exit code rather than the predicate. Off-domain is where a
            // real person's account lives, and the previous guard could not see it at all.
            const main = createMainCheckout();

            commitAs(main, {
                authorEmail: ROSTER_AUTHOR,
                subject    : 'feat: credits a person',
                trailer    : `Co-Authored-By: Some Agent <${OFF_DOMAIN}>`
            });

            const result = runGuard(main, 'operator@example.com');

            expect(result.status).toBe(1);
            expect(result.stderr).toContain(OFF_DOMAIN);
            expect(result.stderr).toContain('feat: credits a person')
        });

        test('SILENT when the same commit credits a roster address', () => {
            // Without this control the assertion above would pass against a check that blocks
            // every trailer.
            const main = createMainCheckout();

            commitAs(main, {
                authorEmail: ROSTER_AUTHOR,
                subject    : 'feat: credits a seat',
                trailer    : `Co-Authored-By: Vega <${ROSTER_TRAILER}>`
            });

            expect(runGuard(main, 'operator@example.com').status).toBe(0)
        });

        test('does NOT block a NON-agent author carrying the very same off-domain trailer', () => {
            // The property the domain scoping existed to protect. An outside contributor's commit is
            // not agent-authored, so nothing about them is inspected — proved at the exit code, not
            // inferred from the predicate.
            const main = createMainCheckout();

            commitAs(main, {
                authorEmail: 'outsider@example.org',
                subject    : 'feat: an outside contribution',
                trailer    : `Co-Authored-By: Their Pair <${OFF_DOMAIN}>`
            });

            expect(runGuard(main, 'operator@example.com').status).toBe(0)
        });

        test('a project-domain author the map does not carry is UNAFFECTED — #17195 AC-3', () => {
            // This test previously asserted status 1 and PINNED a violation of the PR's own AC-3
            // ("a commit whose author is NOT a roster agent is unaffected"). @neo-gpt caught both
            // the rule and the test that made it durable. The seat gap the refusal was covering is
            // closed at the binder, which will not bind an unmapped seat at all.
            const main = createMainCheckout();

            commitAs(main, {authorEmail: 'neo-unmapped-seat@neomjs.com', subject: 'feat: unknown seat'});

            expect(runGuard(main, 'operator@example.com').status).toBe(0)
        });

        test('BLOCKS an --author override on an agent lane — %ae is not an identity', () => {
            // The bypass, measured before the fix: one `git commit --author=` flag reclassified an
            // agent as a human and carried a poisoned trailer to exit 0. The lane comes from
            // checkout ownership here, which the committer cannot rewrite from inside a commit.
            const
                main = createMainCheckout(),
                tree = path.join(tmpRoot, 'seat-lane');

            git(main, ['worktree', 'add', '-b', 'agent/lane-override', tree, 'dev', '--quiet']);
            fs.outputFileSync(path.join(tree, 'w.txt'), 'x\n');
            git(tree, ['add', '.']);
            git(tree, ['-c', `user.email=${ROSTER_AUTHOR}`, '-c', 'user.name=Ada', 'commit',
                '--author', 'Ada <off-domain@example.com>',
                '-m', `feat: laundered\n\nCo-Authored-By: Someone <${OFF_DOMAIN}>`, '--quiet', '--no-verify']);

            const result = runGuard(tree, 'operator@example.com');

            expect(result.status).toBe(1);
            expect(result.stderr).toContain(OFF_DOMAIN)
        });

        test('a clean agent commit with no trailer at all is silent', () => {
            const main = createMainCheckout();

            commitAs(main, {authorEmail: ROSTER_AUTHOR, subject: 'feat: nothing to credit'});

            expect(runGuard(main, 'operator@example.com').status).toBe(0)
        })
    })
});

/**
 * @summary The bootstrap's early warning — the other half of the same defect.
 *
 * The guard above fires at push, after the work is committed. This fires at worktree creation, when
 * someone is actually reading the output. Neither replaces the other: the warning is skippable, and
 * the backstop only speaks once 38 commits already exist.
 */
test.describe('bootstrapWorktree — inspectGitIdentity', () => {
    let inspectGitIdentity;

    test.beforeAll(async () => {
        inspectGitIdentity = (await import('../../../../ai/scripts/migrations/bootstrapWorktree.mjs')).inspectGitIdentity
    });

    /** @param {Object} values `{global, local, effective}` git config answers. */
    const readConfig = values => async args => {
        if (args.includes('--global'))   return values.global   ?? '';
        if (args.includes('--worktree')) return values.worktree ?? '';
        if (args.includes('--local'))    return values.local    ?? '';
        return values.effective ?? '';
    };

    test('no local identity + the global one answering = the leak, reported', async () => {
        const result = await inspectGitIdentity({
            projectRoot: '/tmp',
            readConfig : readConfig({global: 'operator@example.com', local: '', effective: 'operator@example.com'})
        });

        expect(result.inherited).toBe(true);
        expect(result.global).toBe('operator@example.com')
    });

    test('a worktree with its OWN identity is silent', async () => {
        const result = await inspectGitIdentity({
            projectRoot: '/tmp',
            readConfig : readConfig({global: 'operator@example.com', local: 'ada@neomjs.com', effective: 'ada@neomjs.com'})
        });

        expect(result.inherited).toBe(false);
        expect(result.local).toBe('ada@neomjs.com')
    });

    test('worktree config outranks the shared repository-local identity', async () => {
        const result = await inspectGitIdentity({
            projectRoot: '/tmp',
            readConfig : readConfig({
                global   : 'operator@example.com',
                local    : 'operator@example.com',
                worktree : 'euclid@neomjs.com',
                effective: 'euclid@neomjs.com'
            })
        });

        expect(result.inherited).toBe(false);
        expect(result.local).toBe('euclid@neomjs.com')
    });

    test('a local identity that EQUALS the global one is a choice, not a leak', async () => {
        // The operator bootstrapping a worktree for himself set it deliberately. The defect is the
        // ABSENCE of a local identity, not the value — flagging this would train people to ignore it.
        const result = await inspectGitIdentity({
            projectRoot: '/tmp',
            readConfig : readConfig({global: 'operator@example.com', local: 'operator@example.com', effective: 'operator@example.com'})
        });

        expect(result.inherited).toBe(false)
    });

    test('no global identity at all → nothing to leak, nothing to say', async () => {
        const result = await inspectGitIdentity({
            projectRoot: '/tmp',
            readConfig : readConfig({global: '', local: '', effective: ''})
        });

        expect(result.inherited).toBe(false)
    })
});

/**
 * @summary The bootstrap-side cure: resolve one authenticated agent identity, then bind it at the
 * narrowest Git scope the checkout topology supports.
 *
 * These tests use real repositories because `extensions.worktreeConfig` plus `--worktree` is the
 * contract under test. Mocking Git would prove only an argv spelling while missing the original
 * failure mode: sibling worktrees silently sharing the operator's repository config.
 */
test.describe('#15337 bootstrapWorktree — configureAgentGitIdentity', () => {
    let configureAgentGitIdentity;
    let tmpRoot;

    const git = (cwd, args) => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']});

    test.beforeAll(async () => {
        configureAgentGitIdentity =
            (await import('../../../../ai/scripts/migrations/bootstrapWorktree.mjs')).configureAgentGitIdentity
    });

    test.beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-git-identity-'))
    });

    test.afterEach(() => fs.removeSync(tmpRoot));

    /**
     * @summary Creates a main checkout with a deliberately operator-owned repository identity.
     * @returns {String} Absolute main-checkout path.
     */
    function createMainCheckout() {
        const main = path.join(tmpRoot, 'main');

        fs.ensureDirSync(main);
        git(main, ['init', '-b', 'dev', '--quiet']);
        git(main, ['config', 'user.email', 'operator@example.com']);
        git(main, ['config', 'user.name', 'Operator']);
        git(main, ['commit', '--allow-empty', '-m', 'seed', '--quiet', '--no-verify']);

        return main
    }

    /**
     * @summary Returns an injected GitHub-account reader without exposing auth to the test process.
     * @param {String} login Authenticated GitHub login.
     * @param {String} email Verified primary email.
     * @returns {Function} Async account reader.
     */
    function account(login, email) {
        return async () => ({
            login,
            emails: [{email, primary: true, verified: true}]
        })
    }

    /**
     * The bypass @neo-gpt found in the co-author guard, closed at the only layer that can close it.
     * The push-time guard reads a commit's author email, which is self-asserted — so it can only
     * infer agent-ness from email shape. This binder holds AUTHENTICATED identity, so requiring the
     * verified primary to BE the seat's roster address is what turns that inference into a property.
     */
    test.describe('the authenticated primary must be the seat roster address', () => {
        test('REFUSES an off-domain verified primary — the co-author guard bypass', async () => {
            // Authenticated, verified, non-noreply, login matches the registry: every pre-existing
            // check passes. Binding it would author this agent from an address the trailer guard
            // reads as non-agent, so its poisoned trailers would exit 0.
            const gitCalls = [];

            await expect(configureAgentGitIdentity({
                projectRoot            : '/tmp/agent-seat',
                mainCheckout           : '/tmp/main-checkout',
                agentIdentity          : '@neo-gpt',
                getAuthenticatedAccount: account('neo-gpt', 'someone@example.com'),
                execGit                : async args => { gitCalls.push(args); return {stdout: ''} }
            })).rejects.toThrow(/does not match its roster commit address/u);

            // Fails before the first git call, so no partial identity is left behind.
            expect(gitCalls).toEqual([])
        });

        // The unmapped-seat branch is NOT exercised here on purpose: it is unreachable through this
        // path today, because the registry lookup runs first and `reconcileWithRegistry().missingEmail`
        // is asserted empty in agentCoAuthorEmails.spec.mjs — so no registry seat lacks a map entry.
        // It is defensive against those two drifting apart, and `rosterEmailForLogin` is pinned for
        // the null case directly in that spec rather than faked through a binder that cannot reach it.

        test('POSITIVE CONTROL — a matching roster primary still binds', async () => {
            // Without this the refusals above would pass against a binder that refuses everything.
            const main = createMainCheckout(),
                tree   = path.join(tmpRoot, 'seat-ok');

            git(main, ['worktree', 'add', '-b', 'agent/ok', tree, 'dev', '--quiet']);

            const result = await configureAgentGitIdentity({
                projectRoot            : tree,
                mainCheckout           : main,
                agentIdentity          : '@neo-gpt',
                getAuthenticatedAccount: account('neo-gpt', 'neo-gpt@neomjs.com')
            });

            expect(result.action).toBe('configured');
            expect(result.email).toBe('neo-gpt@neomjs.com')
        })
    });

    test('keeps main + TWO sibling worktree identities isolated in real Git config files', async () => {
        const
            main  = createMainCheckout(),
            treeA = path.join(tmpRoot, 'seat-a'),
            treeB = path.join(tmpRoot, 'seat-b');

        git(main, ['worktree', 'add', '-b', 'agent/a', treeA, 'dev', '--quiet']);
        git(main, ['worktree', 'add', '-b', 'agent/b', treeB, 'dev', '--quiet']);

        await configureAgentGitIdentity({
            projectRoot            : treeA,
            mainCheckout           : main,
            agentIdentity          : '@neo-gpt',
            getAuthenticatedAccount: account('neo-gpt', 'neo-gpt@neomjs.com')
        });
        await configureAgentGitIdentity({
            projectRoot            : treeB,
            mainCheckout           : main,
            agentIdentity          : '@neo-gpt-emmy',
            getAuthenticatedAccount: account('neo-gpt-emmy', 'neo-gpt-emmy@neomjs.com')
        });

        expect(git(main,  ['config', 'user.name']).trim()).toBe('Operator');
        expect(git(main,  ['config', 'user.email']).trim()).toBe('operator@example.com');
        expect(git(treeA, ['config', 'user.name']).trim()).toBe('Euclid');
        expect(git(treeA, ['config', 'user.email']).trim()).toBe('neo-gpt@neomjs.com');
        expect(git(treeB, ['config', 'user.name']).trim()).toBe('Emmy');
        expect(git(treeB, ['config', 'user.email']).trim()).toBe('neo-gpt-emmy@neomjs.com');

        expect(git(treeA, ['config', '--show-origin', 'user.email'])).toContain('/config.worktree');
        expect(git(treeB, ['config', '--show-origin', 'user.email'])).toContain('/config.worktree')
    });

    test('skips the main checkout without consulting agent or GitHub identity', async () => {
        const main = createMainCheckout();

        const result = await configureAgentGitIdentity({
            projectRoot            : main,
            mainCheckout           : main,
            agentIdentity          : '',
            getAuthenticatedAccount: async () => { throw new Error('must not be called') }
        });

        expect(result).toEqual({action: 'skipped-main-checkout'});
        expect(git(main, ['config', 'user.name']).trim()).toBe('Operator');
        expect(git(main, ['config', 'user.email']).trim()).toBe('operator@example.com')
    });

    test('uses clone-local config for an explicit independent clone', async () => {
        const
            independent = path.join(tmpRoot, 'independent'),
            canonical   = path.join(tmpRoot, 'different-canonical');

        fs.ensureDirSync(independent);
        git(independent, ['init', '-b', 'dev', '--quiet']);
        git(independent, ['config', 'user.email', 'operator@example.com']);
        git(independent, ['config', 'user.name', 'Operator']);
        git(independent, ['commit', '--allow-empty', '-m', 'seed', '--quiet', '--no-verify']);

        const result = await configureAgentGitIdentity({
            projectRoot            : independent,
            mainCheckout           : canonical,
            agentIdentity          : '@neo-gpt',
            getAuthenticatedAccount: account('neo-gpt', 'neo-gpt@neomjs.com')
        });

        expect(result.scope).toBe('local');
        expect(git(independent, ['config', 'user.name']).trim()).toBe('Euclid');
        expect(git(independent, ['config', 'user.email']).trim()).toBe('neo-gpt@neomjs.com');
        expect(git(independent, ['config', '--show-origin', 'user.email'])).toContain('.git/config')
    });

    for (const scenario of [
        {
            name         : 'missing agent identity',
            agentIdentity: '',
            account      : account('neo-gpt', 'neo-gpt@neomjs.com'),
            error        : /NEO_AGENT_IDENTITY/
        },
        {
            name         : 'unmapped agent identity',
            agentIdentity: '@not-a-resident',
            account      : account('not-a-resident', 'unknown@example.com'),
            error        : /not-a-resident/
        },
        {
            name         : 'authenticated-login mismatch',
            agentIdentity: '@neo-gpt',
            account      : account('neo-opus-vega', 'neo-opus-vega@neomjs.com'),
            error        : /does not match/
        },
        {
            name         : 'no verified primary email',
            agentIdentity: '@neo-gpt',
            account      : async () => ({login: 'neo-gpt', emails: [{email: 'other@example.com', primary: false, verified: true}]}),
            error        : /verified primary/
        },
        {
            name         : 'noreply primary email',
            agentIdentity: '@neo-gpt',
            account      : account('neo-gpt', 'neo-gpt@users.noreply.github.com'),
            error        : /noreply/
        }
    ]) {
        test(`${scenario.name} fails before any git call`, async () => {
            const gitCalls = [];

            await expect(configureAgentGitIdentity({
                projectRoot            : '/tmp/agent-seat',
                mainCheckout           : '/tmp/main-checkout',
                agentIdentity          : scenario.agentIdentity,
                getAuthenticatedAccount: scenario.account,
                execGit                : async args => { gitCalls.push(args); return {stdout: ''} }
            })).rejects.toThrow(scenario.error);

            expect(gitCalls).toEqual([])
        })
    }
});
