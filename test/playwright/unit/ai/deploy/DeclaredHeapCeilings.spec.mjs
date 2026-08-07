import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs';
import path               from 'node:path';
import process            from 'node:process';
import {load as yamlLoad} from 'js-yaml';

const
    repoRoot    = path.resolve(process.cwd()),
    composePath = path.join(repoRoot, 'ai/deploy/docker-compose.yml'),
    compose     = yamlLoad(fs.readFileSync(composePath, 'utf8')),

    /** Services that run a Node server and therefore have a V8 heap ceiling that can kill them. */
    NODE_SERVICES = ['kb-server', 'mc-server', 'orchestrator'],

    /** Flattens a compose `command` (string | string[] | folded scalar) to one searchable string. */
    commandText = service => {
        const command = compose.services?.[service]?.command;

        return Array.isArray(command) ? command.join(' ') : (typeof command === 'string' ? command : '');
    },

    /** Parses the declared megabyte value(s) from a service's command. */
    declaredMb = service => [...commandText(service).matchAll(/--max-old-space-size=\$\{[A-Z_]+:-(\d+)\}/g)]
        .map(match => Number(match[1])),

    /**
     * The container memory limit in MB, from `deploy.resources.limits.memory`.
     *
     * Handles BOTH the literal form (`1g`) and the interpolated knob form
     * (`"${NEO_CHROMA_MEMORY_LIMIT:-8g}"`), because the knob form is the one the deployment SHOULD be
     * moving toward — a hardcoded limit is unreachable by the recovery actuator, which is the whole
     * finding of the store-ceiling tickets. A parser that only read literals would silently stop
     * checking the below-the-limit invariant the moment a service was correctly converted to a knob.
     * Found by this file's own negative control, which failed on chroma.
     */
    containerLimitMb = service => {
        const raw = compose.services?.[service]?.deploy?.resources?.limits?.memory;

        if (typeof raw !== 'string') return null;

        // `${VAR:-8g}` → `8g`; a literal passes through untouched.
        const value = raw.match(/\$\{[A-Z_]+:-([^}]+)\}/)?.[1] ?? raw;

        if (value.endsWith('g')) return Number.parseFloat(value) * 1024;
        if (value.endsWith('m')) return Number.parseFloat(value);

        return Number.parseFloat(value) / (1024 * 1024);
    };

/**
 * Every Node service must declare its V8 heap ceiling, and the ceiling must sit BELOW the container
 * limit.
 *
 * **Why this is a spec and not a comment.** `mc-server` aborted at 2026-08-07T11:40:42Z with
 * `Ineffective mark-compacts near heap limit` while its container sat at 36% of a 1 GiB budget. It
 * declared no ceiling, so V8 chose a heuristic ~560 MiB and killed the process with ~460 MiB of its
 * own allowance unused — and because *Node* aborted rather than the container, `ExitCode` was 0,
 * `OOMKilled` false and health `healthy`. Nothing surfaced it. The orchestrator has declared its
 * ceiling ever since its own restart loop was diagnosed; that reasoning was applied once and never
 * carried to its two siblings, and because the file is canonical every derived deployment inherited
 * the gap.
 *
 * Three properties are asserted, and each closes a distinct way of getting this wrong:
 *
 * 1. **Declared at all** — an undeclared ceiling is not merely low, it is unmeasurable: the diagnosis
 *    service cannot compute `min(containerLimit, declaredCeiling)` when the second term does not exist.
 * 2. **Below the container limit** — a ceiling ABOVE it converts a clean, diagnosable V8 abort into a
 *    container OOM-kill, which is a harder failure rather than a fixed one.
 * 3. **On EVERY `node` invocation in the command** — `mc-server`'s command branches on whether a
 *    recovery-actuator overlay exists. A ceiling on one branch only would make the failure appear or
 *    vanish depending on whether the actuator had ever written an override, which is not a condition
 *    anyone debugging a heap abort would think to check.
 */
test.describe('declared V8 heap ceilings', () => {
    for (const service of NODE_SERVICES) {
        test(`${service} declares a heap ceiling`, () => {
            const declared = declaredMb(service);

            expect(declared.length, `${service} must declare --max-old-space-size from an env knob`).toBeGreaterThan(0);
        });

        test(`${service}'s ceiling is strictly BELOW its container limit`, () => {
            const declared = declaredMb(service),
                  limit    = containerLimitMb(service);

            expect(limit, `${service} must declare a container memory limit`).toBeGreaterThan(0);

            for (const mb of declared) {
                // Strictly below, not equal: the process needs room for non-heap allocation (buffers,
                // native, stack) on top of the V8 heap, so an equal ceiling still ends in a
                // container OOM-kill rather than the clean abort this is here to preserve.
                expect(mb, `${service} heap ${mb}MB must be under its ${limit}MB container limit`).toBeLessThan(limit);
            }
        });

        test(`every node invocation in ${service}'s command carries the ceiling`, () => {
            const text        = commandText(service),
                  nodeCalls   = (text.match(/\bnode /g) || []).length,
                  ceilingHits = (text.match(/--max-old-space-size=/g) || []).length;

            expect(nodeCalls, `${service} must invoke node in its command`).toBeGreaterThan(0);
            // The both-branches guard. mc-server has two `node` calls; a mismatch here is a ceiling
            // that applies on one code path and not the other.
            expect(ceilingHits, `${service}: ${nodeCalls} node call(s) but ${ceilingHits} ceiling(s)`).toBe(nodeCalls);
        });

        test(`${service}'s command still carries a script path`, () => {
            // The false-green this file exists to avoid duplicating. Compose renders a single-`$`
            // `$SERVER_ENTRYPOINT` against the HOST environment, finds nothing, and emits
            // `node --max-old-space-size=<n>` — an invocation with NO SCRIPT. `docker compose config`
            // reports that as a warning and still exits 0, so asserting the config validates would
            // pass on a container that cannot boot. Assert the script reference survives instead.
            expect(commandText(service), `${service}'s command must still name an entrypoint`).toContain('SERVER_ENTRYPOINT');
        });
    }

    test('NODE_OPTIONS is never used to carry the ceiling', () => {
        // Rejected in this file's own comments: NODE_OPTIONS is inherited by every child process, so
        // a parent ceiling silently multiplies the container budget across supervised children. The
        // intuitive fix is the wrong one, which is exactly why it is asserted rather than trusted.
        const raw = fs.readFileSync(composePath, 'utf8'),
              // Only flag an ASSIGNMENT; the explanatory comments naming it must stay legal.
              assignments = raw.match(/^\s*-?\s*NODE_OPTIONS\s*[:=]/gm) || [];

        expect(assignments, 'the ceiling must be command-scoped, never an inherited env var').toEqual([]);
    });

    test('NEGATIVE CONTROL: a non-Node service is not required to declare a ceiling', () => {
        // Without this, the natural generalisation ("every service declares a heap ceiling") would
        // read as correct while being meaningless for chroma, which is not a Node process at all.
        expect(declaredMb('chroma'), 'chroma runs no Node process and must not be forced to declare one').toEqual([]);
        expect(containerLimitMb('chroma'), 'but it does carry a container limit, so the fixture is real').toBeGreaterThan(0);
    });
});
