import {test, expect}            from '@playwright/test';
import path                      from 'path';
import {deriveAgentInstanceHome} from '../../../../../../ai/services/fleet/deriveAgentInstanceHome.mjs';

// Pure function — imported directly (no fs / git / Neo runtime), so the suite has no host-runtime
// side effects and each case is fully isolated. Mirrors deriveAgentRepoPath.spec.

const ROOT = path.resolve('/srv/fleet-instances');

// Convenience: the resolved instance root + the OS separator, for containment assertions.
const underRoot = p => p === ROOT || p.startsWith(ROOT + path.sep);

test.describe('deriveAgentInstanceHome (Fleet Manager harness instance-home derivation)', () => {
    test('derives an absolute <root>/<agent>/<harness> path contained under the instance root', () => {
        const result = deriveAgentInstanceHome({instanceRoot: '/srv/fleet-instances', agentId: 'neo-opus-ada', harnessType: 'codex'});

        expect(path.isAbsolute(result)).toBe(true);
        expect(underRoot(result)).toBe(true);
        // exactly two segments below the root: <agent>/<harness>
        expect(path.relative(ROOT, result).split(path.sep)).toHaveLength(2);
    });

    test('is stable — identical inputs always map to the identical home (harness auth/state is home-keyed)', () => {
        const args = {instanceRoot: '/srv/fleet-instances', agentId: 'neo-gpt', harnessType: 'codex'};
        expect(deriveAgentInstanceHome(args)).toBe(deriveAgentInstanceHome(args));
    });

    test('is collision-free across distinct agents and distinct harness families', () => {
        const
            a = deriveAgentInstanceHome({instanceRoot: '/srv/fleet-instances', agentId: 'alice', harnessType: 'codex'}),
            b = deriveAgentInstanceHome({instanceRoot: '/srv/fleet-instances', agentId: 'bob',   harnessType: 'codex'}),
            c = deriveAgentInstanceHome({instanceRoot: '/srv/fleet-instances', agentId: 'alice', harnessType: 'claude-code'});

        expect(a).not.toBe(b); // distinct agents
        expect(a).not.toBe(c); // distinct harness families
    });

    test('two DISTINCT fleet agent ids sharing one githubUsername get distinct, restart-stable homes (keyed by agent id, NEVER githubUsername)', () => {
        // The function takes the fleet agent id ONLY — githubUsername is not an input by design, so
        // two agents sharing one GitHub identity can never collapse onto one auth/session home.
        const
            first  = {instanceRoot: '/srv/fleet-instances', agentId: 'neo-fable',      harnessType: 'codex'},
            second = {instanceRoot: '/srv/fleet-instances', agentId: 'neo-fable-clio', harnessType: 'codex'};

        expect(deriveAgentInstanceHome(first)).not.toBe(deriveAgentInstanceHome(second)); // distinct homes
        expect(deriveAgentInstanceHome(first)).toBe(deriveAgentInstanceHome(first));      // restart-stable
        expect(deriveAgentInstanceHome(second)).toBe(deriveAgentInstanceHome(second));    // restart-stable
    });

    test('stays collision-free even when two ids sanitize to the same readable form (hash-disambiguated)', () => {
        // `a/b` and `a-b` both sanitize to the readable form `a-b`; the raw-value hash keeps them apart.
        const
            slash = deriveAgentInstanceHome({instanceRoot: '/srv/fleet-instances', agentId: 'a/b', harnessType: 'codex'}),
            dash  = deriveAgentInstanceHome({instanceRoot: '/srv/fleet-instances', agentId: 'a-b', harnessType: 'codex'});

        expect(slash).not.toBe(dash);
    });

    test('contains every traversal-bearing or unsafe id under the instance root (security invariant)', () => {
        for (const agentId of ['../../etc/passwd', '..', '/abs', 'a/b/../..', '__proto__', '.', '....//....']) {
            const result = deriveAgentInstanceHome({instanceRoot: '/srv/fleet-instances', agentId, harnessType: 'codex'});
            expect(underRoot(result)).toBe(true);                              // never escapes upward
            expect(path.relative(ROOT, result).startsWith('..')).toBe(false);  // not above the root
        }
        // a traversal-bearing harnessType is contained too
        const r = deriveAgentInstanceHome({instanceRoot: '/srv/fleet-instances', agentId: 'a', harnessType: '../../../root'});
        expect(underRoot(r)).toBe(true);
    });

    test('a traversal attempt as the trusted-root argument throws (only an absolute root is accepted)', () => {
        expect(() => deriveAgentInstanceHome({instanceRoot: '../../etc', agentId: 'a', harnessType: 'codex'})).toThrow(/absolute/);
    });

    test('keeps a human-readable prefix so the operator can navigate the instance tree', () => {
        const result   = deriveAgentInstanceHome({instanceRoot: '/srv/fleet-instances', agentId: 'neo-opus-ada', harnessType: 'codex'}),
              segments = path.relative(ROOT, result).split(path.sep);
        // readable prefixes preserved, hash suffixes appended
        expect(segments[0].startsWith('neo-opus-ada-')).toBe(true);
        expect(segments[1].startsWith('codex-')).toBe(true);

        // a fully-unsafe id still yields a non-empty, readable-ish segment (sanitized `etc-passwd`)
        const sneaky = deriveAgentInstanceHome({instanceRoot: '/srv/fleet-instances', agentId: '../../etc/passwd', harnessType: 'codex'});
        expect(path.relative(ROOT, sneaky).split(path.sep)[0]).toContain('etc-passwd');
    });

    test('the instance root is honored verbatim — same agent/harness under different roots diverges', () => {
        const
            a = deriveAgentInstanceHome({instanceRoot: '/srv/fleet-instances',  agentId: 'x', harnessType: 'codex'}),
            b = deriveAgentInstanceHome({instanceRoot: '/data/fleet-instances', agentId: 'x', harnessType: 'codex'});

        expect(a).not.toBe(b);
        expect(a.startsWith(path.resolve('/srv/fleet-instances')  + path.sep)).toBe(true);
        expect(b.startsWith(path.resolve('/data/fleet-instances') + path.sep)).toBe(true);
    });

    test('fails loud on contract violations (no silent default home)', () => {
        // missing / empty / non-string required args
        expect(() => deriveAgentInstanceHome({instanceRoot: '/srv/fleet-instances', agentId: '',  harnessType: 'codex'})).toThrow(/agentId/);
        expect(() => deriveAgentInstanceHome({instanceRoot: '/srv/fleet-instances', agentId: 'a', harnessType: ''     })).toThrow(/harnessType/);
        expect(() => deriveAgentInstanceHome({instanceRoot: '',                     agentId: 'a', harnessType: 'codex'})).toThrow(/instanceRoot/);
        expect(() => deriveAgentInstanceHome({instanceRoot: '/srv/fleet-instances', agentId: 42,  harnessType: 'codex'})).toThrow(/agentId/);
        expect(() => deriveAgentInstanceHome({})).toThrow(/instanceRoot/);
        // a non-absolute instance root is a caller contract violation
        expect(() => deriveAgentInstanceHome({instanceRoot: 'relative/dir', agentId: 'a', harnessType: 'codex'})).toThrow(/absolute/);
    });
});
