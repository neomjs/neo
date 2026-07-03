import {test, expect}        from '@playwright/test';
import fs                    from 'node:fs';
import os                    from 'node:os';
import path                  from 'node:path';
import {removeAgentRepo}     from '../../../../ai/services/fleet/removeAgentRepo.mjs';
import {deriveAgentRepoPath} from '../../../../ai/services/fleet/deriveAgentRepoPath.mjs';

// Real-fs contract for the safe-removal mechanism (mirrors inspectAgentRepo.spec's temp-dir idiom):
// remove ONLY a managed checkout / empty dir, REFUSE a foreign occupant or symlink, no-op on absent.
// Each case uses a fresh managed root under one suite root removed in afterAll.

let suiteRoot, caseRoot;

test.beforeAll(() => { suiteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-remove-')); });
test.afterAll(()  => { fs.rmSync(suiteRoot, {recursive: true, force: true}); });
test.beforeEach(() => { caseRoot = fs.mkdtempSync(path.join(suiteRoot, 'case-')); });

const ARGS = root => ({managedRoot: root, agentId: 'agent-a', repoSlug: 'neomjs/neo'});

/** Create the derived checkout path (+ leading dirs) under `root` and return it. */
function derivedPath(root) {
    const p = deriveAgentRepoPath(ARGS(root));
    fs.mkdirSync(p, {recursive: true});
    return p;
}

test.describe('removeAgentRepo (Fleet Manager safe repo removal)', () => {
    test('removes a managed checkout (.git present) → removed, path gone', () => {
        const repoPath = derivedPath(caseRoot);
        fs.mkdirSync(path.join(repoPath, '.git'));                 // inspectAgentRepo → 'checkout'
        fs.writeFileSync(path.join(repoPath, 'file.txt'), 'work');

        const result = removeAgentRepo(ARGS(caseRoot));

        expect(result.removed).toBe(true);
        expect(result.state).toBe('checkout');
        expect(fs.existsSync(repoPath)).toBe(false);              // actually gone
    });

    test('removes an empty managed dir → removed, path gone', () => {
        const repoPath = derivedPath(caseRoot);                  // empty

        const result = removeAgentRepo(ARGS(caseRoot));

        expect(result.removed).toBe(true);
        expect(result.state).toBe('empty');
        expect(fs.existsSync(repoPath)).toBe(false);
    });

    test('REFUSES a foreign occupant (non-checkout content) → throws, survives untouched', () => {
        const repoPath = derivedPath(caseRoot);
        fs.writeFileSync(path.join(repoPath, 'foreign.txt'), 'not ours');  // no .git → occupied-non-checkout

        expect(() => removeAgentRepo(ARGS(caseRoot))).toThrow(/non-managed occupant/);
        expect(fs.readFileSync(path.join(repoPath, 'foreign.txt'), 'utf8')).toBe('not ours');  // survived
    });

    test('REFUSES a symlink occupant → throws, survives (containment defense)', () => {
        const repoPath = deriveAgentRepoPath(ARGS(caseRoot));
        fs.mkdirSync(path.dirname(repoPath), {recursive: true});
        const target = fs.mkdtempSync(path.join(suiteRoot, 'symlink-target-'));
        fs.symlinkSync(target, repoPath);                        // symlink at the derived path

        expect(() => removeAgentRepo(ARGS(caseRoot))).toThrow(/non-managed occupant/);
        expect(fs.lstatSync(repoPath).isSymbolicLink()).toBe(true);  // symlink itself survived
    });

    test('an absent path is an idempotent no-op → {removed:false, reason:absent}', () => {
        const result = removeAgentRepo(ARGS(caseRoot));          // nothing created
        expect(result).toMatchObject({removed: false, reason: 'absent'});
    });

    test('removeDir seam is honored: called for a managed checkout, NOT for foreign / absent', () => {
        // managed → called with the derived path
        const repoPath = derivedPath(caseRoot);
        fs.mkdirSync(path.join(repoPath, '.git'));
        const calls = [];
        removeAgentRepo({...ARGS(caseRoot), removeDir: p => calls.push(p)});
        expect(calls).toEqual([repoPath]);

        // foreign → never called (refused first)
        const root2    = fs.mkdtempSync(path.join(suiteRoot, 'case2-'));
        const foreign  = derivedPath(root2);
        fs.writeFileSync(path.join(foreign, 'x.txt'), 'x');
        const calls2 = [];
        expect(() => removeAgentRepo({...ARGS(root2), removeDir: p => calls2.push(p)})).toThrow();
        expect(calls2).toHaveLength(0);

        // absent → never called
        const root3  = fs.mkdtempSync(path.join(suiteRoot, 'case3-'));
        const calls3 = [];
        removeAgentRepo({...ARGS(root3), removeDir: p => calls3.push(p)});
        expect(calls3).toHaveLength(0);
    });

    test('invalid inputs throw (inherited from deriveAgentRepoPath)', () => {
        expect(() => removeAgentRepo({agentId: 'a', repoSlug: 'x/y'})).toThrow();          // missing managedRoot
        expect(() => removeAgentRepo({managedRoot: caseRoot, repoSlug: 'x/y'})).toThrow(); // missing agentId
    });
});
