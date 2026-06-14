import {test, expect}      from '@playwright/test';
import path                from 'path';
import {inspectFleetRepos} from '../../../../ai/services/fleet/inspectFleetRepos.mjs';

// Pure aggregator — `registry` + `inspect` are injected stubs (no fs / git / Neo runtime);
// `deriveAgentRepoPath` runs real (pure path math). Mirrors deriveAgentRepoPath.spec. The inspect stub
// records the paths it was handed so the derive→inspect threading + the read-only contract are assertable.

const ROOT = '/srv/fleet';

function makeRegistry(agents) {
    return {listAgents: () => agents};
}

/** A recording inspectAgentRepo stub: returns the canonical shape (incl. the repoPath it was given). */
function makeInspect(verdict = {exists: true, isCheckout: true, state: 'checkout', provisioningAction: 'reuse'}) {
    const calls = [];
    const fn    = ({repoPath}) => { calls.push(repoPath); return {repoPath, ...verdict}; };
    fn.calls    = calls;
    return fn;
}

const repoAgent = (id, repoSlug = 'neomjs/neo') => ({
    id, githubUsername: id, harnessType: 'codex',
    metadata: {repo: {cloneUrl: `https://github.com/${repoSlug}.git`, repoSlug}}
});
const bareAgent = id => ({id, githubUsername: id, harnessType: 'codex', metadata: {launch: {command: 'h'}}});

test.describe('inspectFleetRepos (Fleet Manager fleet repo observability)', () => {
    test('returns one status entry per registered agent, in registry order', () => {
        const registry = makeRegistry([repoAgent('a'), bareAgent('b')]),
              result   = inspectFleetRepos({registry, managedRoot: ROOT, inspect: makeInspect()});

        expect(result).toHaveLength(2);
        expect(result.map(r => r.agentId)).toEqual(['a', 'b']);
    });

    test('a repo-configured agent carries the derived repoPath + the inspect classification', () => {
        const inspect  = makeInspect({exists: true, isCheckout: true, state: 'checkout', provisioningAction: 'reuse'}),
              registry = makeRegistry([repoAgent('a', 'neomjs/neo')]),
              [entry]  = inspectFleetRepos({registry, managedRoot: ROOT, inspect});

        expect(entry.configured).toBe(true);
        expect(entry.repoSlug).toBe('neomjs/neo');
        // path was derived under the managed root + handed to inspect
        expect(entry.repoPath.startsWith(ROOT + path.sep)).toBe(true);
        expect(inspect.calls).toEqual([entry.repoPath]);
        // the classification was threaded through
        expect(entry.state).toBe('checkout');
        expect(entry.isCheckout).toBe(true);
        expect(entry.provisioningAction).toBe('reuse');
    });

    test('an agent with no metadata.repo is reported unconfigured — surfaced, not inspected', () => {
        const inspect  = makeInspect(),
              registry = makeRegistry([bareAgent('b')]),
              [entry]  = inspectFleetRepos({registry, managedRoot: ROOT, inspect});

        expect(entry).toMatchObject({
            agentId: 'b', configured: false, repoSlug: null, repoPath: null,
            exists: false, isCheckout: false, state: 'unconfigured', provisioningAction: null
        });
        // unconfigured agents are never handed to the fs classifier
        expect(inspect.calls).toHaveLength(0);
    });

    test('configured + unconfigured entries share a uniform key shape', () => {
        const registry = makeRegistry([repoAgent('a'), bareAgent('b')]),
              [a, b]   = inspectFleetRepos({registry, managedRoot: ROOT, inspect: makeInspect()});

        expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    });

    test('distinct agents derive distinct repo paths', () => {
        const registry = makeRegistry([repoAgent('a'), repoAgent('b')]),
              result   = inspectFleetRepos({registry, managedRoot: ROOT, inspect: makeInspect()});

        expect(result[0].repoPath).not.toBe(result[1].repoPath);
    });

    test('an empty fleet returns an empty array', () => {
        expect(inspectFleetRepos({registry: makeRegistry([]), managedRoot: ROOT})).toEqual([]);
    });

    test('missing registry / managedRoot throw clear errors', () => {
        expect(() => inspectFleetRepos({managedRoot: ROOT})).toThrow(/registry/);
        expect(() => inspectFleetRepos({registry: makeRegistry([])})).toThrow(/managedRoot/);
    });
});
