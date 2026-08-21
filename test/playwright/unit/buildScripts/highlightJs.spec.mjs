import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

/**
 * The property under test is that the clone destination reaches git as ONE argument.
 *
 * Asserting a quoted command string instead would pass for any consistent-but-wrong quoting, so
 * every assertion here is on the argument vector. Argv, not escaping.
 *
 * @see https://github.com/neomjs/neo/issues/17492
 */
test.describe('highlightJs — the clone target is one argument, not a shell string', () => {
    let buildCloneArgs, HIGHLIGHT_JS_REPOSITORY;

    test.beforeAll(async () => {
        // Importing this module used to run a build. The direct-run guard is what makes the argv
        // builder reachable from a test at all, so a regression there fails these arms loudly
        // rather than by cloning a repository during the suite.
        ({buildCloneArgs, HIGHLIGHT_JS_REPOSITORY} =
            await import('../../../../buildScripts/build/highlightJs.mjs'));
    });

    test('a checkout path containing a SPACE stays a single argument', () => {
        // The measured defect: as a shell string this split into three arguments
        // (`…/my`, `repos/neo/tmp/highlightjs`), so an ordinary macOS directory name broke the build.
        const
            target = '/Users/Shared/my repos/neo/tmp/highlightjs',
            args   = buildCloneArgs(target);

        expect(args.filter(arg => arg === target),
            'the target appears exactly once, whole').toHaveLength(1);
        expect(args.at(-1), 'and it is the final argument, unsplit').toBe(target);
    });

    test('shell metacharacters are carried as data, not as syntax', () => {
        // An argv invocation has no parser to reach, so these are inert rather than escaped. The
        // assertion is that the value survives INTACT — an implementation that sanitised the path
        // would mangle it here and fail, which is the outcome this arm wants.
        const
            target = '/tmp/neo; touch pwned && echo $HOME/`id`',
            args   = buildCloneArgs(target);

        expect(args.at(-1), 'passed through verbatim, unescaped and unmangled').toBe(target);
        expect(args).toHaveLength(5)
    });

    test('the vector is well-formed: depth-1 clone of the upstream repository', () => {
        // Non-vacuity in the other direction. Without this, an implementation returning
        // `[targetDir]` would satisfy both arms above while cloning nothing.
        const args = buildCloneArgs('/tmp/x');

        expect(args[0]).toBe('clone');
        expect(args.slice(1, 3)).toEqual(['--depth', '1']);
        expect(args[3]).toBe(HIGHLIGHT_JS_REPOSITORY);
        expect(HIGHLIGHT_JS_REPOSITORY).toMatch(/^https:\/\/github\.com\/highlightjs\/highlight\.js\.git$/)
    });

    test('no path is interpolated into a shell string anywhere in the module', () => {
        // The arms above cover the clone site. This one covers the FILE, so a future path-bearing
        // command cannot reintroduce the defect at a new site while the builder stays correct —
        // `:58` and `:69` pass `cwd` as an option and were never the defect, which this permits.
        const
            source = readFileSync('buildScripts/build/highlightJs.mjs', 'utf8'),
            // execSync with a template literal that interpolates anything path-shaped.
            offenders = [...source.matchAll(/execSync\(\s*`[^`]*\$\{[^}]*(?:Dir|Path|path)[^}]*\}/g)];

        expect(offenders.map(match => match[0]),
            'a path reaching a shell string is the defect this file exists to prevent').toEqual([])
    });
});
