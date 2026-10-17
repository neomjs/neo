import {test, expect} from '@playwright/test';
import {spawnSync}    from 'node:child_process';

import {
    BODY_FILE_GUARD_MESSAGE,
    decideBodyFileGuard,
    findUncheckedBodyPipe
} from '../../../../.claude/hooks/bodyFileGuardHook.mjs';
import {tokenizeShellCommand} from '../../../../.claude/hooks/rgReplaceGuardHook.mjs';

/** The two checked shapes, one per line ending, and with an environment prefix and `[[ ]]` */
const CHECKED = [
    `[ -n "$V" ] && printf '%s' "$V" | gh pr edit 1 --body-file -`,
    `[ \${#V} -gt 0 ] && printf '%s' "$V" | gh issue edit 2 --body-file=-`,
    `[ -n "$V" ] || exit 1\nprintf '%s' "$V" |\n  gh pr edit 1 --body-file -`,
    `set -o pipefail; [[ -n "$V" ]] || exit 1; printf '%s' "$V" | GH_REPO=neomjs/neo gh pr edit 1 -F -`
];

/** @summary Runs `command` in Bash with `gh` as a function reporting the body bytes it was handed; no GitHub call. */
function bytesHanded(command, value) {
    const run = spawnSync('bash', ['-c', `gh() { printf 'GH:%s\\n' "$(wc -c | tr -d ' ')"; }; V=${value}; ${command}`], {encoding: 'utf8'});
    return run.stdout.split('\n').filter(line => line.startsWith('GH:')).map(line => Number(line.slice(3)))
}

test.describe('bodyFileGuardHook — Claude PreToolUse Bash guard', () => {
    test('refuses every pipe into a stdin edit that its command does not check', () => {
        for (const command of [
            // A failing sed, a node transform at a path that does not exist, and other unchecked producers
            'gh issue view 24 --json body --jq .body | sed "s/a/b/" | gh issue edit 24 --body-file -',
            'gh pr view 170 --json body --jq .body | node "$S/body.mjs" | gh pr edit 170 --repo neomjs/neo-stage --body-file -',
            'jq -r .body x.json | gh pr edit 1 --body-file=-',
            'cat body.md | gh pr edit 1 -F -',
            'V=$(producer); printf "%s" "$V" | gh pr edit 1 --body-file -',
            // The check text present but not gating: not joined, after the write, before a reassignment, quoted
            `V=''; [ -n "$V" ]; printf '%s' "$V" | gh pr edit 1 --body-file -`,
            `V=''; printf '%s' "$V" | gh pr edit 1 --body-file -; [ -n "$V" ]`,
            `V=body; [ -n "$V" ] || exit 1; V=''; printf '%s' "$V" | gh pr edit 1 --body-file -`,
            `V=''; : '-n "$V"'; printf '%s' "$V" | gh pr edit 1 --body-file -`,
            // A check that holds whatever V is: a single-quoted literal, an unquoted operand that vanishes when empty
            `V=''; [ -n '$V' ] && printf '%s' "$V" | gh pr edit 1 --body-file -`,
            `V=''; [ -n $V ] && printf '%s' "$V" | gh pr edit 1 --body-file -`,
            // Producers that can print nothing for a nonempty value
            `V=body; [ -n "$V" ] && printf '' "$V" | gh pr edit 1 --body-file -`,
            `V=-n; [ -n "$V" ] && echo "$V" | gh pr edit 1 --body-file -`,
            `V=' '; [ -n "$V" ] && printf '%s' $V | gh pr edit 1 --body-file -`,
            // A quoted command word is still the consumer
            `printf '%s' "$V" | "gh" pr 'edit' 1 --body-file -`,
            // A check that only a branch or a subshell runs, or one sent to the background
            `if x; then [ -n "$V" ] || exit 1; fi; printf '%s' "$V" | gh pr edit 1 --body-file -`,
            `( [ -n "$V" ] || exit 1 ); printf '%s' "$V" | gh pr edit 1 --body-file -`,
            `[ -n "$V" ] || exit 1 & printf '%s' "$V" | gh pr edit 1 --body-file -`,
            // An environment prefix in front of the consumer
            'false | GH_REPO=neomjs/neo gh pr edit 1 --body-file -'
        ]) expect(findUncheckedBodyPipe(command), command).toMatchObject({subcommand: expect.stringMatching(/^(pr|issue) edit$/)})
    });

    test('allows the checked shapes, a file, a heredoc and creation, and no allowed shape hands gh an empty body', () => {
        for (const command of CHECKED) {
            expect(findUncheckedBodyPipe(command), command).toBeNull();
            // Run for real against a stand-in gh: an empty value never reaches it, a body arrives whole
            expect(bytesHanded(command, `''`), command).toEqual([]);
            expect(bytesHanded(command, 'body'), command).toEqual([4])
        }
        // The restore that blanked nothing: a producer whose pipe fails exits, and a length floor guards the write
        expect(findUncheckedBodyPipe(`set -o pipefail; NEW=$(gh pr view 1 --json body --jq .body | node t.mjs) || exit 1; ` +
            `[ \${#NEW} -gt 7000 ] || exit 1; printf '%s' "$NEW" | gh pr edit 1 --body-file -`)).toBeNull();
        expect(findUncheckedBodyPipe('gh pr edit 1 --body-file body.md')).toBeNull();
        expect(findUncheckedBodyPipe("gh pr edit 1 --body-file - <<'EOF'\nBody\nEOF")).toBeNull();
        expect(findUncheckedBodyPipe('node t.mjs | gh pr create --title T --body-file -'), 'an empty new body loses nothing').toBeNull();
        expect(findUncheckedBodyPipe('gh pr view 1 --json body | jq .'), 'no edit').toBeNull()
    });

    test('the shared tokenizer splits lines and keeps quotes only when asked, so the rg guard reads commands as before', () => {
        expect(tokenizeShellCommand('a |\n b\nc \\\nd')).toEqual(['a', '|', 'b', 'c', '\nd']);
        expect(tokenizeShellCommand('a |\n b\nc \\\nd', {newlines: true})).toEqual(['a', '|', 'b', '\n', 'c', 'd']);
        expect(tokenizeShellCommand(`a "$V" '$V' b\\ c ''`)).toEqual(['a', '$V', '$V', 'b c']);
        expect(tokenizeShellCommand(`a "$V" '$V' b\\ c ''`, {raw: true})).toEqual(['a', '"$V"', "'$V'", 'b\\ c', "''"])
    });

    test('PreToolUse decision blocks with the checked shapes and ignores other tools', () => {
        const command = 'gh pr view 1 --json body --jq .body | sed s/a/b/ | gh pr edit 1 --body-file -';
        expect(decideBodyFileGuard({hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {command}}))
            .toEqual({decision: 'block', reason: BODY_FILE_GUARD_MESSAGE});
        expect(BODY_FILE_GUARD_MESSAGE).toContain('|| exit 1');
        expect(decideBodyFileGuard({tool_name: 'Read', tool_input: {command}})).toBeNull();
        expect(decideBodyFileGuard({tool_name: 'Bash', tool_input: {}})).toBeNull();
        expect(decideBodyFileGuard(null)).toBeNull()
    });
});
