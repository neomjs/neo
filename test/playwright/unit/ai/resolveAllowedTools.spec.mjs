import {test, expect}        from '@playwright/test';
import {resolveAllowedTools} from '../../../../ai/agent/resolveAllowedTools.mjs';

// Pure function — imported directly (no live MCP client), so each case is fully isolated. Tool fixtures
// mirror a real github-workflow surface where most tools are dangerous and only one is a safe trap endpoint.
const tools = [
    {name: 'signal_state_transition', inputSchema: {}},
    {name: 'create_issue',            inputSchema: {}},
    {name: 'manage_issue_labels',     inputSchema: {}},
    {name: 'sync_all',                inputSchema: {}}
];

test.describe('resolveAllowedTools (#9980 MCP tool-level capability gating)', () => {
    test('returns the full surface when allowedTools is absent (backward-compatible default)', () => {
        expect(resolveAllowedTools({tools, serverName: 'github-workflow'})).toEqual(tools);
        expect(resolveAllowedTools({tools, allowedTools: null,      serverName: 'github-workflow'})).toEqual(tools);
        expect(resolveAllowedTools({tools, allowedTools: undefined, serverName: 'github-workflow'})).toEqual(tools);
    });

    test('returns the full surface for a server absent from a non-null map (per-server opt-in)', () => {
        // only knowledge-base is constrained; github-workflow is unnamed, so it keeps its full surface
        const allowedTools = {'knowledge-base': ['ask_knowledge_base']};
        expect(resolveAllowedTools({tools, allowedTools, serverName: 'github-workflow'})).toEqual(tools);
    });

    test('restricts a named server to its allowlisted subset (the trap-endpoint case)', () => {
        const allowedTools = {'github-workflow': ['signal_state_transition']};
        const result       = resolveAllowedTools({tools, allowedTools, serverName: 'github-workflow'});
        expect(result.map(t => t.name)).toEqual(['signal_state_transition']);
    });

    test('preserves allowlist multiplicity and original order, not the allowlist order', () => {
        const allowedTools = {'github-workflow': ['sync_all', 'signal_state_transition']};
        const result       = resolveAllowedTools({tools, allowedTools, serverName: 'github-workflow'});
        // filtered from the source list, so source order wins
        expect(result.map(t => t.name)).toEqual(['signal_state_transition', 'sync_all']);
    });

    test('an explicit empty allowlist denies every tool from that server', () => {
        const allowedTools = {'github-workflow': []};
        expect(resolveAllowedTools({tools, allowedTools, serverName: 'github-workflow'})).toEqual([]);
    });

    test('an allowlisted name that the server does not expose is simply omitted (no throw)', () => {
        const allowedTools = {'github-workflow': ['signal_state_transition', 'nonexistent_tool']};
        const result       = resolveAllowedTools({tools, allowedTools, serverName: 'github-workflow'});
        expect(result.map(t => t.name)).toEqual(['signal_state_transition']);
    });

    test('never mutates the input tool list (returns a new array)', () => {
        const allowedTools = {'github-workflow': ['signal_state_transition']};
        const result       = resolveAllowedTools({tools, allowedTools, serverName: 'github-workflow'});
        expect(result).not.toBe(tools);
        expect(tools).toHaveLength(4); // source untouched
    });

    test('an empty source surface resolves to empty regardless of allowlist', () => {
        expect(resolveAllowedTools({tools: [], allowedTools: {'github-workflow': ['x']}, serverName: 'github-workflow'})).toEqual([]);
    });
});
