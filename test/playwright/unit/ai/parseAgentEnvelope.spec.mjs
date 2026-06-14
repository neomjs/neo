import {test, expect}       from '@playwright/test';
import {parseAgentEnvelope} from '../../../../src/ai/parseAgentEnvelope.mjs';

// Pure frame-parsing — imported directly (Neo.ai.Client is a connect-on-init singleton), so the suite
// has no socket / Client side effects. Mirrors deriveSubtreePath.spec / resolveCallTarget.spec.
const RPC = {jsonrpc: '2.0', id: 1, method: 'set_instance_properties', params: {id: 'c-1', properties: {}}};

test.describe('parseAgentEnvelope (Neural Link agent-context unwrap)', () => {
    test('agent_message → inner JSON-RPC + the Bridge-stamped agentId context', () => {
        const r = parseAgentEnvelope({type: 'agent_message', agentId: 'neo-opus-ada', message: RPC});
        expect(r.jsonrpc).toBe(RPC);
        expect(r.context).toEqual({agentId: 'neo-opus-ada'})
    });

    test('a bare JSON-RPC frame → the frame itself, no agent context (legacy / non-agent, unenforced)', () => {
        const r = parseAgentEnvelope(RPC);
        expect(r.jsonrpc).toBe(RPC);
        expect(r.context).toBe(null)
    });

    test('agent_message with a missing / empty / non-string agentId → fail-closed marker (context.agentId null)', () => {
        for (const bad of [undefined, '', null, 42, {}]) {
            const r = parseAgentEnvelope({type: 'agent_message', agentId: bad, message: RPC});
            expect(r.context).toEqual({agentId: null}); // the write service denies on this
            expect(r.jsonrpc).toBe(RPC)                  // still dispatched, so it is denied — not silently dropped
        }
    });

    test('agent_message with no / non-object message → nothing to dispatch, context preserved', () => {
        for (const bad of [undefined, null, 'x', 42]) {
            const r = parseAgentEnvelope({type: 'agent_message', agentId: 'a', message: bad});
            expect(r.jsonrpc).toBe(null);
            expect(r.context).toEqual({agentId: 'a'})
        }
    });

    test('a non-object frame → nothing to dispatch, no context', () => {
        for (const bad of [null, undefined, 'x', 42, true]) {
            expect(parseAgentEnvelope(bad)).toEqual({jsonrpc: null, context: null})
        }
    });

    test('the agent_message discriminator is exact — a frame with a foreign type is still bare', () => {
        // a JSON-RPC message never carries type:'agent_message'; any other shape is treated as bare
        const frame = {type: 'something_else', method: 'get_component', params: {}},
              r     = parseAgentEnvelope(frame);
        expect(r.context).toBe(null);
        expect(r.jsonrpc).toBe(frame)
    });
});
