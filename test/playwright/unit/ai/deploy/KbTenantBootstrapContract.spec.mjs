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

        expect(repos).toHaveLength(4);

        const normalized = repos.map(normalizeTenantRepoEntry);

        const expected = [
            {repoSlug: 'create-app',       cloneUrl: 'https://github.com/neomjs/create-app.git'},
            {repoSlug: 'devindex-opt-in',  cloneUrl: 'https://github.com/neomjs/devindex-opt-in.git'},
            {repoSlug: 'devindex-opt-out', cloneUrl: 'https://github.com/neomjs/devindex-opt-out.git'},
            {repoSlug: 'devindex',         cloneUrl: 'https://github.com/neomjs/devindex.git'}
        ];

        expected.forEach((entry, index) => {
            expect(normalized[index].tenantId).toBe('neo-shared');
            expect(normalized[index].repoSlug).toBe(entry.repoSlug);
            expect(normalized[index].cloneUrl).toBe(entry.cloneUrl);
            expect(normalized[index].credentialRef).toBe('none');
            expect(normalized[index].branchRef).toBe('main');
        });

        // The Neo repo is deliberately absent: `kbSync` already ingests it through the source
        // extractors, and a pull-mode entry for the same repo declares no parser, so it produced a
        // second untyped corpus under the same `{tenantId, repoSlug}` stamp `kbSync` defaults to —
        // after which each lane deleted the other's rows as stale.
        expect(normalized.some(repo => repo.repoSlug === 'neo')).toBe(false)
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
        expect(keys).toEqual([
            'neo-shared/create-app',
            'neo-shared/devindex-opt-in',
            'neo-shared/devindex-opt-out',
            'neo-shared/devindex'
        ])
    });

    test('every repo declares its own branchRef rather than relying on a sibling or a default', () => {
        // This asserts the actual invariant — each entry declares `branchRef` EXPLICITLY — rather
        // than the older proxy for it, "neo says dev and create-app says main, so they differ".
        //
        // That proxy had to be replaced rather than updated. With the neo entry removed,
        // `bySlug.neo` becomes undefined and `undefined !== 'main'` still passes, so the old
        // assertion would have gone VACUOUS instead of red — a green test proving nothing.
        //
        // Coverage regression stated on purpose: neo was the only entry whose branchRef differed
        // from its `default_branch`, so nothing here currently exercises resolving a NON-default
        // branch. A future non-default-branch tenant should restore that, and this comment is the
        // pointer for whoever adds one.
        //
        // Note this is a DEPLOYMENT POLICY on top of the access contract, not a restatement of it:
        // `tenantRepoAccessContract` documents `branchRef` as present only when configured, so an
        // entry that omits it is contract-legal and fails this test on purpose. Silent inheritance
        // from a sibling is the failure the config comment warns about, so this bootstrap requires
        // what the contract merely permits. A future author hitting this is looking at a policy
        // decision, not a contract break.
        const
            document = yamlLoad(fs.readFileSync(path.join(repoRoot, bootstrapRel), 'utf8')),
            entries  = document.tenants['neo-shared'].tenantRepos;

        expect(entries.length).toBeGreaterThan(1);

        entries.forEach(entry => {
            // Read the RAW yaml entry, not the normalized one: a normalizer that defaults a
            // missing branchRef would hide the omission this test exists to catch.
            expect(typeof entry.branchRef, `${entry.repoSlug} declares branchRef`).toBe('string');
            expect(entry.branchRef.trim().length).toBeGreaterThan(0);
        });

        const bySlug = Object.fromEntries(entries
            .map(normalizeTenantRepoEntry)
            .map(repo => [repo.repoSlug, repo.branchRef]));

        expect(bySlug['create-app']).toBe('main');
        expect(bySlug['devindex-opt-in']).toBe('main');
        expect(bySlug['devindex-opt-out']).toBe('main');
        expect(bySlug['devindex']).toBe('main')
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
