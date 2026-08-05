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
 * Guards the tracked tenant bootstrap (`ai/deploy/kb-config.yaml`) through the PRODUCTION
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

test.describe('ai/deploy/kb-config.yaml — tenant bootstrap contract', () => {
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

    test('both entries normalize through the production contract under one neo-shared tenant', () => {
        const
            document = yamlLoad(fs.readFileSync(path.join(repoRoot, bootstrapRel), 'utf8')),
            repos    = document.tenants['neo-shared'].tenantRepos;

        expect(repos).toHaveLength(2);

        const normalized = repos.map(normalizeTenantRepoEntry);

        expect(normalized[0].tenantId).toBe('neo-shared');
        expect(normalized[0].repoSlug).toBe('neo');
        expect(normalized[0].cloneUrl).toBe('https://github.com/neomjs/neo.git');
        expect(normalized[0].credentialRef).toBe('none');
        expect(normalized[0].branchRef).toBe('dev');

        expect(normalized[1].tenantId).toBe('neo-shared');
        expect(normalized[1].repoSlug).toBe('create-app');
        expect(normalized[1].cloneUrl).toBe('https://github.com/neomjs/create-app.git');
        expect(normalized[1].credentialRef).toBe('none');
        expect(normalized[1].branchRef).toBe('main')
    });

    test('repo identity is unique per tenantId/repoSlug, which is what keeps the two corpora apart', () => {
        // The chunk id is sha256 over {tenantId, repoSlug, hash, type, name, source}, so two entries
        // sharing a tenantId are only safe while their repoSlug differs. A duplicate pair would
        // silently collapse two repos into one identity namespace instead of failing loudly.
        const
            document = yamlLoad(fs.readFileSync(path.join(repoRoot, bootstrapRel), 'utf8')),
            keys     = document.tenants['neo-shared'].tenantRepos
                .map(normalizeTenantRepoEntry)
                .map(repo => `${repo.tenantId}/${repo.repoSlug}`);

        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).toEqual(['neo-shared/neo', 'neo-shared/create-app'])
    });

    test('branchRef is declared per repo and never inherited from a sibling', () => {
        // create-app has no `dev` branch at all (verified against the remote), so inheriting neo's
        // `dev` would make its clone fail. This pins that the two differ ON PURPOSE — a future
        // normalization that defaults a missing branchRef from a sibling breaks this.
        const
            document = yamlLoad(fs.readFileSync(path.join(repoRoot, bootstrapRel), 'utf8')),
            bySlug   = Object.fromEntries(document.tenants['neo-shared'].tenantRepos
                .map(normalizeTenantRepoEntry)
                .map(repo => [repo.repoSlug, repo.branchRef]));

        expect(bySlug.neo).toBe('dev');
        expect(bySlug['create-app']).toBe('main');
        expect(bySlug.neo).not.toBe(bySlug['create-app'])
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
