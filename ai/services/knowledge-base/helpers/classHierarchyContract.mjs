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
 * @summary Interim per-root coverage floors — **containment, not a quality target.**
 *
 * These are the ratios the *generator-defined* domain currently reaches. They exist so a REGRESSION
 * fails loudly; they do not endorse the gaps. `examples` at `0` is named debt, never health: 259
 * classes there declare a superclass and none resolves, so their chunks carry an empty `extends` as
 * part of their id. Reading a floor as an acceptance criterion is the exact misreading this docblock
 * exists to prevent.
 *
 * **The measured universe, stated because three different scans of these roots produced three
 * different totals before it was pinned down.** Universe = a runtime filesystem walk of the roots in
 * `aiConfig.sourcePaths.ApiSource`, with class extraction taken from `SourceParser` itself (acorn's
 * `ClassDeclaration.superClass` for the denominator, `static config`-derived `className` for the
 * lookup). Measured 2026-08-06 on that universe:
 *
 * ```
 * src        404/405   99.8%      apps     336/358   93.9%
 * examples     0/259    0.0%      docs/app   4/17    23.5%
 * ai         127/171   74.3%
 * ```
 *
 * Two independent implementations agree on all five roots at those numbers. A **tracked-files-only**
 * universe is a different question and gives a different answer (`ai` becomes 127/165), which is why
 * the scope is named rather than assumed — whether authority covers tracked source, generated
 * overlays, or the exact runtime filesystem is an open fork for the consumer-derived successor.
 *
 * **Why floors rather than counts:** classes are added continuously, so an absolute count would fail
 * on growth. A ratio fails only when resolution genuinely degrades. Each floor sits just below its
 * measured value, so ordinary churn passes and a real drop does not.
 *
 * **Deliberate `ai` floor adjustments (the valve the error message prescribes):** 2026-08-12,
 * 0.74 → 0.73 — the provider-lane runtime proof added two plain script-actor classes (an `Error`
 * subclass and a standalone actor), growing the declared universe to 128/173 = 73.99%. Script
 * actors intentionally do not extend framework bases, so the drop is composition, not degraded
 * resolution. The new floor keeps refusal power at roughly two further unresolved classes of
 * headroom at the current universe size.
 *
 * **Sunset — this constant is designed to be deleted.** When hierarchy derivation moves to the
 * consumer (the source that walks these roots derives its own map, making coverage total by
 * construction), three things retire together: the tracked `docs/output/class-hierarchy.json`, the
 * freshness workflow that guards its staleness, and this baseline. Any of the three outliving that
 * migration is drift.
 *
 * @type {Object}
 */
export const INTERIM_COVERAGE_BASELINE = Object.freeze({
    'src'     : 0.99,
    'apps'    : 0.93,
    'examples': 0,
    'docs/app': 0.23,
    'ai'      : 0.73
});

/**
 * @summary Fails when a root's resolution degrades below its interim floor.
 *
 * The incident this guards is a REGRESSION, not a gap: `src` went from 96.42% populated to 0% when
 * the artifact left the plane, and every check passed. A floor turns that into a refusal.
 *
 * Deliberately NOT failing on the standing gaps — refusing on those would block all ingestion and
 * leave the degraded corpus unrebuildable, which is a worse outcome than a corpus with known,
 * named debt. Closing the gaps is a separate identity migration with its own churn and rollback
 * surface, and it does not belong on a recovery path.
 *
 * @param {Object} options
 * @param {Object} options.coverage Per-root `{declared, resolved}` tallies observed this run.
 * @param {Object} [options.baseline=INTERIM_COVERAGE_BASELINE] Per-root minimum ratios.
 * @returns {Object[]} One `{root, declared, resolved, ratio, floor}` row per root that has classes,
 *     for reporting. Roots with no declaring classes are omitted rather than counted as 100%.
 * @throws {Error} `CLASS_HIERARCHY_COVERAGE_REGRESSION` naming every regressed root with its
 *     measured ratio and floor, so the message alone is actionable.
 */
export function assertCoverageBaseline({coverage, baseline = INTERIM_COVERAGE_BASELINE}) {
    const rows = [], regressed = [];

    for (const [root, tally] of Object.entries(coverage || {})) {
        const declared = tally?.declared ?? 0;

        // A root with nothing to resolve is not evidence either way. Reporting it as 100% would
        // manufacture a reassuring number out of an empty measurement.
        if (declared < 1) {
            continue;
        }

        const
            resolved = tally?.resolved ?? 0,
            ratio    = resolved / declared,
            floor    = baseline[root];

        rows.push({root, declared, resolved, ratio, floor});

        // `undefined` floor = a root nobody has baselined. Not a regression, and not silently fine
        // either: it is surfaced in the returned rows so the caller can report it.
        if (typeof floor === 'number' && ratio < floor) {
            regressed.push(`${root} ${resolved}/${declared} = ${(ratio * 100).toFixed(1)}% (floor ${(floor * 100).toFixed(1)}%)`);
        }
    }

    if (regressed.length > 0) {
        const error = new Error(
            `Class hierarchy coverage regressed below its interim floor: ${regressed.join('; ')}. ` +
            `'extends' is hashed into every chunk id, so ingesting now would re-identify the affected ` +
            `classes and mark the existing corpus stale. Regenerate with \`npm run generate-docs-json\`; ` +
            `if the drop is intended, the floor must be lowered deliberately and reviewed.`
        );

        error.code = 'CLASS_HIERARCHY_COVERAGE_REGRESSION';
        throw error;
    }

    return rows
}
