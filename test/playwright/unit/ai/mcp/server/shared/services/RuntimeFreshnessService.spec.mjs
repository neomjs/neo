import {setup} from '../../../../../../setup.mjs';

const appName = 'RuntimeFreshnessServiceTest';

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

import {test, expect}                                 from '@playwright/test';
import path                                           from 'path';
import {fileURLToPath}                                from 'url';
import Neo                                            from '../../../../../../../../src/Neo.mjs';
import * as core                                      from '../../../../../../../../src/core/_export.mjs';
import RuntimeFreshnessService, {resolveStatusFields} from '../../../../../../../../ai/mcp/server/shared/services/RuntimeFreshnessService.mjs';

const
    testDir  = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot = path.resolve(testDir, '../../../../../../../../');

/**
 * @summary Unit coverage for the shared MCP runtime freshness substrate.
 *
 * The shared service owns the policy that service-owned digests drive stale status while
 * repo-wide `gitHead` drift stays contextual. This prevents three MCP health services from
 * re-deriving divergent restart warnings.
 */
test.describe('Neo.ai.mcp.server.shared.services.RuntimeFreshnessService (#12776)', () => {
    test('keeps gitHead drift contextual when status-driving fields match', () => {
        const result = RuntimeFreshnessService.classifyRuntimeFreshness({
            startedAt: '2026-06-08T00:00:00.000Z',
            boot     : {
                gitHead      : 'old-head',
                openApiDigest: 'sha256:same-openapi'
            },
            current         : {
                gitHead      : 'new-head',
                openApiDigest: 'sha256:same-openapi'
            },
            fieldKeys         : ['gitHead', 'openApiDigest'],
            statusFields      : ['openApiDigest'],
            serviceName       : 'Test MCP server',
            identityLabel     : 'schema identity',
            assertionFacts    : 'tool-schema/source facts',
            restartScope      : 'cached tool definitions',
            unavailableSummary: 'git metadata and OpenAPI digest'
        });

        expect(result).toMatchObject({
            status   : 'current',
            startedAt: '2026-06-08T00:00:00.000Z',
            stale    : {
                gitHead      : true,
                openApiDigest: false
            },
            hint: null
        });
        expect(result.details[0]).toBe('Runtime schema identity matches the current checkout.');
        expect(result.details[1]).toContain('Contextual runtime identity differs (gitHead)');
        expect(result.boot).toBeUndefined();
        expect(result.current).toBeUndefined();
    });

    test('marks stale when a status-driving digest differs', () => {
        const result = RuntimeFreshnessService.classifyRuntimeFreshness({
            startedAt: '2026-06-08T00:00:00.000Z',
            boot     : {
                gitHead      : 'same-head',
                configDigest : 'sha256:old-config',
                openApiDigest: 'sha256:same-openapi'
            },
            current         : {
                gitHead      : 'same-head',
                configDigest : 'sha256:new-config',
                openApiDigest: 'sha256:same-openapi'
            },
            fieldKeys         : ['gitHead', 'configDigest', 'openApiDigest'],
            statusFields      : ['configDigest', 'openApiDigest'],
            serviceName       : 'Test MCP server',
            identityLabel     : 'config/schema identity',
            assertionFacts    : 'provider/config facts',
            restartScope      : 'cached provider/config state',
            unavailableSummary: 'git metadata, config digest, and OpenAPI digest'
        });

        expect(result).toMatchObject({
            status: 'stale',
            stale : {
                gitHead      : false,
                configDigest : true,
                openApiDigest: false
            },
            hint: 'Restart or reconnect the Test MCP server to refresh cached provider/config state.'
        });
        expect(result.details[0]).toContain('configDigest');
    });

    test('reports unknown when only contextual gitHead can be compared', () => {
        const result = RuntimeFreshnessService.classifyRuntimeFreshness({
            startedAt: '2026-06-08T00:00:00.000Z',
            boot     : {
                gitHead: 'same-head'
            },
            current         : {
                gitHead: 'same-head'
            },
            errors            : ['current OpenAPI digest unavailable: fixture'],
            fieldKeys         : ['gitHead', 'openApiDigest'],
            statusFields      : ['openApiDigest'],
            serviceName       : 'Test MCP server',
            identityLabel     : 'schema identity',
            assertionFacts    : 'tool-schema/source facts',
            restartScope      : 'cached tool definitions',
            unavailableSummary: 'git metadata and OpenAPI digest'
        });

        expect(result).toMatchObject({
            status: 'unknown',
            stale : {
                gitHead      : false,
                openApiDigest: null
            },
            hint: null
        });
        expect(result.details[0]).toContain('could not be compared');
        expect(result.details).toContain('current OpenAPI digest unavailable: fixture');
    });

    test('caches current identity reads per tracker until the short TTL expires', async () => {
        const tracker = RuntimeFreshnessService.createTracker({
            rootDir: repoRoot,
            files  : [{
                key       : 'openApiDigest',
                path      : path.resolve(repoRoot, 'ai/mcp/server/github-workflow/openapi.yaml'),
                errorLabel: 'OpenAPI digest'
            }],
            serviceName       : 'Test MCP server',
            identityLabel     : 'schema identity',
            assertionFacts    : 'tool-schema/source facts',
            restartScope      : 'cached tool definitions',
            statusFields      : ['openApiDigest'],
            unavailableSummary: 'git metadata and OpenAPI digest'
        });

        let readCount     = 0,
            openApiDigest = 'sha256:same-openapi';

        const reader = async () => {
            readCount++;

            return {
                boot: {
                    gitHead      : 'same-head',
                    openApiDigest: 'sha256:same-openapi'
                },
                current: {
                    gitHead      : 'same-head',
                    openApiDigest
                }
            };
        };

        const first = await tracker.resolve({reader, cacheDuration: 1000, now: 1000});

        expect(first.status).toBe('current');
        expect(readCount).toBe(1);

        openApiDigest = 'sha256:new-openapi';

        const cached = await tracker.resolve({reader, cacheDuration: 1000, now: 1500});

        expect(cached.status).toBe('current');
        expect(readCount).toBe(1);

        const refreshed = await tracker.resolve({reader, cacheDuration: 1000, now: 2501});

        expect(refreshed).toMatchObject({
            status: 'stale',
            stale : {
                openApiDigest: true
            }
        });
        expect(readCount).toBe(2);
    });

    test('a tracker created without rootDir never reads git and omits gitHead entirely', async () => {
        const tracker = RuntimeFreshnessService.createTracker({
            files: [{
                key       : 'openApiDigest',
                path      : path.resolve(repoRoot, 'ai/mcp/server/github-workflow/openapi.yaml'),
                errorLabel: 'OpenAPI digest'
            }],
            serviceName       : 'Cloud MCP server',
            // Narrowed: this fixture claimed source identity while configuring no rootDir — the
            // same overclaim the shipped call sites carried, and the construction guard now
            // refuses it. The assertion below is about gitHead omission, so the label is
            // incidental to what this test proves.
            identityLabel     : 'schema identity',
            assertionFacts    : 'tool-schema facts',
            restartScope      : 'cached tool definitions',
            statusFields      : ['openApiDigest'],
            unavailableSummary: 'config digest and OpenAPI digest'
        });

        // Real read (no reader seam): a rootDir-less consumer must never spawn `git`, so no
        // `gitHead` field and no `gitHead unavailable` error can appear. This is the portability
        // guarantee for cloud-deployed Memory Core / Knowledge Base on a non-git checkout.
        const {current, errors} = await tracker.readCurrentIdentity();

        expect(current).not.toHaveProperty('gitHead');
        expect(current).toHaveProperty('openApiDigest');
        expect(errors.some(error => error.includes('gitHead'))).toBe(false);

        const result = await tracker.resolve({now: 1000});

        expect(result.status).toBe('current');
        expect(result.stale).not.toHaveProperty('gitHead');
    });

    /**
     * A freshness verdict is what an operator reads to decide whether to investigate, so a label
     * claiming an unmeasured dimension is a false assurance rather than a cosmetic slip. Witness:
     * every MCP HealthService asserted "source identity matches the current checkout" while
     * comparing only file digests, and a container running source 2h22m behind `dev` said
     * `current` — which stopped three peers investigating fixes that were merged but not deployed.
     */
    describeLabelBacking();
});

function describeLabelBacking() {
    const
        CONFIG_AND_SCHEMA = [{key: 'configDigest'}, {key: 'openApiDigest'}],
        SCHEMA_ONLY       = [{key: 'openApiDigest'}];

    test('rejects a source claim when no rootDir is configured — the shipped defect', () => {
        expect(() => RuntimeFreshnessService.createTracker({
            identityLabel: 'source/config identity',
            files        : CONFIG_AND_SCHEMA
        })).toThrow(/claims source identity/);
    });

    test('rejects an unbacked claim even when the label\'s other dimension IS backed', () => {
        // The shipped shape exactly: 'source/…' alongside a dimension that genuinely is measured.
        // A guard asking "is ANY claimed dimension backed" would have passed this.
        expect(() => RuntimeFreshnessService.createTracker({
            identityLabel: 'source/schema identity',
            files        : SCHEMA_ONLY
        })).toThrow(/claims source identity/);
    });

    test('rejects a config claim when only a schema digest is configured', () => {
        expect(() => RuntimeFreshnessService.createTracker({
            identityLabel: 'config identity',
            files        : SCHEMA_ONLY
        })).toThrow(/claims config identity/);
    });

    test('the refusal names the unbacked dimension AND what is configured', () => {
        let message = '';

        try {
            RuntimeFreshnessService.createTracker({identityLabel: 'source identity', files: CONFIG_AND_SCHEMA});
        } catch (error) {
            message = error.message;
        }

        expect(message).toContain('source');
        expect(message).toContain('configDigest');
        expect(message).toContain('rootDir: unset');
    });

    // POSITIVE CONTROLS — without these, a guard that rejected every label would satisfy the
    // assertions above and read as correct.
    test('an honest config/schema label constructs', () => {
        expect(() => RuntimeFreshnessService.createTracker({
            identityLabel: 'config/schema identity',
            files        : CONFIG_AND_SCHEMA
        })).not.toThrow();
    });

    test('rejects the pre-fix GitHub Workflow shape — rootDir observes gitHead but does not make it authoritative', () => {
        // The configuration that shipped: gitHead readable via rootDir, but statusFields names only
        // openApiDigest, so `classifyRuntimeFreshness` can return status:'current' with
        // stale.gitHead:true — emitting "Runtime source/schema identity matches the current checkout"
        // beside "Contextual runtime identity differs (gitHead)". A guard keyed on rootDir admits it.
        expect(() => RuntimeFreshnessService.createTracker({
            identityLabel: 'source/schema identity',
            rootDir      : repoRoot,
            files        : SCHEMA_ONLY,
            statusFields : ['openApiDigest']
        })).toThrow(/claims source identity/);
    });

    test('rejects source when statusFields is defaulted — the default excludes gitHead by construction', () => {
        // `statusFields || fieldKeys.filter(key => key !== 'gitHead')`: omitting it can never make
        // gitHead status-driving, so a rootDir plus silence is still not verdict authority.
        expect(() => RuntimeFreshnessService.createTracker({
            identityLabel: 'source identity',
            rootDir      : repoRoot,
            files        : CONFIG_AND_SCHEMA
        })).toThrow(/claims source identity/);
    });

    test('source IS admissible when gitHead is named status-driving — the guard blocks the claim, not the dimension', () => {
        expect(() => RuntimeFreshnessService.createTracker({
            identityLabel: 'source identity',
            rootDir      : repoRoot,
            files        : [],
            statusFields : ['gitHead']
        })).not.toThrow();
    });

    // Table-driven mixed authority: every dimension keys on the SAME effective status set, so a
    // field that is observed-but-excluded can never authorize a positive claim. Isolating each
    // dimension matters — the first cut fixed `source` and left `config`/`schema` on `files`,
    // which is the identical defect one dimension over.
    for (const [dimension, label, observedFiles, statusFields] of [
        ['source', 'source identity', CONFIG_AND_SCHEMA,               ['configDigest', 'openApiDigest']],
        ['config', 'config identity', CONFIG_AND_SCHEMA,               ['openApiDigest']],
        ['schema', 'schema identity', CONFIG_AND_SCHEMA,               ['configDigest']]
    ]) {
        test(`rejects a ${dimension} claim when its field is observed but excluded from statusFields`, () => {
            expect(() => RuntimeFreshnessService.createTracker({
                identityLabel: label,
                rootDir      : repoRoot,
                files        : observedFiles,
                statusFields
            })).toThrow(new RegExp(`claims ${dimension} identity`));
        });
    }

    for (const [dimension, label, statusFields] of [
        ['source', 'source identity', ['gitHead']],
        ['config', 'config identity', ['configDigest']],
        ['schema', 'schema identity', ['openApiDigest']]
    ]) {
        test(`admits a ${dimension} claim once its field IS status-driving`, () => {
            expect(() => RuntimeFreshnessService.createTracker({
                identityLabel: label,
                rootDir      : repoRoot,
                files        : CONFIG_AND_SCHEMA,
                statusFields
            })).not.toThrow();
        });
    }

    test('with statusFields defaulted, file digests ARE status-driving — the guard must not over-reject', () => {
        // The default set is every fieldKey except gitHead, so config/schema are backed without an
        // explicit statusFields. Over-rejecting here would make the honest common case unusable.
        expect(() => RuntimeFreshnessService.createTracker({
            identityLabel: 'config/schema identity',
            files        : CONFIG_AND_SCHEMA
        })).not.toThrow();
    });

    test('the guard and the tracker resolve the SAME status set — one definition, not two', () => {
        // The defect this whole ticket is about, one layer up: if the guard derived the set
        // independently it could authorize a claim the verdict cannot support.
        expect(resolveStatusFields({files: CONFIG_AND_SCHEMA, rootDir: repoRoot}))
            .toEqual(['configDigest', 'openApiDigest']);
        expect(resolveStatusFields({statusFields: ['gitHead'], files: CONFIG_AND_SCHEMA}))
            .toEqual(['gitHead']);
    });

    test('the refusal names statusFields, not just files — the reader must know which set was short', () => {
        let message = '';

        try {
            RuntimeFreshnessService.createTracker({
                identityLabel: 'source/schema identity',
                rootDir      : repoRoot,
                files        : SCHEMA_ONLY,
                statusFields : ['openApiDigest']
            });
        } catch (error) {
            message = error.message;
        }

        expect(message).toContain('STATUS-DRIVING');
        expect(message).toContain('statusFields: [openApiDigest]');
        expect(message).toContain('rootDir: set');
    });

    test('the default label constructs with nothing configured — the safe case stays free', () => {
        // The previous default named source/config/schema, so an unconfigured tracker asserted all
        // three. A default that cannot overclaim is what makes the guard non-punitive.
        expect(() => RuntimeFreshnessService.createTracker({})).not.toThrow();
    });

    test('a word outside the dimension vocabulary is ignored, never invented into a violation', () => {
        expect(() => RuntimeFreshnessService.createTracker({
            identityLabel: 'provider identity',
            files        : CONFIG_AND_SCHEMA
        })).not.toThrow();
    });

    for (const [service, identityLabel, files] of [
        ['memory-core',     'config/schema identity', CONFIG_AND_SCHEMA],
        ['knowledge-base',  'config/schema identity', CONFIG_AND_SCHEMA],
        ['neural-link',     'config/schema identity', CONFIG_AND_SCHEMA],
        ['github-workflow', 'schema identity',        SCHEMA_ONLY]
    ]) {
        test(`the shipped ${service} label is backed by its own configured inputs`, () => {
            expect(() => RuntimeFreshnessService.createTracker({identityLabel, files})).not.toThrow();
        });
    }
}
