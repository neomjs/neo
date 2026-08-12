import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs';
import path               from 'node:path';
import {load as loadYaml} from 'js-yaml';
import {
    VECTOR_GENERATION_ELECTION_SUBDIR,
    resolveVectorGenerationElectionDir
} from '../../../../../ai/services/shared/vector/generationElectionStore.mjs';

const repoRoot             = path.resolve(process.cwd());
const composePath          = path.join(repoRoot, 'ai/deploy/docker-compose.yml');
const VOLUME_NAME          = 'shared-vector-generation-data';
const CONTAINER_PLANE_ROOT = '/app/.neo-ai-data';

// Every service that produces or consumes the election record. A service on this list without the
// shared mount gets its own container-local copy of the "singleton", and a split record inverts the
// fence's legacy fail-safe into a bypass (one service sees `missing` while another declared an
// election elsewhere).
const ELECTION_SERVICES = ['kb-server', 'mc-server', 'orchestrator'];

test.describe('the vector-generation election record is one physical mount (#17023)', () => {
    const doc      = loadYaml(fs.readFileSync(composePath, 'utf8').replace(/!override\b/g, ''));
    const services = doc.services || {};

    test('the canonical profile declares the shared election volume', () => {
        expect(Object.keys(doc.volumes || {}), 'top-level volumes must declare the election volume')
            .toContain(VOLUME_NAME)
    });

    test('every election producer/consumer mounts the SAME volume at the SAME resolved path, writable', () => {
        // The container-side target is tied to the store's own resolver, so a drift in EITHER the
        // compose literal or the shared subpath constant fails here rather than splitting authority.
        const expectedTarget = resolveVectorGenerationElectionDir({planeDataRoot: CONTAINER_PLANE_ROOT});

        expect(expectedTarget).toBe(`${CONTAINER_PLANE_ROOT}/${VECTOR_GENERATION_ELECTION_SUBDIR}`);

        for (const serviceKey of ELECTION_SERVICES) {
            const mounts = (services[serviceKey]?.volumes || []).filter(entry =>
                typeof entry === 'string' && entry.startsWith(`${VOLUME_NAME}:`));

            expect(mounts, `${serviceKey} must mount ${VOLUME_NAME}`).toHaveLength(1);
            expect(mounts[0], `${serviceKey} must mount the election volume at the resolved dir, writable`)
                .toBe(`${VOLUME_NAME}:${expectedTarget}`)
        }
    });

    test('no service mounts the election path from any OTHER source', () => {
        for (const [serviceKey, service] of Object.entries(services)) {
            for (const entry of service?.volumes || []) {
                if (typeof entry !== 'string') continue;
                const [source, target] = entry.split(':');

                if (target === `${CONTAINER_PLANE_ROOT}/${VECTOR_GENERATION_ELECTION_SUBDIR}`) {
                    expect(source, `${serviceKey} mounts the election dir from '${source}' — only ${VOLUME_NAME} may serve it`)
                        .toBe(VOLUME_NAME)
                }
            }
        }
    })
});
