import {test, expect}  from '@playwright/test';
import {spawnSync}     from 'node:child_process';
import {readFileSync}  from 'node:fs';
import {fileURLToPath} from 'node:url';

import {
    decideGitCommitPushGuard,
    gitInvocations,
    gitSubcommands,
    GIT_COMMIT_PUSH_GUARD_MESSAGE,
    GIT_PUSH_REFSPEC_GUARD_MESSAGE,
    pushRefspecs
} from '../../../../.claude/hooks/gitCommitPushGuardHook.mjs';

const hookPath     = fileURLToPath(new URL('../../../../.claude/hooks/gitCommitPushGuardHook.mjs', import.meta.url)),
      templatePath = fileURLToPath(new URL('../../../../.claude/settings.template.json', import.meta.url)),
      block        = {decision: 'block', reason: GIT_COMMIT_PUSH_GUARD_MESSAGE},
      refspecBlock = {decision: 'block', reason: GIT_PUSH_REFSPEC_GUARD_MESSAGE},
      decide       = command => decideGitCommitPushGuard({tool_name: 'Bash', tool_input: {command}});

test.describe('gitCommitPushGuardHook — Claude PreToolUse Bash guard', () => {
    test('a call that runs both git commit and git push is blocked, in every chaining form and either order', () => {
        [
            'git commit -m x && git push',
            'git push || git commit -m x',
            'git commit -m x; git push origin grace/1-x',
            'git commit -m x | git push',
            'git commit -m x\ngit push',
            'git add -A && git commit -m x && cd ../w && git push 2>&1 | tail -3',
            'git commit -m x && echo "$(git push 2>&1)"',
            'git commit -m x && echo `git push`'
        ].forEach(command => expect(decide(command), command).toEqual(block))
    });

    test('either one alone passes, and so do the cd, -C and tail shapes', () => {
        expect(gitSubcommands("git commit -F - <<'EOF'\nfix: x\nEOF")).toEqual(['commit']);
        expect(gitSubcommands('cd ../w && git push origin grace/1-x')).toEqual(['push']);
        expect(gitSubcommands('git -C ../w push -u origin grace/1-x')).toEqual(['push']);
        expect(gitSubcommands('git push 2>&1 | tail -3')).toEqual(['push']);
        expect(gitSubcommands('git fetch -q origin && git rebase origin/dev && git push --force-with-lease'))
            .toEqual(['fetch', 'rebase', 'push']);

        ['git add -A && git commit -m x', 'cd ../w && git push', 'git -C ../w push', 'git push | tail']
            .forEach(command => expect(decide(command), command).toBeNull())
    });

    test('global options lead to the subcommand; git as an argument or a later word is not one', () => {
        expect(gitSubcommands('git -c user.name=a commit -m x')).toEqual(['commit']);
        expect(gitSubcommands('git --no-pager -C ../w --git-dir=.git push')).toEqual(['push']);
        expect(gitSubcommands('GIT_EDITOR=true git commit --amend')).toEqual(['commit']);
        expect(gitSubcommands('(git commit -m x) && { git push; }')).toEqual(['commit', 'push']);
        expect(gitSubcommands('git stash push && git commit -m x')).toEqual(['stash', 'commit']);
        expect(gitSubcommands('echo git commit && which git && git --version')).toEqual([])
    });

    test('quoted text, heredoc bodies and comments never count', () => {
        expect(decide('git commit -m "then git push"')).toBeNull();
        expect(decide("git commit -F - <<'EOF'\nfix: x\n\ngit push follows\nEOF")).toBeNull();
        expect(decide("git commit -m \"$(cat <<'EOF'\nfix: x\n\ngit push follows\nEOF\n)\"")).toBeNull();
        expect(decide('git commit -m x # git push next')).toBeNull();
        expect(decide("git push && gh pr comment 1 --body 'ran git commit first'")).toBeNull()
    });

    test('a push that names a colon refspec is blocked in every shell form, the ones the settings glob misses included', () => {
        [
            'git -C ../w push -u origin ada/1-x:ada/1-x',
            'cd ../w && git push origin ada/1-x:ada/1-x',
            'git push origin HEAD:refs/heads/ada/1-x',
            'git push origin "${sha}:refs/heads/ada/1-x-evidence"',
            'git push origin :ada/1-x',
            'git push --repo=origin https://example.invalid/team/repo.git ada/1-x:dev',
            'git push origin -uo ci:skip ada/1-x:dev',
            'git push --force-with-lease origin ada/1-x:dev',
            'git push origin -- ada/1-x:dev',
            'git push origin ada/1-x:ada/1-x 2>&1 | tail -2'
        ].forEach(command => expect(decide(command), command).toEqual(refspecBlock))
    });

    test('a push by branch name passes, and a colon outside a refspec never counts', () => {
        [
            'git push -u origin ada/1-x',
            'git -C ../w push origin ada/1-x',
            'git push https://github.com/o/r.git ada/1-x',
            'git push git@github.com:o/r.git ada/1-x',
            'git push -o ci:skip origin ada/1-x',
            'git push --push-option=ci:skip origin ada/1-x',
            'git push --push-opt ci:skip origin ada/1-x',
            'git push origin -uo ci:skip ada/1-x',
            'git push --repo=origin https://example.invalid/team/repo.git ada/1-x',
            'git push --recurse-submodules check https://example.invalid/team/repo.git ada/1-x',
            'git push origin ada/1-x 2> push:log',
            'git log --format=%h:%s && git push origin ada/1-x',
            'git stash push -m a:b',
            'echo "git push origin a:b"'
        ].forEach(command => expect(decide(command), command).toBeNull())
    });

    test('an invocation keeps the words up to the end of its simple command, and a push lists its refspecs', () => {
        expect(gitInvocations('cd ../w && git -C x push -u origin a 2>&1 | tail -2'))
            .toEqual([{subcommand: 'push', args: ['-u', 'origin', 'a', '2>&1']}]);
        expect(gitInvocations('git fetch -q origin; git push origin a:b'))
            .toEqual([{subcommand: 'fetch', args: ['-q', 'origin']}, {subcommand: 'push', args: ['origin', 'a:b']}]);

        expect(pushRefspecs(['-u', 'origin', 'a:b', 'c'])).toEqual(['a:b', 'c']);
        expect(pushRefspecs(['origin'])).toEqual([]);
        expect(pushRefspecs(['-o', 'ci:skip', 'origin', 'a', '>', 'out:log'])).toEqual(['a'])
    });

    test('a push reads its words the way git does: option values are skipped and the first positional is the repository', () => {
        // the first positional is the repository even when --repo names one (git push -h: <repository> [<refspec>...])
        expect(pushRefspecs(['--repo', 'origin', 'a'])).toEqual([]);
        expect(pushRefspecs(['--repo=origin', 'url', 'a:b'])).toEqual(['a:b']);
        // a value option reads the next word: in a short group ending in o, and by its name or a unique abbreviation
        expect(pushRefspecs(['origin', '-uo', 'ci:skip', 'a'])).toEqual(['a']);
        expect(pushRefspecs(['origin', '-oci:skip', 'a'])).toEqual(['a']);
        expect(pushRefspecs(['--recurse-submodules', 'check', 'url', 'a'])).toEqual(['a']);
        expect(pushRefspecs(['--push-opt', 'ci:skip', 'origin', 'a'])).toEqual(['a']);
        // an optional value is read after = only, an ambiguous abbreviation reads nothing, and -- ends the options
        expect(pushRefspecs(['--force-with-lease', 'origin', 'a:b'])).toEqual(['a:b']);
        expect(pushRefspecs(['--re', 'origin', 'a'])).toEqual(['a']);
        expect(pushRefspecs(['origin', '--', '-u', 'a'])).toEqual(['-u', 'a'])
    });

    test('PreToolUse decision ignores other tools and payloads without a command', () => {
        expect(decideGitCommitPushGuard({tool_name: 'Write', tool_input: {content: 'git commit && git push'}})).toBeNull();
        expect(decideGitCommitPushGuard({tool_name: 'Bash', tool_input: {}})).toBeNull();
        expect(decideGitCommitPushGuard(null)).toBeNull()
    });

    test('the script entry prints the block directive, and fails open on a malformed payload', () => {
        const run = input => spawnSync(process.execPath, [hookPath], {encoding: 'utf8', input});

        const blocked = run(JSON.stringify({tool_name: 'Bash', tool_input: {command: 'git commit -m x && git push'}}));

        expect(blocked.status).toBe(0);
        expect(JSON.parse(blocked.stdout)).toEqual(block);

        const refspec = run(JSON.stringify({tool_name: 'Bash', tool_input: {command: 'git -C ../w push origin a:a'}}));

        expect(JSON.parse(refspec.stdout)).toEqual(refspecBlock);

        const malformed = run('{not json');

        expect(malformed.status).toBe(0);
        expect(malformed.stdout).toBe('')
    });

    // The template is the tracked registration: each seat's `.claude/settings.json` is hydrated from it
    test('the settings template registers the hook on Bash PreToolUse, and git tracks the hook', () => {
        const settings = JSON.parse(readFileSync(templatePath, 'utf8')),
              bash     = settings.hooks.PreToolUse.find(entry => entry.matcher === 'Bash'),
              ignored  = spawnSync('git', ['check-ignore', '--no-index', '.claude/hooks/gitCommitPushGuardHook.mjs'], {encoding: 'utf8'});

        expect(bash.hooks.some(hook => hook.command.includes('.claude/hooks/gitCommitPushGuardHook.mjs'))).toBe(true);
        // `.claude/hooks/*` is ignored for the generated seat hooks; an Engine guard is excepted by name
        expect(ignored.status).toBe(1)
    })
});
