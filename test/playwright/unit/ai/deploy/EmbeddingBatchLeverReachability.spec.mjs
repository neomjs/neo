import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs';
import path               from 'node:path';
import process            from 'node:process';
import {load as yamlLoad} from 'js-yaml';

/**
 * @summary The embedding-batch levers reach every service that consumes them, in every profile that BOOTS.
 *
 * `batchSize` is the durable unit: a whole slice embeds in one provider call and upserts only after
 * it returns. An operator whose corpus will not start has to shrink that bet until one batch lands —
 * so these three leaves are the recovery path, and a profile that does not carry them offers an
 * operator a knob that does not exist.
 *
 * **The trap this spec exists to close, and it is a measurement trap rather than a coding one.**
 * `docker-compose.dev.yml` is a **standalone** parity stack, not an overlay on the base profile: the
 * composition that actually runs is that file plus the parity-CI overlay. Rendering base **and** dev
 * together therefore resolves the leaves from base and reports green for a profile that carries none
 * of them. **The wrong command manufactures confirming evidence** — which is exactly how the first
 * version of this change passed review with `null/null/null` on the profile under test.
 *
 * So the unit here is a `(profile, service, leaf)` coordinate, each profile parsed **alone**, and the
 * value must be an interpolation of its **own** variable rather than merely present.
 */

const
    repoRoot  = path.resolve(process.cwd()),
    deployDir = path.join(repoRoot, 'ai/deploy'),
    LEAVES    = ['NEO_KB_EMBEDDING_BATCH_SIZE', 'NEO_KB_EMBEDDING_BATCH_DELAY_MS', 'NEO_KB_EMBEDDING_MAX_RETRIES'],
    /**
     * Profiles an operator boots on their own, each with the services that read these leaves.
     *
     * `kb-server` runs ingestion; `orchestrator` drives tenant-repo ingestion through the same
     * VectorService path. Overlay-only files (`parity-ci`, `parity-capture`) are deliberately absent:
     * they are merged ONTO a standalone profile and are not a deployment on their own, so requiring
     * the leaves there would assert a contract nothing boots.
     */
    STANDALONE = [
        {file: 'docker-compose.yml',     services: ['kb-server', 'orchestrator'], why: 'the canonical production profile'},
        {file: 'docker-compose.dev.yml', services: ['kb-server', 'orchestrator'], why: 'the parity stack, booted standalone plus the parity-CI overlay — it inherits nothing from the base profile'}
    ];

function loadProfile(file) {
    return yamlLoad(fs.readFileSync(path.join(deployDir, file), 'utf8'))
}

/**
 * @summary Reads one service's `environment:` as a name -> value map, in either compose form.
 *
 * The base profile uses the list form (`- NAME=value`) and the parity profile the mapping form
 * (`NAME: value`). A reader that handled only one would report the other as carrying nothing.
 * @param {Object} doc Parsed compose document.
 * @param {String} service Service key.
 * @returns {Map<String, String>}
 */
function serviceEnv(doc, service) {
    const
        entries = doc?.services?.[service]?.environment || [],
        map     = new Map();

    if (Array.isArray(entries)) {
        for (const entry of entries) {
            const
                text  = String(entry),
                index = text.indexOf('=');

            index === -1 ? map.set(text, null) : map.set(text.slice(0, index), text.slice(index + 1))
        }
    } else {
        for (const [name, value] of Object.entries(entries)) {
            map.set(name, value === null ? null : String(value))
        }
    }

    return map
}

/**
 * @summary True when the value hands the decision to the operator through its OWN variable.
 * @param {String} name Env name.
 * @param {String|null} value Compose-side value.
 * @returns {Boolean}
 */
function isOperatorOverridable(name, value) {
    return typeof value === 'string' && new RegExp(`^\\$\\{${name}(?:[:-][^}]*)?\\}$`).test(value.trim())
}

/**
 * @summary The contract as a pure function of already-parsed profiles, so mutants can be fed to it.
 * @param {Object[]} profiles `{file, doc, services}` entries.
 * @returns {Object[]} Violations.
 */
function reachabilityViolations(profiles) {
    const violations = [];

    for (const {file, doc, services} of profiles) {
        for (const service of services) {
            const env = serviceEnv(doc, service);

            for (const leaf of LEAVES) {
                if (!env.has(leaf)) {
                    violations.push({file, service, leaf, kind: 'missing'});
                    continue
                }

                if (!isOperatorOverridable(leaf, env.get(leaf))) {
                    violations.push({file, service, leaf, kind: 'not-overridable'})
                }
            }
        }
    }

    return violations
}

function realProfiles() {
    return STANDALONE.map(entry => ({...entry, doc: loadProfile(entry.file)}))
}

test.describe('embedding-batch levers reach every booting profile', () => {
    test('every standalone profile carries all three leaves on every consuming service', () => {
        const violations = reachabilityViolations(realProfiles());

        expect(violations.map(v => `${v.file} :: ${v.service} :: ${v.leaf} :: ${v.kind}`)).toEqual([])
    });

    test('MUTATION — a profile that carries none of them is caught, per profile', () => {
        // The exact review finding: base and local rendered the leaves while standalone dev returned
        // null/null/null, and a base+dev composition hid it. Each profile is asserted alone.
        const profiles = realProfiles();

        profiles.find(p => p.file === 'docker-compose.dev.yml').doc.services['kb-server'].environment = {
            NEO_TRANSPORT: 'streamable-http'
        };

        const violations = reachabilityViolations(profiles).filter(v => v.kind === 'missing');

        expect(violations.map(v => v.leaf).sort()).toEqual([...LEAVES].sort());
        expect(violations.every(v => v.file === 'docker-compose.dev.yml' && v.service === 'kb-server')).toBe(true);
        // ...and the real tree is still clean, so the mutant proved the checker rather than the tree.
        expect(reachabilityViolations(realProfiles())).toEqual([])
    });

    test('MUTATION — a hardcoded value is caught, because presence is not reachability', () => {
        const profiles = realProfiles();

        profiles.find(p => p.file === 'docker-compose.yml').doc.services['kb-server'].environment = [
            'NEO_KB_EMBEDDING_BATCH_SIZE=50',
            'NEO_KB_EMBEDDING_BATCH_DELAY_MS=${NEO_KB_EMBEDDING_BATCH_DELAY_MS:-}',
            'NEO_KB_EMBEDDING_MAX_RETRIES=${NEO_KB_EMBEDDING_MAX_RETRIES:-}'
        ];

        expect(reachabilityViolations(profiles).some(v =>
            v.kind === 'not-overridable' && v.leaf === 'NEO_KB_EMBEDDING_BATCH_SIZE')).toBe(true)
    });

    test('MUTATION — interpolating a DIFFERENT variable is caught', () => {
        // `${SOMETHING_ELSE:-}` is interpolation-shaped, so a "does it contain ${" check passes while
        // the documented variable does nothing at all.
        const profiles = realProfiles();

        profiles.find(p => p.file === 'docker-compose.dev.yml').doc.services['orchestrator']
            .environment['NEO_KB_EMBEDDING_BATCH_SIZE'] = '${NEO_CHROMA_HOST:-}';

        expect(reachabilityViolations(profiles).some(v =>
            v.kind === 'not-overridable' && v.file === 'docker-compose.dev.yml')).toBe(true)
    });

    test('NON-VACUITY — both compose forms are actually read, and the value check discriminates', () => {
        // The base profile is list form and the parity profile is mapping form. A reader handling one
        // shape would report the other as empty, and an empty map makes every assertion above vacuous.
        const baseEnv   = serviceEnv(loadProfile('docker-compose.yml'), 'kb-server'),
              parityEnv = serviceEnv(loadProfile('docker-compose.dev.yml'), 'kb-server');

        expect(baseEnv.size).toBeGreaterThan(5);
        expect(parityEnv.size).toBeGreaterThan(5);
        expect(baseEnv.get('NEO_KB_EMBEDDING_BATCH_SIZE')).toBe('${NEO_KB_EMBEDDING_BATCH_SIZE:-}');
        expect(parityEnv.get('NEO_KB_EMBEDDING_BATCH_SIZE')).toBe('${NEO_KB_EMBEDDING_BATCH_SIZE:-}');

        expect(isOperatorOverridable('NEO_KB_EMBEDDING_BATCH_SIZE', '${NEO_KB_EMBEDDING_BATCH_SIZE:-}')).toBe(true);
        expect(isOperatorOverridable('NEO_KB_EMBEDDING_BATCH_SIZE', '50')).toBe(false)
    });

    test('every standalone profile states why it is in the list', () => {
        // An unexplained entry is where a profile list goes stale — overlays and standalone profiles
        // are not distinguishable by filename, and getting that wrong is what this spec exists for.
        for (const entry of STANDALONE) {
            expect(entry.why.length, `${entry.file} needs a reviewable reason`).toBeGreaterThan(25)
        }
    })
});
