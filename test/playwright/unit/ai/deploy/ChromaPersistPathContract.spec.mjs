import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs/promises';
import path               from 'node:path';
import process            from 'node:process';
import {load as yamlLoad} from 'js-yaml';

/**
 * Guards the Chroma persist-path contract for the three BASE compose files that define a chroma
 * service (the deploy overlays inherit these definitions and declare no storage of their own).
 *
 * The `chromadb/chroma:1.5.9` entrypoint runs `chroma run /config.yaml`, and that shipped config
 * pins `persist_path: /data`. `PERSIST_DIRECTORY` is NOT read on that path: a storage mount
 * anywhere else leaves the live store in the ephemeral container layer while the mounted volume
 * sits empty — one recreate away from total store loss. Every assertion is fail-closed: a compose
 * file that drops its chroma service, renames it, or lets a mount drift off the image persist
 * path fails by name rather than passing vacuously.
 */

const
    repoRoot           = path.resolve(process.cwd()),
    IMAGE_PIN          = 'chromadb/chroma:1.5.9',
    IMAGE_PERSIST_PATH = '/data',
    RETIRED_LEAF       = '/chroma/unified',
    COMPOSE_FILES      = [
        'ai/deploy/docker-compose.yml',
        'ai/deploy/docker-compose.dev.yml',
        'ai/deploy/docker-compose.test.yml'
    ];

/**
 * Normalizes one compose storage entry (volumes or tmpfs; string or long form) to its
 * container-side target path.
 * @param {Object|String} entry Compose `volumes`/`tmpfs` list entry
 * @returns {String} Container mount target
 */
function mountTarget(entry) {
    if (typeof entry === 'string') {
        // 'source:target[:opts]' named/bind form, or a bare '/target' anonymous/tmpfs form.
        const parts = entry.split(':');
        return parts.length > 1 ? parts[1] : parts[0]
    }

    return entry.target
}

/**
 * Resolves the chroma service's declared storage targets (volumes + tmpfs union).
 * @param {Object} service Parsed compose service definition
 * @returns {String[]} Container-side mount targets
 */
function storageTargets(service) {
    return [...(service.volumes || []), ...(service.tmpfs || [])].map(mountTarget)
}

/**
 * Reads PERSIST_DIRECTORY from either compose environment form (list of 'K=V' or map).
 * @param {Object} service Parsed compose service definition
 * @returns {String|undefined} The declared value, or undefined when absent
 */
function persistDirectoryEnv(service) {
    const env = service.environment;

    if (Array.isArray(env)) {
        const hit = env.find(line => typeof line === 'string' && line.startsWith('PERSIST_DIRECTORY='));
        return hit?.slice('PERSIST_DIRECTORY='.length)
    }

    return env?.PERSIST_DIRECTORY
}

for (const relPath of COMPOSE_FILES) {
    test.describe(`${relPath} — chroma persist-path contract`, () => {
        let chroma;

        test.beforeAll(async () => {
            const parsed = yamlLoad(await fs.readFile(path.join(repoRoot, relPath), 'utf8'));
            chroma = parsed?.services?.chroma
        });

        test('positive control: the chroma service exists and carries the audited image pin', () => {
            expect(chroma, 'services.chroma missing — the contract subject vanished').toBeTruthy();
            // The /data persist path is proven for exactly this image build. A bump must
            // re-verify the shipped /config.yaml persist_path before changing this pin.
            expect(chroma.image).toBe(IMAGE_PIN)
        });

        test(`declares a storage mount at the image persist path ${IMAGE_PERSIST_PATH}`, () => {
            const targets = storageTargets(chroma);

            expect(targets.length, 'chroma declares no storage surface at all').toBeGreaterThan(0);
            expect(targets).toContain(IMAGE_PERSIST_PATH)
        });

        test('PERSIST_DIRECTORY, when declared, agrees with the mounted leaf', () => {
            const declared = persistDirectoryEnv(chroma);

            if (declared !== undefined) {
                expect(declared).toBe(IMAGE_PERSIST_PATH)
            }
        });

        test(`no storage surface still targets the retired ${RETIRED_LEAF} leaf`, () => {
            // Paired with the positive /data assertions above, so this negative cannot pass
            // vacuously on a parse failure or a renamed service.
            expect(storageTargets(chroma)).not.toContain(RETIRED_LEAF)
        });
    });
}
