import {test, expect} from '@playwright/test';
import {
    getBindingProblems,
    getFinishStep,
    getPrBodyProblems,
    getPrepareStep,
    ObservationError,
    observe,
    readBranchRules,
    readPrepareBlockers,
    readReleaseState
} from '../../../../../buildScripts/release/releaseState.mjs';

/**
 * Coverage for `buildScripts/release/releaseState.mjs`: each phase of `publish.mjs` reads how far a release got and
 * continues from there. The reads run through a scripted command runner, so every outcome of the command boundary
 * (success, proven absence, failure) is exercised against the production readers.
 */

const
    names  = {repo: 'neomjs/neo', version: '13.3.0', releaseBranch: 'release/v13.3.0'},
    sha    = char => char.repeat(40),
    ok     = stdout => ({status: 0, stdout, stderr: ''}),
    err    = (status, stderr) => ({status, stdout: '', stderr}),
    absent = {
        'gh pr list --repo neomjs/neo --head release/v13.3.0 --base dev --state all --limit 1 --json number,state,url,mergeCommit,headRefOid': ok('[]'),
        'gh api repos/neomjs/neo/releases/tags/13.3.0 --jq .tag_name'                                                                        : err(1, 'gh: Not Found (HTTP 404)'),
        'git ls-remote --tags origin refs/tags/13.3.0 refs/tags/13.3.0^{}'                                                                   : ok(''),
        'git rev-parse --verify --quiet refs/heads/release/v13.3.0'                                                                          : err(1, ''),
        'git rev-parse --abbrev-ref HEAD'                                                                                                    : ok('dev'),
        'git ls-remote --heads origin release/v13.3.0'                                                                                       : ok(''),
        'git rev-parse origin/main^{tree}'                                                                                                   : ok(sha('m'))
    },
    // A runner answering only scripted commands; an unexpected call fails the test instead of passing silently
    runner = (script, calls = []) => args => {
        const key = args.join(' ');
        calls.push(key);
        if (!(key in script)) throw new Error(`unscripted command: ${key}`);
        return script[key]
    },
    open   = {number: 1, state: 'OPEN',   url: 'https://github.com/neomjs/neo/pull/1', mergeCommit: null,     headSha: sha('l')},
    merged = {number: 1, state: 'MERGED', url: 'https://github.com/neomjs/neo/pull/1', mergeCommit: sha('a'), headSha: sha('l')},
    closed = {number: 1, state: 'CLOSED', url: 'https://github.com/neomjs/neo/pull/1', mergeCommit: null,     headSha: sha('l')},
    fresh  = {headBranch: 'dev', pr: null, release: null, tagCommit: null, remoteBranchSha: null, localBranchSha: null, localAhead: 0, mainTree: sha('m'), mergeTree: null};

test.describe('the command boundary: an unknown never passes for an absence', () => {
    test('observe returns output, a proven absence as null, and throws on any other failure', () => {
        expect(observe(runner({'a': ok(' out \n')}), ['a'])).toBe('out');
        expect(observe(runner({'a': err(1, 'gh: Not Found (HTTP 404)')}), ['a'], ({stderr}) => /HTTP 404/.test(stderr))).toBeNull();
        expect(() => observe(runner({'a': err(1, 'gh: Forbidden (HTTP 403)')}), ['a'], ({stderr}) => /HTTP 404/.test(stderr))).toThrow(ObservationError);
        expect(() => observe(runner({'a': err(128, 'fatal: unable to access')}), ['a'])).toThrow(ObservationError);
    });

    test('a release nobody started reads as fresh', () => {
        expect(readReleaseState(runner(absent), names)).toEqual(fresh);
    });

    test('a failed PR lookup, release lookup or ref listing throws instead of reading as absent', () => {
        for (const [key, failure] of [
            ['gh pr list --repo neomjs/neo --head release/v13.3.0 --base dev --state all --limit 1 --json number,state,url,mergeCommit,headRefOid', err(1, 'HTTP 502: Bad Gateway')],
            ['gh api repos/neomjs/neo/releases/tags/13.3.0 --jq .tag_name', err(1, 'gh: Forbidden (HTTP 403)')],
            ['git ls-remote --heads origin release/v13.3.0', err(128, 'fatal: Could not read from remote repository.')],
            ['git ls-remote --tags origin refs/tags/13.3.0 refs/tags/13.3.0^{}', err(128, 'fatal: Could not read from remote repository.')]
        ]) {
            expect(() => readReleaseState(runner({...absent, [key]: failure}), names), key).toThrow(ObservationError);
        }
    });

    test('an annotated tag binds through its peeled commit', () => {
        const state = readReleaseState(runner({
            ...absent,
            'git ls-remote --tags origin refs/tags/13.3.0 refs/tags/13.3.0^{}': ok(`${sha('t')}\trefs/tags/13.3.0\n${sha('c')}\trefs/tags/13.3.0^{}`)
        }), names);

        expect(state.tagCommit).toBe(sha('c'));
    });

    test('a failed worktree read throws instead of reading as clean', () => {
        expect(() => readPrepareBlockers(runner({'git status --porcelain': err(128, 'fatal: not a git repository')}), fresh, {notePresent: true, packageVersion: '13.2.0', ...names})).toThrow(ObservationError);
    });

    test('a failed rules read throws instead of reading as "no rules"', () => {
        expect(() => readBranchRules(runner({'gh api repos/neomjs/neo/rules/branches/main': err(1, 'gh: Forbidden (HTTP 403)')}), 'neomjs/neo', 'main')).toThrow(ObservationError);
        expect(readBranchRules(runner({'gh api repos/neomjs/neo/rules/branches/main': ok('[]')}), 'neomjs/neo', 'main')).toEqual({types: [], bypass: []});
    });

    test('the preflight names a dirty tree, a version not newer than package.json\'s, an existing tag and a stopped local branch', () => {
        const
            clean = {'git status --porcelain': ok(''), 'git rev-parse HEAD': ok(sha('d')), 'git rev-parse origin/dev': ok(sha('d'))},
            // The release commit raises package.json from 13.2.0 to the released 13.3.0
            facts = {notePresent: true, packageVersion: '13.2.0', ...names};

        expect(readPrepareBlockers(runner(clean), fresh, facts)).toEqual([]);
        expect(readPrepareBlockers(runner({...clean, 'git status --porcelain': ok(' M package.json')}), fresh, facts)).toEqual(['the working tree is not clean']);
        expect(readPrepareBlockers(runner(clean), fresh, {...facts, packageVersion: '13.3.0'})).toEqual(['13.3.0 is not newer than package.json\'s 13.3.0']);
        expect(readPrepareBlockers(runner(clean), {...fresh, tagCommit: sha('t'), localBranchSha: sha('l')}, facts)).toHaveLength(2);
    });
});

test.describe('publish.mjs prepare: the next step', () => {
    test('a fresh release builds; a local-only commit is pushed, not rebuilt', () => {
        expect(getPrepareStep(fresh)).toBe('build');
        expect(getPrepareStep({...fresh, localBranchSha: sha('l'), localAhead: 1})).toBe('push');
    });

    test('a pushed branch without a PR gets its PR, including after a closed one', () => {
        expect(getPrepareStep({...fresh, remoteBranchSha: sha('l')})).toBe('open-pr');
        expect(getPrepareStep({...fresh, remoteBranchSha: sha('l'), pr: closed})).toBe('open-pr');
    });

    test('an open release PR waits; a merged one hands over to finish; a release ends the phase', () => {
        expect(getPrepareStep({...fresh, remoteBranchSha: sha('l'), pr: open})).toBe('waiting');
        expect(getPrepareStep({...fresh, pr: merged})).toBe('merged');
        expect(getPrepareStep({...fresh, pr: merged, release: '13.3.0'})).toBe('released');
    });
});

test.describe('publish.mjs finish: the next step', () => {
    test('nothing is released without a merged release PR', () => {
        expect(getFinishStep(fresh)).toBe('not-merged');
        expect(getFinishStep({...fresh, pr: open})).toBe('not-merged');
        expect(getFinishStep({...fresh, pr: {...merged, mergeCommit: null}})).toBe('not-merged');
    });

    test('a merged release is squashed; a squash already on main is not pushed again', () => {
        expect(getFinishStep({...fresh, pr: merged, mergeTree: sha('r')})).toBe('squash');
        expect(getFinishStep({...fresh, pr: merged, mergeTree: sha('m')})).toBe('release');
        expect(getFinishStep({...fresh, pr: merged, mergeTree: sha('m'), release: '13.3.0'})).toBe('released');
    });
});

test.describe('a resumed release reuses only its own refs', () => {
    test('prepare opens a PR only from the branch the local candidate pushed', () => {
        expect(getBindingProblems('prepare', {...fresh, remoteBranchSha: sha('l'), localBranchSha: sha('l'), localAhead: 1})).toEqual([]);
        expect(getBindingProblems('prepare', {...fresh, remoteBranchSha: sha('x'), localBranchSha: sha('l'), localAhead: 1})).toHaveLength(1);
        expect(getBindingProblems('prepare', {...fresh, remoteBranchSha: sha('x')})).toHaveLength(1);
    });

    test('an open release PR is reused only when its head is the local candidate', () => {
        expect(getBindingProblems('prepare', {...fresh, pr: open, localBranchSha: sha('l'), localAhead: 1})).toEqual([]);
        expect(getBindingProblems('prepare', {...fresh, pr: {...open, headSha: sha('x')}, localBranchSha: sha('l'), localAhead: 1})).toHaveLength(1);
        expect(getBindingProblems('prepare', {...fresh, pr: open})).toHaveLength(1);
    });

    test('finish accepts an existing tag only on the merge commit, which covers a tag-created, release-missing retry', () => {
        expect(getBindingProblems('finish', {...fresh, pr: merged, tagCommit: sha('a')})).toEqual([]);
        expect(getBindingProblems('finish', {...fresh, pr: merged, tagCommit: sha('x')})).toHaveLength(1);
        expect(getBindingProblems('finish', {...fresh, pr: merged, tagCommit: sha('x'), release: '13.3.0'})).toHaveLength(1);
    });

    test('a release counts as done only when its tag is the merged release PR\'s merge commit', () => {
        const done = {...fresh, pr: merged, tagCommit: sha('a'), release: '13.3.0', mergeTree: sha('m')};

        for (const phase of ['prepare', 'finish']) {
            expect(getBindingProblems(phase, done), phase).toEqual([]);
            expect(getBindingProblems(phase, {...done, tagCommit: null}), phase).toHaveLength(1);
            expect(getBindingProblems(phase, {...done, pr: open}), phase).toHaveLength(1);
            expect(getBindingProblems(phase, {...done, pr: null}), phase).toEqual([expect.stringContaining('published outside this workflow')]);
        }
    });
});

test.describe('the release PR body agrees with the ticket it resolves', () => {
    const
        ticketBody = '## Context\n\nx\n\n## Acceptance Criteria\n\n- [ ] AC-1 a\n- [ ] AC-2 b\n- [ ] AC-3 c\n- [ ] AC-4 d\n\n## Out of Scope\n\n- [ ] not an AC\n',
        body       = rows => `Resolves #19700\n\n## AC Evidence\n${rows}\n`;

    test('a ticket with four ACs needs four AC rows, not "No structured ACs"', () => {
        expect(getPrBodyProblems(body('No structured ACs on #19700'), 19700, ticketBody)).toHaveLength(1);
        expect(getPrBodyProblems(body('| AC-1 | x |\n| AC-2 | x |\n| AC-3 | x |\n| AC-4 | x |'), 19700, ticketBody)).toEqual([]);
    });

    test('the body resolves exactly the given ticket', () => {
        expect(getPrBodyProblems(body('| AC-1 | x |\n| AC-2 | x |\n| AC-3 | x |\n| AC-4 | x |').replace('#19700', '#19652'), 19700, ticketBody)).toHaveLength(1);
    });

    test('a ticket without ACs needs the explicit no-AC line', () => {
        expect(getPrBodyProblems(body(''), 19700, '## Context\n\nx\n')).toHaveLength(1);
        expect(getPrBodyProblems(body('No structured ACs on #19700'), 19700, '## Context\n\nx\n')).toEqual([]);
    });
});
