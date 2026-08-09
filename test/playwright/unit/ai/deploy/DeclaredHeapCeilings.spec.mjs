import {test, expect}     from '@playwright/test';
import {execFileSync}     from 'node:child_process';
import fs                 from 'node:fs';
import os                 from 'node:os';
import path               from 'node:path';
import process            from 'node:process';
import {load as yamlLoad} from 'js-yaml';

/**
 * @summary Runs `docker compose … config`, letting a non-zero exit THROW.
 *
 * Deliberately separate from {@link composeCliAvailable}: conflating the two is what made the first
 * version of the render oracle fail open. This one only answers "what did Compose say"; whether
 * Compose can run at all is a different question with a different remedy.
 *
 * @param {String[]} args Arguments inserted between `compose` and `config`.
 * @param {String} cwd
 * @returns {String} The rendered Compose document.
 */
function runComposeConfig(args, cwd) {
    return execFileSync('docker', ['compose', ...args, 'config'],
        {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
}

/**
 * @summary Whether the `docker compose` CLI can run at all — availability, never validity.
 *
 * `version` touches no project file, so it cannot fail for a reason that belongs to the compose
 * document. That is the whole point: it is the one probe whose failure means "cannot run".
 *
 * @returns {Boolean}
 */
function composeCliAvailable() {
    try {
        execFileSync('docker', ['compose', 'version'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
        return true;
    } catch {
        return false;
    }
}

const
    repoRoot    = path.resolve(process.cwd()),
    composeDir  = path.join(repoRoot, 'ai/deploy'),
    composePath = path.join(composeDir, 'docker-compose.yml'),
    composeText = fs.readFileSync(composePath, 'utf8'),
    compose     = yamlLoad(composeText),

    /** Services that run a Node server and therefore have a V8 heap ceiling that can kill them. */
    NODE_SERVICES = ['kb-server', 'mc-server', 'fleet-server', 'orchestrator'],

    /** Flattens a compose `command` (string | string[] | folded scalar) to one searchable string. */
    commandText = service => {
        const command = compose.services?.[service]?.command;

        return Array.isArray(command) ? command.join(' ') : (typeof command === 'string' ? command : '');
    },

    /** Every declared megabyte value in a service's command, in textual order. */
    declaredMb = service => [...commandText(service).matchAll(/--max-old-space-size=\$\{[A-Z_]+:-(\d+)\}/g)]
        .map(match => Number(match[1])),

    /**
     * The container memory limit in MB, from `deploy.resources.limits.memory`.
     *
     * Handles BOTH the literal form (`1g`) and the interpolated knob form
     * (`"${NEO_CHROMA_MEMORY_LIMIT:-8g}"`), because a hardcoded limit is unreachable by the recovery
     * actuator and the store-ceiling tickets argue limits should move to knobs. A literal-only parser
     * would silently stop checking the below-the-limit invariant the moment a service was correctly
     * converted. Found by this file's own negative control, which failed on chroma.
     */
    containerLimitMb = service => {
        const raw = compose.services?.[service]?.deploy?.resources?.limits?.memory;

        if (typeof raw !== 'string') return null;

        const value = raw.match(/\$\{[A-Z_]+:-([^}]+)\}/)?.[1] ?? raw;

        if (value.endsWith('g')) return Number.parseFloat(value) * 1024;
        if (value.endsWith('m')) return Number.parseFloat(value);

        return Number.parseFloat(value) / (1024 * 1024);
    };

/**
 * Every Node service declares its V8 heap ceiling, below its container limit, on every branch, with
 * an escaping that survives Compose interpolation.
 *
 * **Why this is a spec and not a comment.** `mc-server` aborted at 2026-08-07T11:40:42Z with
 * `Ineffective mark-compacts near heap limit` while its container sat at 36% of a 1 GiB budget. It
 * declared no ceiling, so V8 chose a heuristic ~560 MiB and killed the process with ~460 MiB of its
 * own allowance unused — and because *Node* aborted rather than the container, `ExitCode` was 0,
 * `OOMKilled` false and health `healthy`. Nothing surfaced it.
 *
 * **This file is the second attempt, and the first one's failure is why every assertion below targets
 * a property rather than a proxy for one.** The original asserted
 * `command.includes('SERVER_ENTRYPOINT')` and its PR called that a rendered-command guard. A reviewer
 * falsified it: replacing all six `$$SERVER_ENTRYPOINT` with `$SERVER_ENTRYPOINT` left the spec
 * **14/14 green** while `docker compose config` exited **0** rendering
 * `node --max-old-space-size=<n> ""` — an empty script argument on every Node service. That substring
 * is true under either escaping, so the assertion could never have distinguished them. The same spec
 * asserted ceiling *count* and never ceiling *equality*, so `768` in one mc-server branch and `256` in
 * the other also passed while the reader was told the spec held them equal.
 *
 * Both holes are closed by asserting the properties directly rather than a proxy for them:
 *
 * 1. **The escaping itself** — `$$SERVER_ENTRYPOINT` present, no single-`$` form anywhere.
 * 2. **Equality across branches**, not merely presence on each.
 * 3. **Below the container limit**, strictly.
 * 4. **`NODE_OPTIONS` never used** to carry it.
 * 5. **The actually-rendered artifact**, when Docker is available — the belt to the escaping check's
 *    braces, and the only assertion that consumes Compose's own interpolation.
 */
test.describe('declared V8 heap ceilings', () => {
    for (const service of NODE_SERVICES) {
        test(`${service} declares a heap ceiling`, () => {
            expect(declaredMb(service), `${service} must declare --max-old-space-size from an env knob`)
                .not.toEqual([]);
        });

        test(`${service}'s ceiling is strictly BELOW its container limit`, () => {
            const declared = declaredMb(service),
                  limit    = containerLimitMb(service);

            expect(limit, `${service} must declare a container memory limit`).toBeGreaterThan(0);

            for (const mb of declared) {
                // Strictly below, not equal: the process needs room for non-heap allocation (buffers,
                // native, stack) on top of the V8 heap, so an equal ceiling still ends in a container
                // OOM-kill rather than the clean abort this is here to preserve.
                expect(mb, `${service} heap ${mb}MB must be under its ${limit}MB container limit`).toBeLessThan(limit);
            }
        });

        test(`every node invocation in ${service}'s command carries the ceiling`, () => {
            const text        = commandText(service),
                  nodeCalls   = (text.match(/\bnode /g) || []).length,
                  ceilingHits = (text.match(/--max-old-space-size=/g) || []).length;

            expect(nodeCalls, `${service} must invoke node in its command`).toBeGreaterThan(0);
            expect(ceilingHits, `${service}: ${nodeCalls} node call(s) but ${ceilingHits} ceiling(s)`).toBe(nodeCalls);
        });

        test(`${service}'s branches declare the SAME ceiling`, () => {
            // The hole in the first attempt. mc-server's command branches on whether a
            // recovery-actuator overlay exists; the branches are mutually exclusive and `Config.Cmd`
            // does not record which one is running. Divergent values therefore make the effective
            // ceiling unknowable from outside the container, and a count-only check accepts them:
            // `768` / `256` passed the previous spec while the parser reported the unexecuted branch.
            const declared = new Set(declaredMb(service));

            expect(declared.size, `${service} declares divergent ceilings ${[...declared].join(' vs ')} across branches`)
                .toBe(1);
        });

        test(`${service}'s entrypoint reference survives Compose interpolation`, () => {
            // THE falsified assertion, rewritten. The old form checked for the substring
            // `SERVER_ENTRYPOINT`, which is present under both the correct `$$` and the broken `$`.
            // Assert the escaping itself: `$$` is what makes Compose emit a literal `$SERVER_ENTRYPOINT`
            // for the CONTAINER shell to expand. A single `$` is interpolated at config time against
            // the HOST environment, finds nothing, and renders an empty script argument — at exit 0.
            const text = commandText(service);

            expect(text, `${service}'s command must reference $$SERVER_ENTRYPOINT`).toContain('$$SERVER_ENTRYPOINT');
            // Any `$SERVER_ENTRYPOINT` not preceded by another `$`. Negative lookbehind rather than a
            // count comparison, so a command mixing both forms cannot average out to passing.
            expect(text, `${service} has a single-$ SERVER_ENTRYPOINT that Compose will interpolate to empty`)
                .not.toMatch(/(?<!\$)\$SERVER_ENTRYPOINT/);
        });
    }

    test('NODE_OPTIONS is never used to carry the ceiling', () => {
        // NODE_OPTIONS is inherited by every child process, so a parent ceiling silently multiplies
        // the container budget across supervised children. The intuitive fix is the wrong one, which
        // is exactly why it is asserted rather than trusted.
        const NODE_OPTIONS_ASSIGNMENT = /^\s*-?\s*NODE_OPTIONS\s*[:=]/gm,
              assignments             = composeText.match(NODE_OPTIONS_ASSIGNMENT) || [];

        // POSITIVE CONTROL FIRST. This is an absence assertion, and an absence assertion whose matcher
        // cannot recognise a presence passes forever — the `[].every(...) === true` shape @neo-opus-grace
        // hit three times in one day and the same vacuity a reviewer found in this file's predecessor.
        // So prove the pattern fires on a known-bad sample before trusting it to report zero.
        expect('      - NODE_OPTIONS=--max-old-space-size=768\n'.match(NODE_OPTIONS_ASSIGNMENT),
            'the matcher must detect a real NODE_OPTIONS assignment, or the absence below means nothing')
            .not.toBeNull();
        expect('    NODE_OPTIONS: --max-old-space-size=768\n'.match(NODE_OPTIONS_ASSIGNMENT),
            'both the list form and the mapping form must be detected').not.toBeNull();
        // And it must NOT fire on the explanatory comments naming it, or the guard would forbid its own
        // rationale and the next reader would delete the reason instead of the violation.
        expect('    # NODE_OPTIONS is inherited by every child\n'.match(NODE_OPTIONS_ASSIGNMENT),
            'a comment mentioning NODE_OPTIONS must stay legal').toBeNull();

        expect(assignments, 'the ceiling must be command-scoped, never an inherited env var').toEqual([]);
    });

    test('NEGATIVE CONTROL: a non-Node service is not required to declare a ceiling', () => {
        // Without this, the natural generalisation ("every service declares a heap ceiling") would
        // read as correct while being meaningless for chroma, which is not a Node process at all.
        expect(declaredMb('chroma'), 'chroma runs no Node process and must not be forced to declare one').toEqual([]);
        expect(containerLimitMb('chroma'), 'but it does carry a container limit, so the fixture is real').toBeGreaterThan(0);
    });

    test('THE RENDERED ARTIFACT: every node invocation keeps a non-empty script argument', () => {
        // The only assertion in this file whose input is Compose's own output rather than the source
        // text. It exists because the previous attempt claimed to test the render and tested the
        // source; the escaping test above catches the same regression without Docker, so this is
        // corroboration rather than the sole guard — which is what makes skipping it acceptable.
        //
        // AVAILABILITY IS PROBED SEPARATELY FROM EXECUTION, and that separation is the point.
        // The first version wrapped `config` in a bare `catch` that labelled EVERY non-zero exit
        // "docker unavailable" — so a genuinely invalid Compose file skipped instead of failing, and
        // the oracle failed OPEN. @neo-gpt's falsifier: with Docker present and a Compose-invalid
        // service key, `compose` exits 1 while Playwright exits 0 with 17 passed / 1 skipped. A guard
        // that cannot distinguish "cannot run" from "ran and said no" is not a guard.
        if (!composeCliAvailable()) {
            // Loud, not silent: a skipped guard must not read as a passed one.
            test.skip(true, 'docker compose CLI unavailable — the escaping assertion above still covers this regression');
            return;
        }

        // NEGATIVE WITNESS, before trusting the positive one. Proves this oracle actually reports a
        // non-zero `config` exit rather than swallowing it, using a file Compose is guaranteed to
        // reject. Without this, the fail-open bug would be invisible again the moment someone
        // reintroduced a broad catch — the same reason the NODE_OPTIONS matcher above is controlled.
        const invalidPath = path.join(os.tmpdir(), `neo-compose-negative-witness-${process.pid}.yml`);

        fs.writeFileSync(invalidPath, 'services:\n  bad: "not-a-mapping"\n');

        let invalidRejected = false;

        try {
            runComposeConfig(['-f', invalidPath], os.tmpdir());
        } catch {
            invalidRejected = true;
        } finally {
            fs.rmSync(invalidPath, {force: true});
        }

        expect(invalidRejected, 'the oracle must REPORT a Compose-invalid file, not treat its non-zero exit as unavailability')
            .toBe(true);

        let rendered;

        try {
            rendered = runComposeConfig(['--profile', 'cloud'], composeDir);
        } catch (error) {
            // A non-zero exit here is a CONFIG DEFECT and must fail the suite. Availability was
            // already established above, so "cannot run" is no longer a candidate explanation.
            throw new Error(`docker compose config exited non-zero — a config defect, not unavailability:\n${
                error.stderr?.toString() || error.message}`);
        }

        // `docker compose config` EXITS 0 on a broken interpolation, reporting it only as a warning,
        // so the exit code above is not the evidence. The rendered text is.
        //
        // Note what the renderer actually does, because assuming otherwise cost this test one red run:
        // it does NOT print the post-interpolation command. It round-trips the compose-canonical form,
        // so a CORRECT file renders `"$$SERVER_ENTRYPOINT"` with the escape intact. The single-`$` form
        // is interpolated against the HOST environment during that pass, finds nothing, and collapses
        // to `""` — which is why the empty-script match below is the discriminator, and the
        // escape-present assertion is its positive control rather than the check itself.
        const emptyScript = rendered.match(/node(?:\s+--[\w-]+(?:=\S+)?)*\s+""/g) || [];

        expect(emptyScript, `rendered command(s) with an EMPTY script argument: ${emptyScript.join(' | ')}`)
            .toEqual([]);
        expect(rendered, 'POSITIVE CONTROL: the render must contain the escaped entrypoint at all, or the empty-script check above is asserting over nothing')
            .toContain('"$$SERVER_ENTRYPOINT"');
    });
});
