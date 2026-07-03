import {setup} from '../../../../setup.mjs';

const appName = 'FleetRegistryServiceTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}       from '@playwright/test';
import Neo                  from '../../../../../../src/Neo.mjs';
import * as core            from '../../../../../../src/core/_export.mjs';
import FleetRegistryService from '../../../../../../ai/services/fleet/FleetRegistryService.mjs';
import fs                   from 'fs';
import os                   from 'os';
import path                 from 'path';

// FleetRegistryService is a singleton. Pointing `dataDir` at a fresh temp dir per test makes
// ensureLoaded reload an empty registry (isolation) and keeps every write off the real
// ~/.neo-ai-data. No credential is passed, so the crypto/storeCredential path is never exercised.

test.describe('Neo.ai.services.fleet.FleetRegistryService.updateAgent — narrow partial-merge patch', () => {
    let tmpDir;

    test.beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-fleet-reg-'));
        FleetRegistryService.dataDir = tmpDir;
    });

    test.afterEach(() => {
        FleetRegistryService.dataDir = null;
        fs.rmSync(tmpDir, {recursive: true, force: true});
    });

    test('merges the metadata patch into the existing definition, preserving every other field', () => {
        FleetRegistryService.defineAgent({githubUsername: 'alice', harnessType: 'codex', metadata: {tier: 'A', keep: 1}});

        const updated = FleetRegistryService.updateAgent('alice', {metadata: {tier: 'B', repoUrl: 'https://github.com/x/y'}});

        // merged (not replaced): the untouched `keep` survives, `tier` overrides, `repoUrl` is added
        expect(updated.metadata).toEqual({tier: 'B', keep: 1, repoUrl: 'https://github.com/x/y'});
        expect(updated.githubUsername).toBe('alice');
        expect(updated.harnessType).toBe('codex');
    });

    test('returns null for an unknown agent — invents no partial definition', () => {
        expect(FleetRegistryService.updateAgent('ghost', {metadata: {x: 1}})).toBeNull();
    });

    test('a patch without metadata leaves the existing metadata intact (no accidental wipe)', () => {
        FleetRegistryService.defineAgent({githubUsername: 'bob', harnessType: 'codex', metadata: {a: 1}});

        const updated = FleetRegistryService.updateAgent('bob', {});

        expect(updated.metadata).toEqual({a: 1});
    });
});
