import fs   from 'node:fs';
import path from 'node:path';

/**
 * @summary Resolves a tenant-declared parser specifier to a module path below a deployment-pinned
 * root, and loads the class — the one place the containment property is stated.
 *
 * ## Why a loader exists at all
 *
 * `IngestionService.getTenantConfig` resolves a tenant's profile through three tiers — the
 * `KnowledgeBaseTenantConfig` graph node, the `kb-config.yaml` bootstrap, then `aiConfig`. Two of
 * those are DATA tiers: they hold JSON and YAML scalars. `SourceRegistry` entries are live class
 * references (`{ParserClass, parserId}`), so a parser declared in a data tier was previously inert by
 * construction — unreachable rather than misconfigured. This module is the missing edge: a string a
 * data tier CAN hold, resolved to a class the registry can dispatch.
 *
 * ## The containment property, and why it is the whole design
 *
 * A data tier naming a module to `import()` is an **execution-selection surface**: whoever writes the
 * config chooses code the server process runs. Tenant configuration is not deployment configuration,
 * so the rule is one sentence — **the root is deployment-authored, the specifier is not.** A tenant
 * names a module BELOW a pinned root and can never name the root, escape it, or reach a bare
 * dependency by specifier.
 *
 * Consequences, each enforced below rather than documented:
 *
 * - **An unset root disables the feature.** There is no default path. A missing root is not "fall back
 *   to the repo" — it refuses, because a hidden default here would be a default *execution root*.
 * - **Absolute specifiers refuse.** They name a root, which is not the tenant's to name.
 * - **Bare specifiers refuse.** `acorn` is not a tenant's parser; allowing bare names would hand the
 *   tenant the server's whole dependency tree as a menu.
 * - **Escapes refuse after resolution, not before.** A `..` scan is a lexical test of a structural
 *   property; `path.resolve` then a prefix check is the structural one. Both `../x` and
 *   `a/../../x` are caught by the same predicate.
 * - **Symlinks are resolved before the check.** A link inside the root pointing outside it would
 *   otherwise pass a textual prefix test. The mounted tree is operator-authored, so this is defence
 *   in depth rather than the primary boundary — but it costs one `realpathSync` and closes a hole
 *   that would be invisible in a code review of the config.
 *
 * ## Deployment note that is not cosmetic
 *
 * The pinned root must sit **under the application root** (`/app` in the container image). Node
 * resolves a bare specifier by walking `node_modules` up from the *importing module's* directory, so
 * a parser at `/app/kb-parsers` can `import * as acorn` while the same file at `/mnt/parsers` cannot
 * — it would resolve in a dev checkout and fail in the container, which is the worst possible place
 * for that difference to appear. Measured by @neo-opus-vega against the real mount.
 *
 * @module Neo.ai.services.knowledge-base.source.tenantParserLoader
 */

/**
 * @summary Error codes this module raises. Distinct from `KB_PARSER_NOT_REGISTERED`, deliberately.
 *
 * That code means *"a parser id was declared and the registry has no such entry"* — a coverage
 * question. These mean *"a parser was declared and could not be loaded"* — a configuration defect.
 * Collapsing them would let a broken deployment read as an inventory gap, and a missing parser
 * degrades to `raw-text`, which **ingests successfully**: whole-file chunks, no error, retrieval
 * quietly worse. There is not even a suspicious number to notice, so the codes have to carry it.
 * @type {Object<String,String>}
 */
export const TENANT_PARSER_ERROR_CODES = Object.freeze({
    escapesRoot    : 'KB_TENANT_PARSER_SPECIFIER_ESCAPES_ROOT',
    loadFailed     : 'KB_TENANT_PARSER_LOAD_FAILED',
    noExport       : 'KB_TENANT_PARSER_NO_CLASS_EXPORT',
    notDispatchable: 'KB_TENANT_PARSER_NOT_DISPATCHABLE',
    notFound       : 'KB_TENANT_PARSER_NOT_FOUND',
    rootNotSet     : 'KB_TENANT_PARSER_ROOT_NOT_SET',
    unsafeShape    : 'KB_TENANT_PARSER_SPECIFIER_UNSAFE'
});

/**
 * @summary Builds a named, coded error so every refusal names its own remediation.
 * @param {String} code One of {@link TENANT_PARSER_ERROR_CODES}.
 * @param {String} message
 * @returns {Error}
 * @private
 */
function refuse(code, message) {
    const error = new Error(message);

    error.code = code;

    return error
}

/**
 * @summary Resolves a tenant-declared specifier to an absolute path below the pinned root.
 *
 * Pure apart from the filesystem reads it needs to be correct (`existsSync`, `realpathSync`) — split
 * from {@link loadTenantParser} so the containment predicate is testable without importing anything,
 * which matters because the interesting cases are the refusals.
 *
 * @param {Object}   options
 * @param {String}   options.specifier      Tenant-declared module name, relative to the root.
 * @param {String}   options.root           Deployment-pinned absolute root. Empty disables the feature.
 * @param {Function} [options.existsSync]   Injectable for tests.
 * @param {Function} [options.realpathSync] Injectable for tests.
 * @returns {String} Absolute, symlink-resolved path below the root.
 * @throws {Error} Coded per {@link TENANT_PARSER_ERROR_CODES}.
 */
export function resolveTenantParserPath({
    specifier,
    root,
    existsSync   = fs.existsSync,
    realpathSync = fs.realpathSync
} = {}) {
    const pinnedRoot = typeof root === 'string' ? root.trim() : '';

    if (!pinnedRoot) {
        throw refuse(
            TENANT_PARSER_ERROR_CODES.rootNotSet,
            'tenant parser loading is disabled: no parser root is pinned by the deployment. ' +
            'Set `NEO_KB_TENANT_PARSER_ROOT` to an absolute path under the application root ' +
            '(e.g. /app/kb-parsers) and mount the directory read-only. There is deliberately no default.'
        )
    }

    if (typeof specifier !== 'string' || !specifier.trim()) {
        throw refuse(
            TENANT_PARSER_ERROR_CODES.unsafeShape,
            'tenant parser specifier must be a non-empty string naming a module below the pinned root.'
        )
    }

    const declared = specifier.trim();

    if (path.isAbsolute(declared)) {
        throw refuse(
            TENANT_PARSER_ERROR_CODES.unsafeShape,
            `tenant parser specifier '${declared}' is absolute. A tenant names a module BELOW the ` +
            'deployment-pinned root and never names a root itself.'
        )
    }

    // NOTE — no bare-specifier guard, deliberately, and the absence is the safer design.
    //
    // A first draft rejected "bare-looking" names to stop a tenant naming `acorn` and reaching the
    // server's dependency tree. That guard was both WRONG and unnecessary. Wrong: `acorn` and
    // `MyParser.mjs` are textually alike, so any pattern separating them mis-sorts one — the draft's
    // predicate passed `acorn` through while claiming to block it. Unnecessary: a bare specifier can
    // only reach `node_modules` if it is handed to `import()` AS a specifier, and it never is. It goes
    // through `path.resolve(absoluteRoot, declared)` first, which does not consult `node_modules`, and
    // `loadTenantParser` imports the resulting ABSOLUTE path. So `acorn` resolves to
    // `<root>/acorn` and fails the existence check as a missing file.
    //
    // Containment therefore rests on two mechanisms and no pattern-matching: resolve against the
    // pinned root, then verify the result is still under it. A guard that duplicates a structural
    // property in a weaker form is worse than no guard — it reads as the protection.

    const absoluteRoot = path.resolve(pinnedRoot),
          candidate    = path.resolve(absoluteRoot, declared);

    // Resolution, not a `..` scan: a lexical test cannot answer a structural question. `a/../../x`
    // and `../x` differ textually and are the same violation.
    const withinRoot = target => target === absoluteRoot || target.startsWith(absoluteRoot + path.sep);

    if (!withinRoot(candidate)) {
        throw refuse(
            TENANT_PARSER_ERROR_CODES.escapesRoot,
            `tenant parser specifier '${declared}' resolves to '${candidate}', outside the pinned ` +
            `root '${absoluteRoot}'. Refused.`
        )
    }

    if (!existsSync(candidate)) {
        throw refuse(
            TENANT_PARSER_ERROR_CODES.notFound,
            `tenant parser '${declared}' does not exist at '${candidate}'. The declaration names a ` +
            'module the deployment did not mount — fix the declaration or the mount. This is a ' +
            'configuration defect, NOT a parser-coverage gap: without it the file would fall through ' +
            'to `raw-text` and ingest successfully as one whole-file chunk, reporting nothing.'
        )
    }

    // A symlink inside the root pointing outside it passes a textual prefix check. Re-check after
    // resolving links so the boundary holds on the real path rather than the written one.
    const realCandidate = realpathSync(candidate),
          realRoot      = realpathSync(absoluteRoot);

    if (!(realCandidate === realRoot || realCandidate.startsWith(realRoot + path.sep))) {
        throw refuse(
            TENANT_PARSER_ERROR_CODES.escapesRoot,
            `tenant parser specifier '${declared}' resolves through a symlink to '${realCandidate}', ` +
            `outside the pinned root '${realRoot}'. Refused.`
        )
    }

    return realCandidate
}

/**
 * @summary Loads the parser class a tenant declared, or throws with a named reason.
 *
 * @param {Object}   options
 * @param {String}   options.specifier          Tenant-declared module name, relative to the root.
 * @param {String}   options.root               Deployment-pinned absolute root.
 * @param {String}   [options.exportName]       Named export to take; default export otherwise.
 * @param {Function} [options.importModule]     Injectable importer for tests.
 * @param {Function} [options.resolvePath]      Injectable resolver for tests.
 * @returns {Promise<Object>} The parser class.
 * @throws {Error} Coded per {@link TENANT_PARSER_ERROR_CODES}.
 */
export async function loadTenantParser({
    specifier,
    root,
    exportName,
    importModule = target => import(target),
    resolvePath  = resolveTenantParserPath
} = {}) {
    const absolutePath = resolvePath({specifier, root});

    let module;

    try {
        module = await importModule(absolutePath)
    } catch (error) {
        throw refuse(
            TENANT_PARSER_ERROR_CODES.loadFailed,
            `tenant parser '${specifier}' failed to load from '${absolutePath}': ${error.message}`
        )
    }

    const ParserClass = exportName ? module?.[exportName] : (module?.default ?? module?.Parser);

    if (!ParserClass) {
        throw refuse(
            TENANT_PARSER_ERROR_CODES.noExport,
            `tenant parser '${specifier}' loaded from '${absolutePath}' but exposes no ` +
            `${exportName ? `\`${exportName}\` export` : 'default export'}. A parser module must ` +
            'export its class.'
        )
    }

    assertDispatchableParser(ParserClass, `tenant parser '${specifier}' loaded from '${absolutePath}'`);

    return ParserClass
}

/**
 * @summary Refuses a resolved parser value that nothing can dispatch on.
 *
 * **The property is "callable on the value that gets dispatched", not "static".** `resolveFileChunks`
 * reads `parseIngestionFile` / `parse` off the resolved value directly, and three shapes satisfy
 * that: a constructor carrying static methods, an object literal, and — the repository's own idiom
 * for registry-registered classes — a `Neo.setupClass` singleton, whose export IS an instance and
 * whose prototype methods are therefore reachable on it. Only a plain constructor whose methods live
 * on `prototype` fails, because the constructor is never instantiated.
 *
 * That case is truthy with both probes reading `undefined`, so the `KB_PARSER_NOT_REGISTERED` throw
 * is skipped and the file degrades to a whole-file `raw-text` chunk, which INGESTS SUCCESSFULLY.
 * Refusing keeps it inside the coded taxonomy instead of the one silent path it left open.
 *
 * Exported because a tenant can declare a parser two ways — a `parserModule` this loader imports, or
 * a live `ParserClass` reference in the JS-config tier — and both converge on one consumer. Guarding
 * only the branch this module owns leaves the other one degrading exactly as before.
 *
 * @param {*} parser The resolved parser value.
 * @param {String} subject How to name the parser in the refusal, e.g. `tenant parser 'X.mjs'`.
 * @returns {*} The parser, when it is dispatchable.
 * @throws {Error} Coded `TENANT_PARSER_ERROR_CODES.notDispatchable`.
 */
export function assertDispatchableParser(parser, subject) {
    if (typeof parser?.parseIngestionFile === 'function' || typeof parser?.parse === 'function') {
        return parser
    }

    const
        prototype   = parser?.prototype,
        onPrototype = typeof prototype?.parseIngestionFile === 'function' ||
                      typeof prototype?.parse             === 'function';

    throw refuse(
        TENANT_PARSER_ERROR_CODES.notDispatchable,
        `${subject} but exposes no callable \`parseIngestionFile\` or \`parse\`. ` +
        (onPrototype
            // The whole defect, and it is invisible from the symptom: the method IS present.
            ? 'The methods are declared on the prototype, and the value that gets dispatched is the ' +
              'constructor itself — it is never instantiated, so they are unreachable. Declare them ' +
              '`static`, export a singleton instance (`Neo.setupClass` with `singleton: true`), or ' +
              'export an object literal.'
            : 'Declare `parseIngestionFile(file, {tenantContext})` on the exported value — as a ' +
              '`static` method, on a singleton instance, or on an object literal.')
    )
}
