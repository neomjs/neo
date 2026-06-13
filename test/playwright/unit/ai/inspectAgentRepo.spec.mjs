import {test, expect}     from '@playwright/test';
import fs                 from 'fs';
import os                 from 'os';
import path               from 'path';
import {inspectAgentRepo} from '../../../../ai/services/fleet/inspectAgentRepo.mjs';

// Read-only fs classifier — exercised against real temp-dir fixtures (no git binary), mirroring
// FleetRegistryService.spec's temp-dir pattern. All fixtures live under one suite root removed in
// afterAll; each case names its own subdirectory.

let suiteRoot;

test.beforeAll(() => {
    suiteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'inspect-agent-repo-'));
});

test.afterAll(() => {
    fs.rmSync(suiteRoot, {recursive: true, force: true});
});

// make a fresh directory under the suite root and return its absolute path
const freshDir = name => {
    const p = path.join(suiteRoot, name);
    fs.mkdirSync(p, {recursive: true});
    return p;
};

test.describe('inspectAgentRepo (Fleet Manager checkout-state classification)', () => {
    test('absent path → clone', () => {
        const r = inspectAgentRepo({repoPath: path.join(suiteRoot, 'does-not-exist')});
        expect(r.exists).toBe(false);
        expect(r.isCheckout).toBe(false);
        expect(r.state).toBe('absent');
        expect(r.provisioningAction).toBe('clone');
    });

    test('empty directory → clone', () => {
        const r = inspectAgentRepo({repoPath: freshDir('empty')});
        expect(r.state).toBe('empty');
        expect(r.isCheckout).toBe(false);
        expect(r.provisioningAction).toBe('clone');
    });

    test('directory containing a .git dir → reuse (never reclone an existing checkout)', () => {
        const dir = freshDir('checkout');
        fs.mkdirSync(path.join(dir, '.git'));
        const r = inspectAgentRepo({repoPath: dir});
        expect(r.state).toBe('checkout');
        expect(r.isCheckout).toBe(true);
        expect(r.provisioningAction).toBe('reuse');
    });

    test('a linked-worktree .git FILE also counts as a checkout', () => {
        const dir = freshDir('worktree');
        fs.writeFileSync(path.join(dir, '.git'), 'gitdir: /elsewhere/.git/worktrees/x\n');
        const r = inspectAgentRepo({repoPath: dir});
        expect(r.isCheckout).toBe(true);
        expect(r.provisioningAction).toBe('reuse');
    });

    test('non-empty directory without .git → conflict (never clobber foreign content)', () => {
        const dir = freshDir('occupied');
        fs.writeFileSync(path.join(dir, 'README.md'), '# not ours\n');
        const r = inspectAgentRepo({repoPath: dir});
        expect(r.state).toBe('occupied-non-checkout');
        expect(r.isCheckout).toBe(false);
        expect(r.provisioningAction).toBe('conflict');
    });

    test('a non-directory file at the path → conflict', () => {
        const file = path.join(suiteRoot, 'a-file');
        fs.writeFileSync(file, 'x');
        const r = inspectAgentRepo({repoPath: file});
        expect(r.exists).toBe(true);
        expect(r.isCheckout).toBe(false);
        expect(r.state).toBe('occupied-non-checkout');
        expect(r.provisioningAction).toBe('conflict');
    });

    test('a symlink occupant fails closed even when it points to an outside checkout (no reuse escape)', () => {
        // the link target is itself a valid checkout (.git present) sitting OUTSIDE the managed path
        const outsideCheckout = freshDir('outside-checkout');
        fs.mkdirSync(path.join(outsideCheckout, '.git'));

        const link = path.join(suiteRoot, 'symlink-to-checkout');
        fs.symlinkSync(outsideCheckout, link);

        const r = inspectAgentRepo({repoPath: link});
        // must NOT follow the symlink into the target's .git and report a reusable checkout
        expect(r.isCheckout).toBe(false);
        expect(r.state).toBe('occupied-non-checkout');
        expect(r.provisioningAction).toBe('conflict')
    });

    test('a dangling symlink is a conflict, not absent (never clone into a redirected path)', () => {
        const link = path.join(suiteRoot, 'dangling-symlink');
        fs.symlinkSync(path.join(suiteRoot, 'no-such-target'), link);

        const r = inspectAgentRepo({repoPath: link});
        expect(r.exists).toBe(true);
        expect(r.state).toBe('occupied-non-checkout');
        expect(r.provisioningAction).toBe('conflict')
    });

    test('fails loud on contract violations (no silent default)', () => {
        expect(() => inspectAgentRepo({repoPath: ''})).toThrow(/repoPath/);
        expect(() => inspectAgentRepo({repoPath: 42})).toThrow(/repoPath/);
        expect(() => inspectAgentRepo({})).toThrow(/repoPath/);
        expect(() => inspectAgentRepo({repoPath: 'relative/dir'})).toThrow(/absolute/);
    });
});
