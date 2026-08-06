import fs from 'fs-extra';

/**
 * @summary Fail-closed load of the class-hierarchy map, which is an IDENTITY input rather than an
 * enrichment.
 *
 * Lives in its own module so the contract is unit-testable in isolation — importing it does NOT
 * construct the `ApiSource` singleton and does NOT read the shared `AiConfig`. The caller injects
 * `hierarchyPath`, so a spec points at a temporary file and never touches a config leaf. That is
 * strictly the cheaper shape: `QueryService.classHierarchy.spec.mjs` has to assign
 * `aiConfig.hierarchyPath` and restore it in `afterEach`, which makes those tests order-dependent
 * and leaks config state on an early failure. Injection removes the need rather than tightening
 * the cleanup.
 *
 * ## Why this refuses instead of degrading
 *
 * `extends` is hashed into every Knowledge Base chunk id (`KB_DatabaseService.createContentHash`),
 * so an absent hierarchy does not leave metadata merely incomplete — it re-identifies every class
 * member that the map covers. A stale-deletion pass then reads the previously-ingested corpus as
 * orphaned, because none of its ids are reproducible from current inputs.
 *
 * That is a recorded incident rather than a hypothetical: `docs/output/class-hierarchy.json`
 * was a gitignored build output, so it was absent on the container plane after kbSync moved there.
 * The load degraded to `{}` behind a `console.warn` that nothing consumed, and `extends` ingested
 * empty for **0 of 5,255** `src` chunks against **4,741 of 4,917** in the last good corpus — while
 * the ingest reported success. The file is tracked in git now, which is what makes absence a
 * genuine checkout or plane fault rather than an expected first-run state.
 *
 * @param {Object} options
 * @param {String} options.hierarchyPath Absolute path to the generated `class-hierarchy.json`.
 * @param {Number} options.sourcePathCount How many source trees the caller is about to index. Zero
 *     is a legitimate empty state (nothing to identify), so an empty map is tolerated only then.
 * @returns {Promise<Object>} The parsed `className -> superClassName` map.
 * @throws {Error} `CLASS_HIERARCHY_UNREADABLE` when the file is missing or malformed — `readJson`
 *     rejects on both, so one path covers both.
 * @throws {Error} `CLASS_HIERARCHY_EMPTY` when the map parsed to zero entries while there is source
 *     to index. Readable-but-empty reproduces the identity defect without the read failing, which is
 *     the quieter half of the same bug.
 */
export async function loadClassHierarchy({hierarchyPath, sourcePathCount}) {
    let hierarchy;

    try {
        hierarchy = await fs.readJson(hierarchyPath);
    } catch (cause) {
        const error = new Error(
            `Class hierarchy unreadable at ${hierarchyPath} — refusing to ingest. 'extends' is hashed ` +
            `into every chunk id, so ingesting without it silently re-identifies every class member ` +
            `and marks the existing corpus stale. The file is tracked in git; if it is missing, the ` +
            `checkout or the container plane is at fault. Regenerate with ` +
            `\`npm run generate-docs-json\`. Cause: ${cause.message}`
        );

        error.code = 'CLASS_HIERARCHY_UNREADABLE';
        throw error;
    }

    // A JSON file can legitimately parse to a non-object (`[]`, `null`, `42`), and each would sail
    // through an `Object.keys()` length check as "empty" or throw further downstream. Reject the
    // shape here so the failure names the artifact rather than surfacing as a parser symptom.
    const isPlainObject = !!hierarchy && typeof hierarchy === 'object' && !Array.isArray(hierarchy),
          entryCount    = isPlainObject ? Object.keys(hierarchy).length : 0;

    if (sourcePathCount > 0 && entryCount < 1) {
        const error = new Error(
            `Class hierarchy at ${hierarchyPath} yielded zero usable entries while ${sourcePathCount} ` +
            `source path(s) are configured for indexing — refusing to ingest. Every chunk would carry ` +
            `an empty 'extends' and take a different id than the corpus it replaces. Regenerate with ` +
            `\`npm run generate-docs-json\`.`
        );

        error.code = 'CLASS_HIERARCHY_EMPTY';
        throw error;
    }

    return isPlainObject ? hierarchy : {}
}

/**
 * @summary Classifies one source module against the hierarchy map, so per-root coverage can be
 * measured during ingestion instead of assumed from a non-empty map.
 *
 * A non-empty hierarchy proves the artifact loaded; it proves nothing about whether the artifact's
 * DOMAIN covers the roots being indexed. Those are different claims, and conflating them is what
 * let a whole tree ingest with empty `extends` while every guard passed: the map is produced for
 * the documentation site, and `sourcePaths.ApiSource` indexes roots that producer was never
 * responsible for. Measured on the tracked map — `src` 403/405 and `apps` 336/358 resolve, while
 * `examples` resolves **0 of 259** and `docs/app` 4 of 17.
 *
 * Those gaps are pre-existing and STABLE — the affected classes have carried an empty `extends` in
 * every corpus built so far, so their ids do not move. That is why this reports rather than
 * refuses: refusing on an absolute gap would block all ingestion and make the degraded corpus
 * unrebuildable, while the hazard that actually caused the incident is a *regression* in a root
 * that previously resolved. Making the number visible on every ingest is what turns the next
 * regression into a loud one.
 *
 * @param {Object} options
 * @param {String} options.source Raw module text.
 * @param {Object} options.hierarchy The loaded `className -> superClassName` map.
 * @returns {Object|null} `{className, resolved}` for a module that declares BOTH a `className` and
 *     an `extends` clause; `null` for anything else, which is not a coverage data point either way.
 */
export function classifyHierarchyCoverage({source, hierarchy}) {
    const
        classNameMatch = source.match(/className\s*:\s*'([^']+)'/),
        extendsMatch   = source.match(/^\s*class\s+\w+\s+extends\s+[\w.]+/m);

    // A module without both is not evidence of a gap: a non-class module has no superclass to
    // resolve, and a class with no `extends` clause is legitimately unresolved.
    if (!classNameMatch || !extendsMatch) {
        return null;
    }

    const className = classNameMatch[1];

    return {className, resolved: !!hierarchy[className]}
}
