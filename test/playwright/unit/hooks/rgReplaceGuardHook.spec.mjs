import {test, expect} from '@playwright/test';

import {
    decideRgReplaceGuard,
    findRgReplaceFootgun,
    RG_REPLACE_GUARD_MESSAGE,
    tokenizeShellCommand
} from '../../../../.claude/hooks/rgReplaceGuardHook.mjs';

test.describe('rgReplaceGuardHook — Claude PreToolUse Bash guard', () => {
    test('tokenizer keeps quoted arguments intact', () => {
        expect(tokenizeShellCommand('rg --replace "new value" "old value" src | cat'))
            .toEqual(['rg', '--replace', 'new value', 'old value', 'src', '|', 'cat']);
    });

    test('flags clustered `rg -rn` as replace-not-recursion misuse', () => {
        expect(findRgReplaceFootgun('rg -rn "escalateDiagnosis" ai/')).toMatchObject({
            flag  : '-rn',
            reason: 'clustered-short-replace'
        });
    });

    test('flags bare replace flag without enough replacement + pattern arguments', () => {
        expect(findRgReplaceFootgun('rg -r "escalateDiagnosis" ai/')).toMatchObject({flag: '-r'});
        expect(findRgReplaceFootgun('rg --replace')).toMatchObject({flag: '--replace'});
        expect(findRgReplaceFootgun('rg --replace replacement')).toMatchObject({flag: '--replace'});
        expect(findRgReplaceFootgun('rg --replace "escalateDiagnosis" ai/')).toMatchObject({flag: '--replace'});
        expect(findRgReplaceFootgun('rg --replace=escalateDiagnosis ai/')).toMatchObject({flag: '--replace=escalateDiagnosis'});
    });

    test('allows explicit replacement invocations', () => {
        expect(findRgReplaceFootgun('rg --replace "replacement" "pattern"')).toBeNull();
        expect(findRgReplaceFootgun('rg --replace "replacement" "pattern" ai/')).toBeNull();
        expect(findRgReplaceFootgun('rg --replace=replacement "pattern" ai/')).toBeNull();
        expect(findRgReplaceFootgun('rg -r replacement pattern ai/')).toBeNull();
    });

    test('does not flag other tools recursive flags', () => {
        expect(findRgReplaceFootgun('cp -r src dest && rm -r tmp/foo')).toBeNull();
    });

    test('PreToolUse decision blocks suspicious Bash command with clear message', () => {
        expect(decideRgReplaceGuard({
            hook_event_name: 'PreToolUse',
            tool_name      : 'Bash',
            tool_input     : {command: 'rg -rn "foo"'}
        })).toEqual({decision: 'block', reason: RG_REPLACE_GUARD_MESSAGE});
    });

    test('PreToolUse decision allows non-Bash tools and genuine replacement', () => {
        expect(decideRgReplaceGuard({
            hook_event_name: 'PreToolUse',
            tool_name      : 'Read',
            tool_input     : {command: 'rg -rn "foo"'}
        })).toBeNull();

        expect(decideRgReplaceGuard({
            hook_event_name: 'PreToolUse',
            tool_name      : 'Bash',
            tool_input     : {command: 'rg --replace "bar" "foo" src/'}
        })).toBeNull();
    });
});
