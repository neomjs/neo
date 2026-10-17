import {test, expect} from '@playwright/test';

import {
    BODY_FILE_GUARD_MESSAGE,
    decideBodyFileGuard,
    findUncheckedBodyPipe
} from '../../../../.claude/hooks/bodyFileGuardHook.mjs';

test.describe('bodyFileGuardHook — Claude PreToolUse Bash guard', () => {
    test('blocks a transform piped into an edit that reads its body from stdin', () => {
        // A failing sed, and a node transform at a path that does not exist
        expect(findUncheckedBodyPipe('gh issue view 24 --json body --jq .body | sed "s/a/b/" | gh issue edit 24 --body-file -'))
            .toEqual({subcommand: 'issue edit'});
        expect(findUncheckedBodyPipe('gh pr view 170 --json body --jq .body | node "$S/body.mjs" | gh pr edit 170 --repo neomjs/neo-stage --body-file -'))
            .toEqual({subcommand: 'pr edit'});
        expect(findUncheckedBodyPipe('jq -r .body x.json | gh pr edit 1 --body-file=-')).toEqual({subcommand: 'pr edit'});
        expect(findUncheckedBodyPipe('cat body.md | gh pr edit 1 -F -')).toEqual({subcommand: 'pr edit'});
        expect(findUncheckedBodyPipe('V=$(producer); printf "%s" "$V" | gh pr edit 1 --body-file -'), 'a variable nobody checks')
            .toEqual({subcommand: 'pr edit'})
    });

    test('allows a checked variable, a file, a heredoc and creation', () => {
        expect(findUncheckedBodyPipe('set -o pipefail; NEW=$(gh pr view 1 --json body --jq .body | node t.mjs) || exit 1; ' +
            '[ ${#NEW} -gt 7000 ] || exit 1; printf \'%s\' "$NEW" | gh pr edit 1 --body-file -')).toBeNull();
        expect(findUncheckedBodyPipe('[ -n "$B" ] && echo "$B" | gh issue edit 2 --body-file -')).toBeNull();
        expect(findUncheckedBodyPipe('gh pr edit 1 --body-file body.md')).toBeNull();
        expect(findUncheckedBodyPipe("gh pr edit 1 --body-file - <<'EOF'\nBody\nEOF")).toBeNull();
        expect(findUncheckedBodyPipe('node t.mjs | gh pr create --title T --body-file -'), 'an empty new body loses nothing').toBeNull();
        expect(findUncheckedBodyPipe('gh pr view 1 --json body | jq .'), 'no edit').toBeNull()
    });

    test('PreToolUse decision blocks with the safe shape and ignores other tools', () => {
        const command = 'gh pr view 1 --json body --jq .body | sed s/a/b/ | gh pr edit 1 --body-file -';
        expect(decideBodyFileGuard({hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {command}}))
            .toEqual({decision: 'block', reason: BODY_FILE_GUARD_MESSAGE});
        expect(BODY_FILE_GUARD_MESSAGE).toContain('${#V}');
        expect(decideBodyFileGuard({tool_name: 'Read', tool_input: {command}})).toBeNull();
        expect(decideBodyFileGuard({tool_name: 'Bash', tool_input: {}})).toBeNull();
        expect(decideBodyFileGuard(null)).toBeNull()
    });
});
