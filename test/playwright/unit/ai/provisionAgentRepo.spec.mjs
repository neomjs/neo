import {test, expect}        from '@playwright/test';
import {provisionAgentRepo}  from '../../../../ai/services/fleet/provisionAgentRepo.mjs';

// A recording clone stub — the injectable side-effect seam, mirroring FleetLifecycleService.spec's
// spawn stub. It records calls so the clone/reuse/conflict contract is asserted with no git binary or
// network. `impl` lets a case simulate a clone failure.
const makeCloneStub = impl => {
    const calls = [];
    const fn    = async (cloneUrl, repoPath) => {
        calls.push({cloneUrl, repoPath});
        if (impl) return impl(cloneUrl, repoPath);
    };
    fn.calls = calls;
    return fn
};

const REPO = '/srv/fleet/agent-a/neomjs-neo',
      URL  = 'https://example.test/neomjs/neo.git';

test.describe('provisionAgentRepo (Fleet Manager repo-provisioning executor)', () => {
    test("'clone' invokes the clone executor exactly once and reports cloned", async () => {
        const clone = makeCloneStub(),
              r     = await provisionAgentRepo({repoPath: REPO, cloneUrl: URL, provisioningAction: 'clone', cloneRepo: clone});

        expect(clone.calls).toHaveLength(1);
        expect(clone.calls[0]).toEqual({cloneUrl: URL, repoPath: REPO});
        expect(r).toEqual({repoPath: REPO, action: 'cloned', cloned: true})
    });

    test("'reuse' never invokes the clone executor (no reclone of an existing checkout)", async () => {
        const clone = makeCloneStub(),
              r     = await provisionAgentRepo({repoPath: REPO, provisioningAction: 'reuse', cloneRepo: clone});

        expect(clone.calls).toHaveLength(0);
        expect(r).toEqual({repoPath: REPO, action: 'reused', cloned: false})
    });

    test("'conflict' throws and never invokes the clone executor (never clobber)", async () => {
        const clone = makeCloneStub();
        await expect(provisionAgentRepo({repoPath: REPO, provisioningAction: 'conflict', cloneRepo: clone}))
            .rejects.toThrow(/conflict/i);
        expect(clone.calls).toHaveLength(0)
    });

    test("'clone' requires a cloneUrl — throws without one and never clones", async () => {
        const clone = makeCloneStub();
        await expect(provisionAgentRepo({repoPath: REPO, provisioningAction: 'clone', cloneRepo: clone}))
            .rejects.toThrow(/cloneUrl/);
        expect(clone.calls).toHaveLength(0)
    });

    test("'clone' rejects a whitespace-only cloneUrl (blank-check, never reaches the clone seam)", async () => {
        const clone = makeCloneStub();
        await expect(provisionAgentRepo({repoPath: REPO, cloneUrl: '   ', provisioningAction: 'clone', cloneRepo: clone}))
            .rejects.toThrow(/cloneUrl/);
        expect(clone.calls).toHaveLength(0)
    });

    test("'clone' trims surrounding whitespace from a valid cloneUrl before cloning", async () => {
        const clone = makeCloneStub(),
              r     = await provisionAgentRepo({repoPath: REPO, cloneUrl: `  ${URL}  `, provisioningAction: 'clone', cloneRepo: clone});

        expect(clone.calls[0]).toEqual({cloneUrl: URL, repoPath: REPO});  // trimmed before the seam
        expect(r).toEqual({repoPath: REPO, action: 'cloned', cloned: true})
    });

    test('an unknown action fails closed (throws, never clones)', async () => {
        const clone = makeCloneStub();
        await expect(provisionAgentRepo({repoPath: REPO, provisioningAction: 'frobnicate', cloneRepo: clone}))
            .rejects.toThrow(/unknown/i);
        expect(clone.calls).toHaveLength(0)
    });

    test('a clone-executor failure propagates (provisioning fails loud)', async () => {
        const clone = makeCloneStub(() => { throw new Error('git exited 128') });
        await expect(provisionAgentRepo({repoPath: REPO, cloneUrl: URL, provisioningAction: 'clone', cloneRepo: clone}))
            .rejects.toThrow(/git exited 128/)
    });

    test('fails loud on repoPath contract violations', async () => {
        await expect(provisionAgentRepo({repoPath: '',           provisioningAction: 'reuse'})).rejects.toThrow(/repoPath/);
        await expect(provisionAgentRepo({repoPath: 42,           provisioningAction: 'reuse'})).rejects.toThrow(/repoPath/);
        await expect(provisionAgentRepo({                        provisioningAction: 'reuse'})).rejects.toThrow(/repoPath/);
        await expect(provisionAgentRepo({repoPath: 'relative/x', provisioningAction: 'reuse'})).rejects.toThrow(/absolute/)
    });

    test('non-clone actions work without an injected cloneRepo (the default seam is harmless off the clone path)', async () => {
        const r = await provisionAgentRepo({repoPath: REPO, provisioningAction: 'reuse'});
        expect(r).toEqual({repoPath: REPO, action: 'reused', cloned: false})
    });
});
