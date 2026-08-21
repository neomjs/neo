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

    test('no interpolated string reaches execSync — including via an intermediate variable', () => {
        // The original defect was TWO-STEP:
        //
        //     const cloneCommand = `${gitCmd} clone … ${tempDir}`;
        //     execSync(cloneCommand, {stdio: 'inherit'});
        //
        // An earlier version of this arm only matched interpolation appearing DIRECTLY inside
        // `execSync(`, so restoring the real shape above left it green. The mutation that "validated"
        // it used the inline form — i.e. the shape the detector could already see. Binding the
        // identifier-mediated path is the whole point, because that is the path the defect took.
        //
        // `:58` and `:69` build commands with no interpolation and pass `cwd` as an option; they were
        // never the defect and this permits them.
        const
            source = readFileSync('buildScripts/build/highlightJs.mjs', 'utf8'),
            // Identifiers bound to a template literal that interpolates something.
            interpolatedBindings = new Set(
                [...source.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*`[^`]*\$\{/g)].map(m => m[1])
            ),
            offenders = [];

        for (const call of source.matchAll(/execSync\(\s*([^,)]+)/g)) {
            const argument = call[1].trim();

            // Step 1: interpolation inline in the call.
            if (argument.startsWith('`') && argument.includes('${')) {
                offenders.push(`inline: ${argument.slice(0, 40)}`)
            }

            // Step 2: the call takes an identifier that was bound to an interpolated template.
            if (interpolatedBindings.has(argument)) {
                offenders.push(`via binding: ${argument}`)
            }
        }

        expect(offenders,
            'an interpolated string reaching execSync is the defect this file exists to prevent'
        ).toEqual([])
    });
});
