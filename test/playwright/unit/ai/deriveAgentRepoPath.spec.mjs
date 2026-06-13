import {test, expect}        from '@playwright/test';
import path                  from 'path';
import {deriveAgentRepoPath} from '../../../../ai/services/fleet/deriveAgentRepoPath.mjs';

// Pure function — imported directly (no fs / git / Neo runtime), so the suite has no host-runtime
// side effects and each case is fully isolated. Mirrors resolveCallTarget.spec / LockRegistry.spec.

const ROOT = path.resolve('/srv/fleet');

// Convenience: the resolved managed root + the OS separator, for containment assertions.
const underRoot = p => p === ROOT || p.startsWith(ROOT + path.sep);

test.describe('deriveAgentRepoPath (Fleet Manager repo-provisioning path derivation)', () => {
    test('derives an absolute <root>/<agent>/<repo> path contained under the managed root', () => {
        const result = deriveAgentRepoPath({managedRoot: '/srv/fleet', agentId: 'neo-opus-ada', repoSlug: 'neomjs/neo'});

        expect(path.isAbsolute(result)).toBe(true);
        expect(underRoot(result)).toBe(true);
        // exactly two segments below the root: <agent>/<repo>
        expect(path.relative(ROOT, result).split(path.sep)).toHaveLength(2);
    });

    test('is stable — identical inputs always map to the identical path (memory is path-keyed)', () => {
        const args = {managedRoot: '/srv/fleet', agentId: 'neo-gpt', repoSlug: 'neomjs/neo'};
        expect(deriveAgentRepoPath(args)).toBe(deriveAgentRepoPath(args));
    });

    test('is collision-free across distinct agents and distinct repos', () => {
        const
            a = deriveAgentRepoPath({managedRoot: '/srv/fleet', agentId: 'alice', repoSlug: 'neomjs/neo'}),
            b = deriveAgentRepoPath({managedRoot: '/srv/fleet', agentId: 'bob',   repoSlug: 'neomjs/neo'}),
            c = deriveAgentRepoPath({managedRoot: '/srv/fleet', agentId: 'alice', repoSlug: 'neomjs/other'});

        expect(a).not.toBe(b); // distinct agents
        expect(a).not.toBe(c); // distinct repos
    });

    test('stays collision-free even when two ids sanitize to the same readable form (hash-disambiguated)', () => {
        // `a/b` and `a-b` both sanitize to the readable form `a-b`; the raw-value hash keeps them apart.
        const
            slash = deriveAgentRepoPath({managedRoot: '/srv/fleet', agentId: 'a/b', repoSlug: 'r'}),
            dash  = deriveAgentRepoPath({managedRoot: '/srv/fleet', agentId: 'a-b', repoSlug: 'r'});

        expect(slash).not.toBe(dash);
    });

    test('contains every traversal-bearing or unsafe id under the managed root (security invariant)', () => {
        for (const agentId of ['../../etc/passwd', '..', '/abs', 'a/b/../..', '__proto__', '.', '....//....']) {
            const result = deriveAgentRepoPath({managedRoot: '/srv/fleet', agentId, repoSlug: 'r'});
            expect(underRoot(result)).toBe(true);                              // never escapes upward
            expect(path.relative(ROOT, result).startsWith('..')).toBe(false);  // not above the root
        }
        // a traversal-bearing repoSlug is contained too
        const r = deriveAgentRepoPath({managedRoot: '/srv/fleet', agentId: 'a', repoSlug: '../../../root'});
        expect(underRoot(r)).toBe(true);
    });

    test('keeps a human-readable prefix so the operator can navigate the managed tree', () => {
        const result  = deriveAgentRepoPath({managedRoot: '/srv/fleet', agentId: 'neo-opus-ada', repoSlug: 'neomjs/neo'}),
              agentSeg = path.relative(ROOT, result).split(path.sep)[0];
        // readable prefix preserved, hash suffix appended
        expect(agentSeg.startsWith('neo-opus-ada-')).toBe(true);

        // a fully-unsafe id still yields a non-empty, readable-ish segment (sanitized `etc-passwd`)
        const sneaky = deriveAgentRepoPath({managedRoot: '/srv/fleet', agentId: '../../etc/passwd', repoSlug: 'r'});
        expect(path.relative(ROOT, sneaky).split(path.sep)[0]).toContain('etc-passwd');
    });

    test('the managed root is honored verbatim — same agent/repo under different roots diverges', () => {
        const
            a = deriveAgentRepoPath({managedRoot: '/srv/fleet',  agentId: 'x', repoSlug: 'r'}),
            b = deriveAgentRepoPath({managedRoot: '/data/fleet', agentId: 'x', repoSlug: 'r'});

        expect(a).not.toBe(b);
        expect(a.startsWith(path.resolve('/srv/fleet')  + path.sep)).toBe(true);
        expect(b.startsWith(path.resolve('/data/fleet') + path.sep)).toBe(true);
    });

    test('fails loud on contract violations (no silent default path)', () => {
        // missing / empty / non-string required args
        expect(() => deriveAgentRepoPath({managedRoot: '/srv/fleet', agentId: '',   repoSlug: 'r'})).toThrow(/agentId/);
        expect(() => deriveAgentRepoPath({managedRoot: '/srv/fleet', agentId: 'a',  repoSlug: '' })).toThrow(/repoSlug/);
        expect(() => deriveAgentRepoPath({managedRoot: '',           agentId: 'a',  repoSlug: 'r'})).toThrow(/managedRoot/);
        expect(() => deriveAgentRepoPath({managedRoot: '/srv/fleet', agentId: 42,   repoSlug: 'r'})).toThrow(/agentId/);
        expect(() => deriveAgentRepoPath({})).toThrow(/managedRoot/);
        // a non-absolute managed root is a caller contract violation
        expect(() => deriveAgentRepoPath({managedRoot: 'relative/dir', agentId: 'a', repoSlug: 'r'})).toThrow(/absolute/);
    });
});
