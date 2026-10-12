import {test, expect}                  from '@playwright/test';
import {getFinishStep, getPrepareStep} from '../../../../../buildScripts/release/releaseState.mjs';

/**
 * Resume coverage for `buildScripts/release/releaseState.mjs`: each phase of `publish.mjs` reads how
 * far a release got and continues from there, so a run that stopped at any push resumes by running again.
 */

const
    open   = {state: 'OPEN',   url: 'https://github.com/neomjs/neo/pull/1', mergeCommit: null},
    merged = {state: 'MERGED', url: 'https://github.com/neomjs/neo/pull/1', mergeCommit: 'a'.repeat(40)},
    closed = {state: 'CLOSED', url: 'https://github.com/neomjs/neo/pull/1', mergeCommit: null},
    fresh  = {released: false, pr: null, branchPushed: false, branchCommitted: false, mainHasTree: false};

test.describe('publish.mjs prepare: the next step', () => {
    test('a fresh release builds', () => {
        expect(getPrepareStep(fresh)).toBe('build');
    });

    test('a release commit that never reached origin is pushed, not rebuilt', () => {
        expect(getPrepareStep({...fresh, branchCommitted: true})).toBe('push');
    });

    test('a pushed branch without a PR gets its PR, including after a closed one', () => {
        expect(getPrepareStep({...fresh, branchCommitted: true, branchPushed: true})).toBe('open-pr');
        expect(getPrepareStep({...fresh, branchPushed: true, pr: closed})).toBe('open-pr');
    });

    test('an open release PR waits for its checks and the operator\'s merge', () => {
        expect(getPrepareStep({...fresh, branchPushed: true, pr: open})).toBe('waiting');
    });

    test('a merged release PR hands over to finish, and a published release ends the phase', () => {
        expect(getPrepareStep({...fresh, branchPushed: true, pr: merged})).toBe('merged');
        expect(getPrepareStep({...fresh, pr: merged, released: true})).toBe('released');
    });
});

test.describe('publish.mjs finish: the next step', () => {
    test('nothing is released without a merged release PR', () => {
        expect(getFinishStep(fresh)).toBe('not-merged');
        expect(getFinishStep({...fresh, pr: open})).toBe('not-merged');
        expect(getFinishStep({...fresh, pr: {...merged, mergeCommit: null}})).toBe('not-merged');
    });

    test('a merged release is squashed onto main', () => {
        expect(getFinishStep({...fresh, pr: merged})).toBe('squash');
    });

    test('a squash already on main is not pushed again: the run continues with the release', () => {
        expect(getFinishStep({...fresh, pr: merged, mainHasTree: true})).toBe('release');
    });

    test('a published release ends the phase', () => {
        expect(getFinishStep({...fresh, pr: merged, mainHasTree: true, released: true})).toBe('released');
    });
});
