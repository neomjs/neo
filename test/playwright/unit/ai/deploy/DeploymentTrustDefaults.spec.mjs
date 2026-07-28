import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs';
import path               from 'node:path';
import process            from 'node:process';
import {load as yamlLoad} from 'js-yaml';

/**
 * Guards the trust defaults the deploy template imposes on every installation that follows our guide.
 *
 * The failure this exists to prevent, observed on a real deployment: this template pinned
 * `NEO_MAILBOX_DEFAULT_REPLY_POLICY=blocked`, overriding the library default of `open`. Members of a
 * single organisation's private deployment therefore could not message each other at all — every pair
 * needed an explicit `CAN_REPLY_TO` grant first. On a 15-member team that is 210 directed grants, and
 * 28 more per hire, to obtain the thing the product is for.
 *
 * WHY a spec rather than a comment in the compose file. A restrictive default reads as prudent at the
 * point someone writes it, produces no error, breaks no test, and fails only as an absence: people
 * simply cannot reach each other, on someone else's deployment, weeks later. Nothing about the line
 * looks wrong — which is exactly the property that let it ship and survive.
 *
 * The coherence assertion is the load-bearing one. `mailbox.defaultReplyPolicy` and
 * `memorySharing.defaultPolicy` describe the SAME question — is this deployment one trust boundary or
 * several — and the shipped template answered it two different ways: mail locked down to multi-tenant
 * strictness while memories stayed deployment-wide readable. So every member could read every other
 * member's stored reasoning but not send them a message, which is the more sensitive permission
 * granted alongside the less sensitive one refused. Pinning either alone is how that happens, so the
 * guard binds them together rather than banning one value.
 */

const
    root        = process.cwd(),
    composePath = path.join(root, 'ai/deploy/docker-compose.yml'),
    MAILBOX_KEY = 'NEO_MAILBOX_DEFAULT_REPLY_POLICY',
    SHARING_KEY = 'NEO_MEMORY_SHARING_DEFAULT_POLICY';

/**
 * @summary Collects `KEY=value` environment entries across every service in the compose file.
 * @returns {Map<String, String[]>} Key → every value assigned to it, across all services.
 */
function collectEnvAssignments() {
    const
        compose  = yamlLoad(fs.readFileSync(composePath, 'utf8')),
        assigned = new Map();

    for (const service of Object.values(compose.services || {})) {
        // Compose permits both the list form (`- KEY=value`) and the map form (`KEY: value`).
        const entries = Array.isArray(service?.environment)
            ? service.environment.map(item => String(item))
            : Object.entries(service?.environment || {}).map(([key, value]) => `${key}=${value}`);

        for (const entry of entries) {
            const index = entry.indexOf('=');

            if (index < 1) continue;

            const key = entry.slice(0, index);

            if (!assigned.has(key)) assigned.set(key, []);
            assigned.get(key).push(entry.slice(index + 1));
        }
    }

    return assigned
}

test.describe('deploy template — trust defaults (#16054)', () => {

    test('the parser actually sees the environment blocks', () => {
        // The positive control, and it is not ceremony: every assertion below is an ABSENCE check, and
        // an absence check over an empty map passes for the wrong reason. A renamed service key or a
        // switch to the map form would silently turn this whole file green.
        const assigned = collectEnvAssignments();

        expect(assigned.size, 'no environment entries parsed — the guard is looking at nothing').toBeGreaterThan(20);
        expect([...assigned.keys()].filter(key => key.startsWith('NEO_')).length).toBeGreaterThan(15);
    });

    test('the template does not lock members out of messaging each other', () => {
        const values = collectEnvAssignments().get(MAILBOX_KEY) || [];

        expect(
            values.filter(value => value === 'blocked'),
            `${MAILBOX_KEY}=blocked in the deploy template forces every pair of members on a private ` +
            'deployment to exchange CAN_REPLY_TO grants before they can talk. A deployment is a trust ' +
            'boundary; peer-trust is the default and `blocked` belongs only to a genuine multi-tenant ' +
            `install, which must also pin ${SHARING_KEY}=private.`
        ).toEqual([]);
    });

    test('mail strictness and memory strictness are pinned together or not at all', () => {
        const
            assigned      = collectEnvAssignments(),
            mailStrict    = (assigned.get(MAILBOX_KEY) || []).includes('blocked'),
            sharingStrict = (assigned.get(SHARING_KEY)  || []).includes('private');

        // Not "never pin them" — a real multi-tenant template SHOULD pin both. The defect is answering
        // one trust question two ways, which is what shipped: mail at multi-tenant strictness while
        // memories stayed deployment-wide readable.
        expect(
            mailStrict,
            `${MAILBOX_KEY}=blocked without ${SHARING_KEY}=private: members cannot message each other ` +
            'while still reading each other\'s memories — the more sensitive permission granted ' +
            'alongside the less sensitive one refused.'
        ).toBe(sharingStrict)
    })
});
