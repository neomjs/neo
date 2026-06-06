import {test, expect}                                  from '@playwright/test';
import {isRealUserPrompt, parseLastTurn, resolveHarnessIdentity, userPromptText} from '../../../../../.claude/hooks/persist-memory.mjs';

/**
 * Self-test for the Claude Code `Stop`-hook turn parser. The hook auto-persists each turn into
 * the Memory Core; correctness hinges entirely on `parseLastTurn` mapping the REAL (messy, 8-entry-type)
 * Claude Code transcript onto the `add_memory` {prompt, thought, response} triad — Option B mapping.
 *
 * These cases encode the empirical findings that a naive "tail entry === turn" parser gets wrong:
 * bookkeeping entries trail the final assistant text, tool outputs arrive as `user` entries, a turn
 * spans many assistant entries, and extended-thinking is the preferred `thought` source.
 */

// --- mock-transcript builders (shapes verified against a real session JSONL) ---
const think     = thinking            => ({type: 'thinking', thinking, signature: 'sig'});
const text      = t                   => ({type: 'text', text: t});
const toolUse   = (name, id = 'tu1')  => ({type: 'tool_use', id, name, input: {}});
const userMsg   = (content, extra={}) => ({type: 'user',      isSidechain: false, message: {role: 'user',      content}, ...extra});
const asstMsg   = (content, extra={}) => ({type: 'assistant', isSidechain: false, message: {role: 'assistant', model: 'claude-opus-4-8', content}, ...extra});
const toolResult= (id, txt)           => userMsg([{type: 'tool_result', tool_use_id: id, content: txt}]);
const jsonl     = (...entries)        => entries.map(e => JSON.stringify(e)).join('\n');

test.describe('persist-memory hook — helpers', () => {
    test('isRealUserPrompt: string content is a prompt; tool_result-only array is not', () => {
        expect(isRealUserPrompt(userMsg('Real prompt'))).toBe(true);
        expect(isRealUserPrompt(userMsg([{type: 'text', text: 'Hi'}]))).toBe(true);
        expect(isRealUserPrompt(toolResult('tu1', 'output'))).toBe(false);
        expect(isRealUserPrompt(userMsg(''))).toBe(false);             // empty string is not a prompt
        expect(isRealUserPrompt(userMsg([{type: 'text', text: '  '}]))).toBe(false)
    });

    test('userPromptText: joins text blocks, ignores non-text (attachments / tool_result)', () => {
        expect(userPromptText(userMsg('plain'))).toBe('plain');
        expect(userPromptText(userMsg([{type: 'text', text: 'a'}, {type: 'image'}, {type: 'text', text: 'b'}]))).toBe('a\nb')
    });

    test('resolveHarnessIdentity: reads NEO_AGENT_IDENTITY (trimmed) for provenance; undefined when unset/blank', () => {
        // Threaded into addMemory as `agent` → canonicalized to a trusted `agentIdentity`, not `unclassified`.
        expect(resolveHarnessIdentity({NEO_AGENT_IDENTITY: '@neo-opus-vega'})).toBe('@neo-opus-vega');
        expect(resolveHarnessIdentity({NEO_AGENT_IDENTITY: '  neo-opus-vega  '})).toBe('neo-opus-vega');
        expect(resolveHarnessIdentity({NEO_AGENT_IDENTITY: ''})).toBeUndefined();
        expect(resolveHarnessIdentity({NEO_AGENT_IDENTITY: '   '})).toBeUndefined();
        expect(resolveHarnessIdentity({})).toBeUndefined()
    });
});

test.describe('persist-memory hook — parseLastTurn (Option B)', () => {
    test('maps a normal turn: thinking → thought, final text → response, tools counted + deduped', () => {
        const turn = parseLastTurn(jsonl(
            userMsg('Add the feature'),
            asstMsg([think('I should read the file first.'), toolUse('Read')]),
            toolResult('tu1', 'file contents'),
            asstMsg([think('Now I edit it.'), toolUse('Edit'), toolUse('Edit')]),
            toolResult('tu1', 'edited'),
            asstMsg([text('Done — the feature is added.')])
        ));

        expect(turn.prompt).toBe('Add the feature');
        expect(turn.thought).toBe('I should read the file first.\n\nNow I edit it.');
        expect(turn.response).toBe('Done — the feature is added.');
        expect(turn.toolsUsed).toEqual(['Read', 'Edit']);   // deduped
        expect(turn.amountToolCalls).toBe(3);                // counted (Read + Edit + Edit)
        expect(turn.model).toBe('claude-opus-4-8')
    });

    test('ignores trailing bookkeeping entries (last-prompt / ai-title / pr-link) — tail is NOT the turn', () => {
        const turn = parseLastTurn(jsonl(
            userMsg('Question?'),
            asstMsg([think('reasoning'), text('Answer.')]),
            {type: 'last-prompt', lastPrompt: 'Question?', leafUuid: 'x'},
            {type: 'ai-title',    aiTitle: 'A title'},
            {type: 'pr-link',     url: 'https://...'}
        ));

        expect(turn.response).toBe('Answer.');
        expect(turn.thought).toBe('reasoning')
    });

    test('treats tool_result user-entries as continuations, not prompts (turn-start detection)', () => {
        // Two turns; only the LAST real prompt + its assistant work must be extracted.
        const turn = parseLastTurn(jsonl(
            userMsg('First turn prompt'),
            asstMsg([text('First answer.')]),
            userMsg('Second turn prompt'),
            asstMsg([toolUse('Bash')]),
            toolResult('tu1', 'bash output'),     // a user-role entry that is NOT a prompt
            asstMsg([text('Second answer.')])
        ));

        expect(turn.prompt).toBe('Second turn prompt');
        expect(turn.response).toBe('Second answer.');
        expect(turn.toolsUsed).toEqual(['Bash'])
    });

    test('Option B fallback: no thinking → thought = narration (text before the final response)', () => {
        const turn = parseLastTurn(jsonl(
            userMsg('Do it'),
            asstMsg([text('Let me check a few things.'), toolUse('Grep')]),
            toolResult('tu1', 'matches'),
            asstMsg([text('All set.')])
        ));

        expect(turn.thought).toBe('Let me check a few things.');  // pre-response narration
        expect(turn.response).toBe('All set.')
    });

    test('no-thinking single-text turn: thought = placeholder (never duplicates response)', () => {
        const turn = parseLastTurn(jsonl(
            userMsg('Hi'),
            asstMsg([text('Hello!')])
        ));

        expect(turn.response).toBe('Hello!');
        expect(turn.thought).toBe('(No discrete reasoning blocks were recorded for this turn.)');
        expect(turn.thought).not.toBe(turn.response);
        expect(turn.amountToolCalls).toBe(0);
        expect(turn.toolsUsed).toEqual([])
    });

    test('filters sidechain (sub-agent) entries from the main turn', () => {
        const turn = parseLastTurn(jsonl(
            userMsg('Run the agent'),
            asstMsg([think('main reasoning'), toolUse('Agent')]),
            asstMsg([text('subagent step')], {isSidechain: true}),   // must be excluded
            {type: 'user', isSidechain: true, message: {role: 'user', content: 'subagent prompt'}},
            asstMsg([text('Main thread done.')])
        ));

        expect(turn.prompt).toBe('Run the agent');
        expect(turn.response).toBe('Main thread done.');
        expect(turn.thought).toBe('main reasoning')
    });

    test('skips malformed JSONL lines without throwing', () => {
        const raw  = [
            JSON.stringify(userMsg('Solid prompt')),
            '{ this is not json',
            '',
            JSON.stringify(asstMsg([think('ok'), text('Reply.')]))
        ].join('\n');
        const turn = parseLastTurn(raw);

        expect(turn.prompt).toBe('Solid prompt');
        expect(turn.response).toBe('Reply.')
    });

    test('returns null when there is no real user prompt to persist', () => {
        expect(parseLastTurn(jsonl(
            asstMsg([text('orphan assistant text')]),
            toolResult('tu1', 'only tool output')
        ))).toBeNull();
        expect(parseLastTurn('')).toBeNull()
    });

    test('multi-block final response uses the last text block as the answer', () => {
        const turn = parseLastTurn(jsonl(
            userMsg('Explain'),
            asstMsg([think('t1')]),
            asstMsg([text('Intermediate note.'), toolUse('Read')]),
            toolResult('tu1', 'x'),
            asstMsg([text('Final explanation here.')])
        ));

        expect(turn.response).toBe('Final explanation here.');
        expect(turn.thought).toBe('t1')   // thinking wins over narration text
    });
});
