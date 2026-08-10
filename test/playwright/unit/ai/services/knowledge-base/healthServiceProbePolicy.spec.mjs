import {expect, test}  from '@playwright/test';
import fs              from 'fs-extra';
import path            from 'path';
import {fileURLToPath} from 'url';

const
    repoRoot          = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../'),
    healthServicePath = path.join(repoRoot, 'ai/services/knowledge-base/HealthService.mjs'),
    configBasePath    = path.join(repoRoot, 'ai/mcp/server/knowledge-base/configBase.mjs');

/**
 * @summary Coverage for the Knowledge Base embedding-probe policy becoming deployment-tunable.
 *
 * **The defect.** `HealthService.mjs` froze five probe-policy numerics as module-level literals that
 * were byte-identical to Memory Core's leaf defaults — the same policy, configurable on one side of
 * the plane and unreachable on the other. On CPU-only hardware the 30s deadline sits below the
 * observed completion time of one embed, so the probe fails permanently while the embedder works,
 * and no deployment could reach the number to fix it.
 *
 * **The vacuity trap this suite is built around.** The obvious assertion — "the resolved default
 * equals `aiConfig.healthcheck.embeddingProbeTimeoutMs`" — is WORTHLESS here, because the leaf
 * default is 30000 and so was the literal. It passes identically against the defect. Any test of a
 * refactor that preserves values has this problem, and stating it is cheaper than rediscovering it.
 *
 * So the arms below assert the two things that DO discriminate:
 *   1. the leaves exist and are ENV-BOUND — a literal has no env binding, so this cannot pass against
 *      the frozen form no matter what values it carried;
 *   2. no frozen policy object survives in the consumer — asserted structurally, which is the honest
 *      instrument for "this value is no longer hardcoded".
 *
 * **`AiConfig` is never imported or mutated here** (ADR-0019 §4/B4). Every assertion reads source // ticket-ref-ok: the ADR clause IS the rule this arm enforces; without the citation the constraint reads as a style preference
 * text. Two reasons, and the second is the honest one:
 *   - proving env-binding by SETTING an env var and re-resolving would mean mutating the shared
 *     singleton, which B4 forbids outright — and the binding is a static property of the leaf
 *     declaration, so source is the correct subject rather than a workaround;
 *   - the runtime read I first wrote (`aiConfig.healthcheck.embeddingProbeTimeoutMs === 30000`) was
 *     the VACUOUS arm by the analysis above. Removing it costs this suite no conviction, and the
 *     `leaf(<default>, '<ENV>')` assertion below covers the default value AND the binding together.
 *
 * **Limit, stated rather than implied:** these are structural assertions about declarations, not
 * behavioural ones about a resolved runtime tree. They prove the value is declared as a tunable leaf
 * and is read at the use site. They do not prove the resolver honours the env var — that is
 * `ConfigProvider`'s contract and is covered where that contract lives.
 */

const PROBE_LEAVES = [
    {key: 'embeddingProbeTimeoutMs',       env: 'NEO_KB_HEALTHCHECK_EMBEDDING_PROBE_TIMEOUT_MS',         expected: 30000},
    {key: 'embeddingProbeCadenceMs',       env: 'NEO_KB_HEALTHCHECK_EMBEDDING_PROBE_CADENCE_MS',         expected: 60000},
    {key: 'embeddingProbeHealthyTtlMs',    env: 'NEO_KB_HEALTHCHECK_EMBEDDING_PROBE_HEALTHY_TTL_MS',     expected: 60000},
    {key: 'embeddingProbeFailureTtlMs',    env: 'NEO_KB_HEALTHCHECK_EMBEDDING_PROBE_FAILURE_TTL_MS',     expected: 30000},
    {key: 'embeddingProbeFailureTtlMaxMs', env: 'NEO_KB_HEALTHCHECK_EMBEDDING_PROBE_FAILURE_TTL_MAX_MS', expected: 600000}
];

test.describe('knowledge-base embedding-probe policy is deployment-tunable', () => {
    for (const leafSpec of PROBE_LEAVES) {
        test(`${leafSpec.key} resolves from config and is bound to ${leafSpec.env}`, () => {
            // A frozen literal cannot carry an env binding, so this fails against the defect
            // regardless of which numbers the literal held. The values are deliberately UNCHANGED by
            // this repair - which is precisely why a value comparison cannot be the test, and why
            // the assertion below binds the default and the env name together in one match.
            const configSource = fs.readFileSync(configBasePath, 'utf8');

            expect(configSource).toContain(`'${leafSpec.env}'`);
            expect(configSource).toMatch(
                new RegExp(`${leafSpec.key}\\s*:\\s*leaf\\(\\s*${leafSpec.expected}\\s*,\\s*'${leafSpec.env}'`)
            );
        });
    }

    test('no frozen probe-policy object survives in HealthService', () => {
        // Structural, and it is the right subject: the defect WAS a frozen literal, so its absence is
        // the property. Comments are stripped first - the docblock explaining the removal quotes the
        // old shape, and an assertion that failed on its own explanation would be worse than none.
        const source = fs.readFileSync(healthServicePath, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');

        expect(source).not.toContain('embeddingProbePolicy');
        expect(source).not.toMatch(/timeoutMs\s*:\s*30\s*\*\s*1000/);
    });

    test('every consumer reads the policy at the USE SITE, not through a hoisted alias', () => {
        // ADR-0019 B2, and it is load-bearing rather than stylistic: Memory Core's sibling docblock // ticket-ref-ok: names the clause the assertion mechanizes
        // requires these numerics to RE-RESOLVE at arm time. A hoisted `const` would bind once at
        // module load, so a deployment change would need a process restart to take effect - which is
        // most of the defect this ticket closes, arriving by a different door.
        const source = fs.readFileSync(healthServicePath, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');

        expect(source).not.toMatch(/const\s+\w+\s*=\s*aiConfig\.healthcheck\b/);

        // And the reads are actually present, so the assertion above cannot pass by the reads having
        // been deleted entirely.
        expect(source.match(/aiConfig\.healthcheck\.embeddingProbe\w+/g)?.length ?? 0)
            .toBeGreaterThanOrEqual(PROBE_LEAVES.length);
    });

    test('each consumer parameter is bound to ITS OWN leaf, not merely to some leaf', () => {
        // A reviewer's falsifier, and it is the reason this arm exists: the suite stayed green
        // when the production `timeoutMs` read was mutated to `embeddingProbeCadenceMs`. Every
        // arm above asserts the
        // SHAPE of the reads - that they exist, are env-bound, are not hoisted - and none asserted
        // WHICH leaf reaches WHICH parameter. A wiring swap is invisible to shape assertions, and it
        // is the failure that ships a probe running on the wrong number while every gate is green.
        const source = fs.readFileSync(healthServicePath, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');

        const BINDINGS = [
            ['timeoutMs',       'embeddingProbeTimeoutMs'],
            ['cadenceMs',       'embeddingProbeCadenceMs'],
            ['healthyTtlMs',    'embeddingProbeHealthyTtlMs'],
            ['failureTtlMs',    'embeddingProbeFailureTtlMs'],
            ['failureTtlMaxMs', 'embeddingProbeFailureTtlMaxMs']
        ];

        for (const [param, leafKey] of BINDINGS) {
            // The parameter must read its own leaf...
            expect(source, `${param} must read aiConfig.healthcheck.${leafKey}`)
                .toMatch(new RegExp(`\\b${param}\\s*=\\s*aiConfig\\.healthcheck\\.${leafKey}\\b`));

            // ...and must not read any OTHER probe leaf. Without this half the assertion above
            // passes on a file that reads the right leaf once and a wrong one elsewhere.
            const wrong = BINDINGS
                .filter(([, otherLeaf]) => otherLeaf !== leafKey)
                .map(([, otherLeaf]) => otherLeaf);

            for (const otherLeaf of wrong) {
                expect(source, `${param} must NOT read aiConfig.healthcheck.${otherLeaf}`)
                    .not.toMatch(new RegExp(`\\b${param}\\s*=\\s*aiConfig\\.healthcheck\\.${otherLeaf}\\b`));
            }
        }
    });
});
