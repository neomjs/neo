import {test, expect}                 from '@playwright/test';
import {spawnSync}                    from 'node:child_process';
import {readFileSync}                 from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {
    decideHelperCallGuard,
    HELPER_CALL_GUARD_MESSAGE
} from '../../../../.claude/hooks/helperCallGuardHook.mjs';

const hookPath     = fileURLToPath(new URL('../../../../.claude/hooks/helperCallGuardHook.mjs', import.meta.url)),
      templatePath = fileURLToPath(new URL('../../../../.claude/settings.template.json', import.meta.url)),
      ask          = {
          hookSpecificOutput: {
              hookEventName           : 'PreToolUse',
              permissionDecision      : 'ask',
              permissionDecisionReason: HELPER_CALL_GUARD_MESSAGE
          }
      };

/**
 * @summary Runs the hook's literal CLI and captures its decision and diagnostic.
 * @param {String} input Serialized hook payload.
 * @returns {Object} The synchronous child-process result.
 */
function runHook(input) {
    return spawnSync(process.execPath, [hookPath], {encoding: 'utf8', input, timeout: 5000})
}

test.describe('helperCallGuardHook — Claude PreToolUse helper eligibility', () => {
    test('gives no decision for either helper tool with exactly Explore and an eligible named model', () => {
        for (const tool_name of ['Agent', 'Task']) {
            for (const model of ['haiku', 'sonnet']) {
                expect(decideHelperCallGuard({tool_name, tool_input: {subagent_type: 'Explore', model}}))
                    .toBeNull()
            }
        }
    });

    test('asks for omitted, foreign and nonstring agent types or models without granting an allow decision', () => {
        const inputs = [
            undefined,
            null,
            [],
            0,
            'Explore',
            {},
            {subagent_type: 'Explore'},
            {model: 'haiku'},
            {subagent_type: 'general-purpose', model: 'haiku'},
            {subagent_type: 'Plan', model: 'sonnet'},
            {subagent_type: 'explore', model: 'haiku'},
            {subagent_type: 'Explore ', model: 'haiku'},
            {subagent_type: 'Explore', model: 'opus'},
            {subagent_type: 'Explore', model: 'Haiku'},
            {subagent_type: 'Explore', model: 'sonnet '}
        ];

        for (const value of [null, false, 0, [], {}, '']) {
            inputs.push({subagent_type: value, model: 'haiku'});
            inputs.push({subagent_type: 'Explore', model: value})
        }

        expect(HELPER_CALL_GUARD_MESSAGE).toContain('Explore');
        expect(HELPER_CALL_GUARD_MESSAGE).toContain('haiku');
        expect(HELPER_CALL_GUARD_MESSAGE).toContain('sonnet');

        for (const tool_name of ['Agent', 'Task']) {
            for (const tool_input of inputs) {
                expect(decideHelperCallGuard({tool_name, tool_input}), JSON.stringify({tool_name, tool_input}))
                    .toEqual(ask)
            }
        }
    });

    test('leaves unrelated tools alone even when their input resembles an eligible or ineligible helper', () => {
        for (const tool_name of ['Read', 'Bash', 'Write', 'Workflow', 'AgentOther', 'TaskOther']) {
            for (const tool_input of [undefined, {}, {subagent_type: 'Explore', model: 'haiku'}, {model: 'opus'}]) {
                expect(decideHelperCallGuard({tool_name, tool_input})).toBeNull()
            }
        }
    });

    test('throws for an invalid envelope or a missing or nonstring tool name', () => {
        for (const payload of [undefined, null, false, 0, 'Agent', [], {}, {tool_name: undefined}]) {
            expect(() => decideHelperCallGuard(payload)).toThrow()
        }

        for (const tool_name of [null, false, 0, [], {}]) {
            expect(() => decideHelperCallGuard({tool_name, tool_input: {subagent_type: 'Explore', model: 'haiku'}}))
                .toThrow()
        }
    });

    test('the CLI exits zero with no output for eligible helpers and unrelated tools', () => {
        for (const tool_name of ['Agent', 'Task']) {
            for (const model of ['haiku', 'sonnet']) {
                const result = runHook(JSON.stringify({tool_name, tool_input: {subagent_type: 'Explore', model}}));

                expect(result.status).toBe(0);
                expect(result.stdout).toBe('');
                expect(result.stderr).toBe('')
            }
        }

        const unrelated = runHook(JSON.stringify({tool_name: 'Read', tool_input: {}}));

        expect(unrelated.status).toBe(0);
        expect(unrelated.stdout).toBe('');
        expect(unrelated.stderr).toBe('')
    });

    test('the CLI emits the ask permission envelope for both helper tools outside the eligible pair', () => {
        for (const tool_name of ['Agent', 'Task']) {
            for (const tool_input of [{subagent_type: 'Explore'}, {subagent_type: 'general-purpose', model: 'sonnet'}]) {
                const result = runHook(JSON.stringify({tool_name, tool_input}));

                expect(result.status).toBe(0);
                expect(JSON.parse(result.stdout)).toEqual(ask);
                expect(result.stderr).toBe('')
            }
        }
    });

    test('the CLI exits two with one generic diagnostic and no decision when input cannot be validated', () => {
        const errors = [
            '',
            '{not json',
            '{"prompt":"SENSITIVE_FIXTURE_PROMPT", broken',
            'null',
            'false',
            '0',
            '"Agent"',
            '[]',
            '{}',
            '{"tool_name":null}'
        ].map(input => runHook(input));

        for (const result of errors) {
            expect(result.status).toBe(2);
            expect(result.stdout).toBe('');
            expect(result.stderr.trim()).not.toBe('');
            expect(result.stderr).not.toContain('SENSITIVE_FIXTURE_PROMPT')
        }

        expect(new Set(errors.map(result => result.stderr.trim())).size).toBe(1)
    });

    test('an unreadable stdin blocks the call instead of failing open', () => {
        const source = `import {closeSync} from 'node:fs';\n` +
            `closeSync(0);\n` +
            `process.argv[1] = ${JSON.stringify(hookPath)};\n` +
            `await import(${JSON.stringify(pathToFileURL(hookPath).href)});`,
              result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {encoding: 'utf8'});

        expect(result.status).toBe(2);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('tool call blocked');
    });

    test('the template registers the exact helper matcher and fail-closed command while retaining the Workflow denial', () => {
        const settings = JSON.parse(readFileSync(templatePath, 'utf8')),
              entries  = settings.hooks.PreToolUse.filter(entry => entry.matcher === '^(Agent|Task)$');

        expect(entries).toHaveLength(1);
        expect(entries[0].hooks).toContainEqual({
            type     : 'command',
            command  : '/usr/bin/env node "$(git rev-parse --show-toplevel)/.claude/hooks/helperCallGuardHook.mjs"',
            timeout  : 5,
            onFailure: 'block'
        });
        expect(settings.permissions.ask ?? []).not.toContain('Agent');
        expect(settings.permissions.ask ?? []).not.toContain('Task');
        expect(settings.permissions.deny).toContain('Workflow')
    });

    test('the Engine guard is not ignored while generated seat hooks stay excluded', () => {
        const included = spawnSync('git', ['check-ignore', '--no-index', '.claude/hooks/helperCallGuardHook.mjs'], {encoding: 'utf8'}),
              ignored  = spawnSync('git', ['check-ignore', '--no-index', '.claude/hooks/generated-fixture.mjs'], {encoding: 'utf8'});

        expect(included.status).toBe(1);
        expect(included.stdout).toBe('');
        expect(ignored.status).toBe(0);
        expect(ignored.stdout).toContain('.claude/hooks/generated-fixture.mjs');
    })
});
