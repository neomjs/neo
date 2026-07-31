import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs';
import path               from 'node:path';
import process            from 'node:process';
import {load as yamlLoad} from 'js-yaml';

/**
 * Guards the backup root's TWO-CONTRACT invariant on the canonical profile.
 *
 * The backup bundle root is addressed by two separate contracts that happen to describe the
 * same bytes, and the whole defect being guarded here came from collapsing them:
 *
 *   host source      `NEO_HOST_BACKUP_ROOT`  — where the bundles physically land on the host
 *   container target `NEO_BACKUP_PATH`       — where the process inside the container writes
 *
 * Before the relocation, neither was declared. The config default and the Compose bind source
 * agreed only because BOTH derived from the plane root, so the agreement was a coincidence
 * rather than a contract — and coincidences break silently when either side moves. The host
 * source was `./.neo-ai-data/backups`, resolved against the Compose project directory, which
 * put the bundles inside a git working tree where `git clean -x` reaches them: `.neo-ai-data`
 * is gitignored, correctly, and `clean -x` is DEFINED as removing ignored files.
 *
 * WHY this spec exists rather than a comment in the compose file. Both halves regress via
 * ordinary, locally-reasonable one-line edits that do not read as durability decisions:
 *
 *   - ./.neo-ai-data/backups:/app/.neo-ai-data/backups     <- "make the path simpler"
 *   - ${NEO_HOST_BACKUP_ROOT:-./backups}:/app/...          <- "give it a nearby default"
 *
 * Either restores a checkout-relative host source. Nobody making that edit is thinking about
 * `git clean`, and no runtime assertion can catch it: the container boots fine, the backup
 * succeeds, the receipt is truthful, and the bundles are simply deletable again. The failure
 * is invisible until the day someone runs a build-hygiene command.
 *
 * WHY static rather than a `docker compose config` render: no agent sandbox has a reachable
 * Docker daemon, and the source text is what encodes the contract. Reading the keys IS the
 * complete test of the invariant, not a proxy for one — the same reasoning the parity
 * volume-scoping guard records.
 *
 * WHAT IS NOT CLAIMED HERE: that bundles land on a different physical filesystem from the
 * graph. They may not. Separating those failure domains is a distinct, latent concern owned
 * by its own ticket, and this spec deliberately asserts only the checkout-independence
 * property the canonical profile actually enforces.
 */

const
    repoRoot         = path.resolve(process.cwd()),
    baseComposePath  = path.join(repoRoot, 'ai/deploy/docker-compose.yml'),
    devComposePath   = path.join(repoRoot, 'ai/deploy/docker-compose.dev.yml'),
    CONTAINER_TARGET = '/app/.neo-ai-data/backups',
    HOST_SOURCE_ENV  = 'NEO_HOST_BACKUP_ROOT',
    TARGET_ENV       = 'NEO_BACKUP_PATH',

    readCompose = filePath => yamlLoad(fs.readFileSync(filePath, 'utf8')),

    /**
     * Splits on the mount's TARGET suffix rather than on `:` — the source contains `${VAR:-default}`,
     * whose own colon would make a naive split silently take the wrong half.
     */
    hostSourceOf = mount => mount.slice(0, -(CONTAINER_TARGET.length + 1));

test.describe('canonical backup root — host source and container target are separate contracts', () => {
    test('the host bind source is env-controlled and its default is NOT checkout-relative', () => {
        const
            compose     = readCompose(baseComposePath),
            volumes     = compose.services.orchestrator.volumes,
            backupMount = volumes.find(entry => typeof entry === 'string' && entry.endsWith(`:${CONTAINER_TARGET}`));

        // Half one: the mount still exists and still targets the canonical container path.
        expect(backupMount, `no orchestrator mount targets ${CONTAINER_TARGET}`).toBeTruthy();

        const hostSource = hostSourceOf(backupMount);

        // Half two: the host side is a declared deployment input, not a literal.
        expect(hostSource).toContain(HOST_SOURCE_ENV);

        // The actual regression guard. `./x` and `../x` resolve against the Compose project
        // directory, which is a checkout — that is the exact shape being retired, and it is
        // what an innocent "simplify the path" edit reintroduces.
        expect(hostSource.startsWith('./'), `host source "${hostSource}" is checkout-relative`).toBe(false);
        expect(hostSource.startsWith('../'), `host source "${hostSource}" is checkout-relative`).toBe(false);

        // …including inside the `${VAR:-default}` fallback, which is where a nearby default
        // would hide from the two checks above.
        const fallback = hostSource.match(/:-(.*)\}$/)?.[1];

        expect(fallback, `host source "${hostSource}" declares no default`).toBeTruthy();
        expect(fallback.startsWith('./'), `default "${fallback}" is checkout-relative`).toBe(false);
        expect(fallback.startsWith('../'), `default "${fallback}" is checkout-relative`).toBe(false);
    });

    test('the container target is pinned explicitly, because the leaf is no longer a plane member', () => {
        const
            compose     = readCompose(baseComposePath),
            environment = compose.services.orchestrator.environment,
            entry       = environment.find(item => typeof item === 'string' && item.startsWith(`${TARGET_ENV}=`));

        // `backupPath` is an explicit non-member, so the boot member walk no longer places it.
        // Without this line the default resolves to an unbound in-container path and bundles are
        // written into the writable layer, then destroyed on the next recreate.
        expect(entry, `${TARGET_ENV} is not placed on the canonical orchestrator`).toBeTruthy();
        expect(entry).toBe(`${TARGET_ENV}=${CONTAINER_TARGET}`);
    });

    test('the two contracts are not collapsed into one value', () => {
        const
            compose     = readCompose(baseComposePath),
            backupMount = compose.services.orchestrator.volumes
                .find(entry => typeof entry === 'string' && entry.endsWith(`:${CONTAINER_TARGET}`)),
            hostSource  = hostSourceOf(backupMount);

        // Naming the container target as the host source would re-collapse the namespaces the
        // relocation exists to separate, and would render as a nonsensical host path.
        expect(hostSource).not.toBe(CONTAINER_TARGET);
        expect(hostSource).not.toContain(TARGET_ENV);
    });

    test('dev parity still places the target explicitly, on its own relocated root', () => {
        const
            compose  = readCompose(devComposePath),
            planeEnv = compose['x-plane-env'];

        // Parity keeps bundles inside its relocated root deliberately — disposable fixture
        // artifacts on a named volume, where the checkout-deletion vector does not apply. But
        // the leaf is a non-member here too, so the placement must stay EXPLICIT.
        expect(planeEnv[TARGET_ENV]).toBeTruthy();
        expect(planeEnv[TARGET_ENV].startsWith('/app/.neo-ai-data-parity/')).toBe(true);
    });
});
