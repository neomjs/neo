import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs';
import path               from 'node:path';
import process            from 'node:process';
import {load as yamlLoad} from 'js-yaml';

/**
 * @summary A leaf whose default is a loopback address must be reachable through the deployment.
 *
 * Inside a container, `127.0.0.1` and `localhost` name **the container itself**. So a leaf that
 * defaults to a loopback address and cannot be overridden through the Compose profile is not
 * "using a sensible default" — it is unconditionally pointed at the wrong process, on every
 * deployment, with no configuration path able to correct it. The failure surfaces as a connection
 * refused, which reads as "the dependency is down" rather than "the host was never configurable".
 *
 * That is not hypothetical: `NEO_OLLAMA_HOST` was declared as a leaf, consumed by a complete
 * provider and a readiness branch, and passed to no service in this profile. Any plane selecting
 * the ollama provider through the canonical profile sent every embed to its own container.
 *
 * **This is a floor, and a weak one on purpose.** It asks only whether a name is overridable
 * *somewhere* in the profile, which cannot distinguish "every consuming service receives it" from
 * "one service does". It also says nothing about the bound *value*. The per-service contract — the
 * `(service, leaf)` coordinates and their operator-overridable shape — is a different and stronger
 * assertion and lives in `OllamaProviderEnvCoordinates.spec.mjs`. Read a green here as "the leaf is
 * not entirely unreachable", never as "the deployment is wired correctly".
 *
 * **This guard is deliberately narrow.** The broader rule — *every declared leaf must reach
 * Compose* — is **false by design** and was measured to be false before this spec was written:
 * 8 of 14 `NEO_OPENAI_COMPATIBLE_*` leaves are legitimately absent from the profile, because most
 * leaves are tunables whose defaults are authoritative and which no deployment needs to override.
 * Loopback defaults are the subset where the default cannot be authoritative in a container.
 */

const
    repoRoot    = path.resolve(process.cwd()),
    configText  = fs.readFileSync(path.join(repoRoot, 'ai/configBase.mjs'), 'utf8'),
    composePath = path.join(repoRoot, 'ai/deploy/docker-compose.yml'),
    composeDoc  = yamlLoad(fs.readFileSync(composePath, 'utf8')),
    // A leaf default that is a bare loopback host or a loopback URL, with its env binding.
    LOOPBACK_LEAF = /leaf\(\s*'(?:https?:\/\/)?(?:127\.0\.0\.1|localhost|\[::1\])[^']*'\s*,\s*'([A-Z][A-Z0-9_]*)'/g;

/**
 * @summary Env names exempt from the reachability rule, each with the reason it is exempt.
 *
 * An exemption is a claim and it is written down rather than filtered silently — a regex that
 * quietly drops a name is how this class of defect survives its own guard.
 */
const EXEMPT = {
    NEO_CHROMA_HOST_TEST: 'test-harness twin; never rendered into a deployment profile',
    HOST                : 'transport bind host, not a dial target — binding to loopback inside the ' +
                          'container is the intended posture; the listener override is NEO_MCP_LISTEN_HOST'
};

function declaredLoopbackEnvNames() {
    return [...configText.matchAll(LOOPBACK_LEAF)].map(match => match[1]);
}

function composeEnvNames() {
    const names = new Set();

    for (const service of Object.values(composeDoc.services || {})) {
        for (const entry of service.environment || []) {
            // Compose list form is `NAME=value`; the mapping form would be a plain object key.
            const name = typeof entry === 'string' ? entry.split('=')[0] : entry;
            names.add(name)
        }
    }

    return names
}

test.describe('Loopback-default leaves are reachable through the deployment', () => {
    test('every loopback-default leaf is overridable in the canonical Compose profile', () => {
        const
            declared    = declaredLoopbackEnvNames(),
            inCompose   = composeEnvNames(),
            unreachable = declared
                .filter(name => !Object.hasOwn(EXEMPT, name))
                .filter(name => !inCompose.has(name))
                .sort();

        expect(unreachable, `loopback-default leaves with no Compose override: ${unreachable.join(', ')}`)
            .toEqual([]);
    });

    test('NON-VACUITY — the scan actually finds loopback leaves, and finds the known ones', () => {
        // Without this, a regex that matches nothing makes the guard above pass forever. The named
        // members are the positive controls: they carry loopback defaults AND already reach Compose,
        // so they prove the rule is satisfiable rather than merely unviolated.
        const declared = declaredLoopbackEnvNames();

        expect(declared.length).toBeGreaterThanOrEqual(4);
        expect(declared).toContain('NEO_CHROMA_HOST');
        expect(declared).toContain('NEO_OPENAI_COMPATIBLE_HOST');
        expect(declared).toContain('NEO_OLLAMA_HOST');
    });

    test('NON-VACUITY — the Compose reader actually reads env, and sees a known-present name', () => {
        // Guards the other half: an env parser returning an empty set would make every name look
        // unreachable, which fails loud — but a parser returning a name-shaped garbage set would
        // make every name look reachable, which fails silent. Assert a known member is present.
        const inCompose = composeEnvNames();

        expect(inCompose.size).toBeGreaterThan(20);
        expect(inCompose.has('NEO_CHROMA_HOST')).toBe(true);
        expect(inCompose.has('NEO_TRANSPORT')).toBe(true);
    });

    test('every exemption names a reason', () => {
        // An exemption list is where a guard goes to die quietly. A bare name is not an exemption,
        // it is an unexplained hole; requiring prose makes adding one a decision someone reviews.
        for (const [name, reason] of Object.entries(EXEMPT)) {
            expect(typeof reason, `${name} exemption must state a reason`).toBe('string');
            expect(reason.length, `${name} exemption reason is too thin to review`).toBeGreaterThan(30)
        }
    });
});
