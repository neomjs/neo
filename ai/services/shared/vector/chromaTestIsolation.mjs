/**
 * @summary Stateless helpers for ephemeral ChromaDB database isolation under `UNIT_TEST_MODE`.
 *
 * ## Why this exists
 *
 * Under `UNIT_TEST_MODE` the Memory Core names its Chroma collections `test-memory-*` /
 * `test-session-*` (`config.template.mjs`), but historically they still landed in the SAME
 * `default_tenant`/`default_database` as production. Interrupted runs (`Ctrl-C`, CI-cancel,
 * bare-`npx` bypasses) skip `afterAll` teardown, so orphan collections accumulate in the prod
 * namespace (the 1,281-orphan backlog `purgeTestCollections.mjs` reclaims).
 *
 * This module is the *prevention* half of that isolation: it routes the unit-test
 * Chroma client to a dedicated, droppable test DATABASE so test collections never enter the prod
 * namespace by construction — the chroma analogue of the graph store's `:memory:` isolation.
 * chromadb 3.x exposes no `getOrCreateDatabase`, and database management lives on a separate
 * `AdminClient`, so the test database must be ensured-to-exist before the first collection op and
 * is droppable wholesale.
 *
 * Stateless functions (not a Neo class), matching the `chromaClientPrimitives.mjs` sibling idiom:
 * the chromadb `AdminClient` is lazy-imported and injectable, so this module is cheap to import
 * (config reads only the constants) and the helpers are unit-testable with a fake admin client.
 *
 * @module ai/services/shared/vector/chromaTestIsolation
 * @see ai/services/shared/vector/chromaClientPrimitives.mjs  Sibling: connection-lifecycle helpers
 */

/**
 * The dedicated ChromaDB database used under `UNIT_TEST_MODE`. Stable (not per-run) so the whole
 * namespace is droppable wholesale and a crashed run leaks — at worst — into THIS database, never
 * `default_database`. Single source of truth consumed by `config.template.mjs` (the active
 * `engines.chroma.database` leaf default under `UNIT_TEST_MODE`) and `purgeTestCollections.mjs`
 * (the wholesale-drop target).
 * @type {String}
 */
export const CHROMA_TEST_DATABASE = 'neo-unit-test';

/**
 * The chromadb production database name. Explicitly named so the prod config branch is verbatim
 * (not an implicit client default) and so {@link dropChromaTestDatabase} can refuse to touch it.
 * @type {String}
 */
export const CHROMA_PRODUCTION_DATABASE = 'default_database';

/**
 * The chromadb default tenant. The isolation is at the database grain; the tenant stays default.
 * @type {String}
 */
export const CHROMA_DEFAULT_TENANT = 'default_tenant';

/**
 * @summary Lazily constructs a chromadb `AdminClient`. Database/tenant management lives off the
 * `ChromaClient`, so callers that only need collection ops never pay for this import. The lazy
 * import is also what keeps this module cheap for `config.template.mjs` to import (constants only).
 * @param {Object} options
 * @param {String} options.host
 * @param {Number} options.port
 * @param {Boolean} [options.ssl=false]
 * @returns {Promise<Object>} A chromadb `AdminClient` instance.
 */
async function createAdminClient({host, port, ssl = false}) {
    const {AdminClient} = await import('chromadb');
    return new AdminClient({host, port, ssl})
}

/**
 * @summary Detects Chroma's "already exists" response for concurrent createDatabase calls.
 *
 * Fully parallel unit workers can all race through `getDatabase` before any one creates the
 * stable test database. The first create wins; the rest receive `ChromaUniqueError`. That is a
 * successful ensure outcome, not a boot failure.
 * @param {Error} error
 * @returns {Boolean}
 */
export function isChromaAlreadyExistsError(error) {
    return error?.name === 'ChromaUniqueError' || /resource already exists|already exists/i.test(error?.message || '')
}

/**
 * @summary Ensures the unit-test Chroma database exists before the first collection op. chromadb
 * 3.x has no `getOrCreateDatabase`, so this is `getDatabase` → catch → `createDatabase`. Idempotent;
 * safe to call on every connect.
 * @param {Object} options
 * @param {String} options.host
 * @param {Number} options.port
 * @param {Boolean} [options.ssl=false]
 * @param {String} options.database                     The test database name (e.g. {@link CHROMA_TEST_DATABASE}).
 * @param {String} [options.tenant=CHROMA_DEFAULT_TENANT]
 * @param {Object} [options.adminClient]                Injected `AdminClient` seam for unit tests.
 * @returns {Promise<String>} The ensured database name.
 * @throws {Error} When `database` is falsy.
 */
export async function ensureChromaTestDatabase({host, port, ssl = false, database, tenant = CHROMA_DEFAULT_TENANT, adminClient} = {}) {
    if (!database) {
        throw new Error('ensureChromaTestDatabase: `database` is required');
    }

    const admin = adminClient || await createAdminClient({host, port, ssl});

    try {
        await admin.getDatabase({name: database, tenant})
    } catch {
        try {
            await admin.createDatabase({name: database, tenant})
        } catch (error) {
            if (!isChromaAlreadyExistsError(error)) {
                throw error
            }
        }
    }

    return database
}

/**
 * @summary Drops the unit-test Chroma database wholesale — the prevention-era cleanup that
 * supersedes enumerating `test-*` collection names. REFUSES to drop {@link CHROMA_PRODUCTION_DATABASE}
 * (defense-in-depth), so a misconfigured caller can never wipe production.
 * @param {Object} options
 * @param {String} options.host
 * @param {Number} options.port
 * @param {Boolean} [options.ssl=false]
 * @param {String} options.database
 * @param {String} [options.tenant=CHROMA_DEFAULT_TENANT]
 * @param {Object} [options.adminClient]                Injected `AdminClient` seam for unit tests.
 * @returns {Promise<String>} The dropped database name.
 * @throws {Error} When `database` is falsy or is the production database.
 */
export async function dropChromaTestDatabase({host, port, ssl = false, database, tenant = CHROMA_DEFAULT_TENANT, adminClient} = {}) {
    if (!database) {
        throw new Error('dropChromaTestDatabase: `database` is required');
    }

    if (database === CHROMA_PRODUCTION_DATABASE) {
        throw new Error(`dropChromaTestDatabase: refusing to drop the production database "${database}"`);
    }

    const admin = adminClient || await createAdminClient({host, port, ssl});

    await admin.deleteDatabase({name: database, tenant});

    return database
}
