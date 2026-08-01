import {setup} from '../../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : 'KbTenantBootstrapContractTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import fs             from 'node:fs';
import path           from 'node:path';
import process        from 'node:process';
import {load}         from 'js-yaml';

// Compose's `!override` merge tag (used by the overlay's ingress section, which this spec never
// asserts) is not YAML-core; strip the tag token so the values parse as their plain shapes and
// the document stays structurally readable. Assertions below run on the parsed model only.
const yamlLoad = (source, {compose = false} = {}) => load(compose ? source.replace(/!override/g, '') : source);

/**
 * Guards the tracked N=1 tenant bootstrap (`ai/deploy/kb-config.yaml`) through the PRODUCTION
 * read and normalization paths — not a schema the test invents.
 *
 * The deployment mounts this file at `<neoRootDir>/kb-config.yaml`, where the tenant-config
 * resolver's tier-2 bootstrap reads it FAIL-SOFT: a malformed document resolves to `null` and the
 * pull sync silently falls back to the aiConfig default tier (zero tenants). That silent-fallback
 * shape is exactly why these assertions run the real reader and the real entry normalizer against
 * the tracked bytes — a field-name drift fails here, loudly, instead of at a live boot.
 */

const
    repoRoot     = path.resolve(process.cwd()),
    bootstrapRel = 'ai/deploy/kb-config.yaml',
    overlayRel   = 'ai/deploy/docker-compose.local-agent-os.yml',
    MOUNT_ENTRY  = './kb-config.yaml:/app/kb-config.yaml:ro';

test.describe('ai/deploy/kb-config.yaml — N=1 tenant bootstrap contract', () => {
    let IngestionService, normalizeTenantRepoEntry;

    test.beforeAll(async () => {
        IngestionService         = (await import('../../../../../ai/services/knowledge-base/IngestionService.mjs')).default;
        normalizeTenantRepoEntry = (await import('../../../../../ai/services/knowledge-base/helpers/tenantRepoAccessContract.mjs')).normalizeTenantRepoEntry
    });

    test('the tracked deployment file loads through the production bootstrap reader', () => {
        const tracked = fs.readFileSync(path.join(repoRoot, bootstrapRel), 'utf8');

        const result = IngestionService.readKbConfigBootstrapResult({
            fileSystem: {
                readFileSync() {
                    return tracked
                }
            }
        });

        expect(result.status).toBe('loaded');
        expect(result.tenantCount).toBe(1);
        expect(Object.keys(result.document.tenants)).toEqual(['neo-shared'])
    });

    test('the neo entry normalizes through the production contract to exactly one neo-shared/neo repo', () => {
        const
            document = yamlLoad(fs.readFileSync(path.join(repoRoot, bootstrapRel), 'utf8')),
            repos    = document.tenants['neo-shared'].tenantRepos;

        expect(repos).toHaveLength(1);

        const normalized = normalizeTenantRepoEntry(repos[0]);

        expect(normalized.tenantId).toBe('neo-shared');
        expect(normalized.repoSlug).toBe('neo');
        expect(normalized.cloneUrl).toBe('https://github.com/neomjs/neo.git');
        expect(normalized.credentialRef).toBe('none');
        expect(normalized.branchRef).toBe('dev')
    });

    test('exactly the two consuming services mount the bootstrap read-only in the local-agent-os overlay', () => {
        const overlay = yamlLoad(fs.readFileSync(path.join(repoRoot, overlayRel), 'utf8'), {compose: true});

        const mountingServices = Object.entries(overlay.services)
            .filter(([, service]) => (service.volumes || []).includes(MOUNT_ENTRY))
            .map(([name]) => name)
            .sort();

        // Pinned both ways: a service dropping the mount fails (silent tier-fallback trap),
        // and a THIRD mounter fails too — new bootstrap consumers are a design change to review,
        // not a drift for this spec to follow.
        expect(mountingServices).toEqual(['kb-server', 'orchestrator'])
    });
});
