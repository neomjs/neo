import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs';
import path               from 'node:path';
import process            from 'node:process';
import {load as yamlLoad} from 'js-yaml';

/**
 * Guards the parity profile's volume-scoping invariant.
 *
 * The parity stack isolates itself from the durable plane by running under its own Compose
 * project, and Compose namespaces MANAGED volumes by project — `<project>_<key>`. That
 * namespacing is the whole mechanism preventing two parity stacks from mutating one plane:
 * two projects get two volumes, mechanically, with nothing to remember.
 *
 * WHY this spec exists rather than a sentence in the compose file. Two entirely legal
 * one-line Compose edits silently un-scope a volume and restore that failure:
 *
 *   volumes:
 *     parity-chroma: {name: shared}      <- renders `shared` under EVERY project
 *     parity-chroma: {external: true}    <- resolves unscoped, outside Compose's management
 *
 * Neither reads as a plane decision at the call site — someone adding `external: true` to
 * reuse an existing volume is doing an ordinary thing. Verified against Compose v5.1.4: a
 * managed volume renders `neo-local-parity_parity-chroma` and `team-plane_parity-chroma`
 * under their respective projects, while an explicit `name:` renders the same string under
 * both. So the property the isolation rests on is invisible at the point someone would break
 * it, and nothing else in the tree checks it.
 *
 * That is the shape of guard this repository has already had to retire once: a decision whose
 * correctness depends on a property nothing asserts. A shared or externally-managed parity
 * volume is a RE-ELECTION of the placement decision, not an implementation detail.
 *
 * WHY the assertion is static rather than a `docker compose config` run: no agent sandbox has
 * a reachable Docker daemon, and the keys are what un-scope the volume — reading them from the
 * source is a complete test of the invariant, not a proxy for one.
 */

const
    repoRoot    = path.resolve(process.cwd()),
    composePath = path.join(repoRoot, 'ai/deploy/docker-compose.dev.yml'),
    compose     = yamlLoad(fs.readFileSync(composePath, 'utf8'));

test.describe('parity profile — volume scoping is the isolation mechanism', () => {
    test('every declared volume is Compose-MANAGED: no explicit name, no external', () => {
        const volumes = compose.volumes ?? {};

        // The profile must actually declare volumes — an empty map would make every assertion
        // below vacuously true, which is the failure mode a "no bad keys" test invites.
        expect(Object.keys(volumes).length).toBeGreaterThan(0);

        for (const [key, body] of Object.entries(volumes)) {
            const declared = body ?? {};

            expect(declared.name, `volume "${key}" declares an explicit name — that renders identically under every project, so two parity stacks would share one volume and mutate one plane`).toBeUndefined();

            expect(declared.external, `volume "${key}" is external — Compose does not namespace it, so project isolation does not apply`).toBeFalsy();
        }
    });

    test('the chroma service mounts the managed volume, not a host bind', () => {
        const mounts = compose.services?.chroma?.volumes ?? [];

        expect(mounts.length).toBeGreaterThan(0);

        // A host bind is path-addressed, so the project name does not scope it and two stacks
        // pointed at one path collide silently. The elected mount style is the named volume.
        for (const mount of mounts) {
            const source = typeof mount === 'string' ? mount.split(':')[0] : mount.source;

            expect(source, `chroma mount "${source}" is a host path — binds are not project-scoped`).not.toMatch(/^[.\/~]/);
            expect(Object.keys(compose.volumes ?? {}), `chroma mounts "${source}", which is not a declared volume`).toContain(source);
        }
    });

    test('project identity and plane identity are ONE yaml scalar, not two expressions', () => {
        // The anchor/alias pair cannot drift: `*plane-id` IS the node `&plane-id` defines, so
        // there is no second value to keep in step. Asserting on the parsed tree proves the
        // alias resolved — a broken anchor is a parse error, and a copied expression would
        // pass an equality check while remaining two values.
        const source = fs.readFileSync(composePath, 'utf8');

        expect(source).toMatch(/^name:\s*&plane-id\s/m);
        expect(source).toMatch(/NEO_PLANE_ID:\s*\*plane-id\s*$/m);

        // COMPOSE_PROJECT_NAME is Compose's OWN variable, so Compose validates it instead of
        // silently canonicalizing it. A custom variable takes the normalize path and would need
        // a grammar guard — a copy of Compose's rule, wrong the day Compose changes it.
        expect(source).toMatch(/&plane-id\s+"\$\{COMPOSE_PROJECT_NAME:-/);
    });
});
