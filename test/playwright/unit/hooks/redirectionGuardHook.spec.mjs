import {test, expect}  from '@playwright/test';
import {spawnSync}     from 'node:child_process';
import {readFileSync}  from 'node:fs';
import {fileURLToPath} from 'node:url';

import {
    decideRedirectionGuard,
    findFileWrite,
    REDIRECTION_GUARD_MESSAGE
} from '../../../../.claude/hooks/redirectionGuardHook.mjs';

const hookPath     = fileURLToPath(new URL('../../../../.claude/hooks/redirectionGuardHook.mjs', import.meta.url)),
      templatePath = fileURLToPath(new URL('../../../../.claude/settings.template.json', import.meta.url));

test.describe('redirectionGuardHook — Claude PreToolUse Bash guard', () => {
    test('a redirection into a file is a write, whatever its operator', () => {
        expect(findFileWrite('node lint.mjs > lint.out')).toEqual({operator: '>', target: 'lint.out'});
        expect(findFileWrite('echo line >> notes.md')).toEqual({operator: '>>', target: 'notes.md'});
        expect(findFileWrite('npm test > "$S/unit.log" 2>&1')).toEqual({operator: '>', target: '$S/unit.log'});
        expect(findFileWrite('cmd &>run.log')).toEqual({operator: '>', target: 'run.log'});
        expect(findFileWrite('cmd >|forced.txt')).toEqual({operator: '>|', target: 'forced.txt'});
        expect(findFileWrite('cmd >&both.log')).toEqual({operator: '>&', target: 'both.log'});
        expect(findFileWrite('V=$(cmd > inner.txt)')).toEqual({operator: '>', target: 'inner.txt'})
    });

    test('a heredoc authored into a file is a write; its body is never scanned', () => {
        expect(findFileWrite("cat > probe.mjs <<'EOF'\nconst a = b > c;\nEOF")).toEqual({operator: '>', target: 'probe.mjs'});
        expect(findFileWrite("python3 - <<'EOF'\nprint(1 > 0)\nEOF\necho done")).toBeNull();
        expect(findFileWrite("cat <<-EOF\n\tx > y\n\tEOF")).toBeNull();
        expect(findFileWrite("python3 - <<'EOF' > out.txt\nprint(1)\nEOF")).toEqual({operator: '>', target: 'out.txt'})
    });

    test('an in-place stream edit is a write', () => {
        expect(findFileWrite("sed -i '' 's/a/b/' file.md")).toEqual({command: 'sed', argument: '-i'});
        expect(findFileWrite("sed -Ei 's/a/b/' file.md")).toEqual({command: 'sed', argument: '-Ei'});
        expect(findFileWrite("sed --in-place=.bak 's/a/b/' f")).toEqual({command: 'sed', argument: '--in-place=.bak'});
        expect(findFileWrite("git ls-files | xargs -0 sed -i 's/a/b/'")).toEqual({command: 'sed', argument: '-i'});
        expect(findFileWrite("perl -pi -e 's/a/b/' f")).toEqual({command: 'perl', argument: '-pi'});
        expect(findFileWrite("V=$(sed -i 's/x/y/' f)")).toEqual({command: 'sed', argument: '-i'})
    });

    test('descriptor duplication, device targets and input redirection are not writes', () => {
        expect(findFileWrite('npm test 2>&1 | tail -40')).toBeNull();
        expect(findFileWrite('gh issue edit 1 --milestone v1 >/dev/null 2>&1')).toBeNull();
        expect(findFileWrite('cmd &>/dev/null; echo x >&2; exec 3>&-')).toBeNull();
        expect(findFileWrite('grep x <<< "$V" && wc -l < list.txt')).toBeNull();
        expect(findFileWrite('diff <(git show HEAD:a) <(cat b) | tee >(wc -l) >/dev/null')).toBeNull()
    });

    test('an operator in quoted program text, a comparison or a comment is not a redirection', () => {
        expect(findFileWrite("awk '$2>5' data.tsv")).toBeNull();
        expect(findFileWrite("gh pr view 1 --jq '.files[] | select(.additions > 10)'")).toBeNull();
        expect(findFileWrite("python3 -I -c 'print(2 > 1)'")).toBeNull();
        expect(findFileWrite('node -e "const f = x => x > 1"')).toBeNull();
        expect(findFileWrite('[[ "$a" > "$b" ]] && (( n > 0 )) && echo $(( 3 > 2 ))')).toBeNull();
        expect(findFileWrite('echo a \\> b')).toBeNull();
        expect(findFileWrite('# a > b is only a note\necho ok')).toBeNull()
    });

    test('sed and perl without in-place flags, or named as arguments, are not edits', () => {
        expect(findFileWrite("sed -n 's/a/b/p' file | head")).toBeNull();
        expect(findFileWrite("perl -Mstrict -ne 'print if /i/' f")).toBeNull();
        expect(findFileWrite('grep -i sed notes.md && echo perl -i')).toBeNull();
        expect(findFileWrite('npm test 2>&1 | tee "$dir/run.log"')).toBeNull()
    });

    test('PreToolUse decision blocks a writing Bash command and allows everything else', () => {
        expect(decideRedirectionGuard({tool_name: 'Bash', tool_input: {command: 'node x.mjs > out.json'}}))
            .toEqual({decision: 'block', reason: REDIRECTION_GUARD_MESSAGE});
        expect(decideRedirectionGuard({tool_name: 'Bash', tool_input: {command: 'node x.mjs 2>&1 | tail'}})).toBeNull();
        expect(decideRedirectionGuard({tool_name: 'Write', tool_input: {content: 'a > b'}})).toBeNull();
        expect(decideRedirectionGuard({tool_name: 'Bash', tool_input: {}})).toBeNull();
        expect(decideRedirectionGuard(null)).toBeNull()
    });

    test('the script entry prints the block directive, and fails open on a malformed payload', () => {
        const run = input => spawnSync(process.execPath, [hookPath], {encoding: 'utf8', input});

        const blocked = run(JSON.stringify({tool_name: 'Bash', tool_input: {command: 'echo x > y.txt'}}));

        expect(blocked.status).toBe(0);
        expect(JSON.parse(blocked.stdout)).toEqual({decision: 'block', reason: REDIRECTION_GUARD_MESSAGE});

        const malformed = run('{not json');

        expect(malformed.status).toBe(0);
        expect(malformed.stdout).toBe('')
    });

    // The template is the tracked registration: each seat's `.claude/settings.json` is hydrated from it
    test('the settings template registers the hook on Bash PreToolUse', () => {
        const settings = JSON.parse(readFileSync(templatePath, 'utf8')),
              bash     = settings.hooks.PreToolUse.find(entry => entry.matcher === 'Bash');

        expect(bash.hooks.some(hook => hook.command.includes('.claude/hooks/redirectionGuardHook.mjs'))).toBe(true)
    })
});
