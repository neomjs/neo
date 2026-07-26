import * as acorn      from 'acorn';
import {execFileSync}  from 'node:child_process';
import {readFileSync}  from 'node:fs';
import path            from 'node:path';
import process         from 'node:process';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '../..');

/**
 * @module buildScripts/util/check-derived-domain
 * @summary Flags a spec that hand-enumerates the members of a set it could derive from an external
 * artifact it already parses — the shape behind a class of partial fixes that ship looking complete.
 *
 * ## The defect
 *
 * A spec parses an artifact (a Compose file, a manifest, a config), then iterates a **hardcoded roster**
 * of that artifact's keys:
 *
 *     const compose = yaml.load(readFileSync(composePath, 'utf8'));
 *     for (const service of ['kb-server', 'mc-server', 'orchestrator']) {
 *         expect(compose.services[service]) …
 *     }
 *
 * The assertion then covers the members the author knew about. A service added next week satisfies
 * nothing and the suite stays green — the guard reports success over a set that grew behind it.
 * `Object.keys(compose.services)` was available on the line above.
 *
 * ## Why the trigger is NOT "a spec enumerates things"
 *
 * Measured before this file existed: the broad form — any string-literal roster whose loop variable
 * indexes an object — produced **25 candidates, of which 22 were correct as written**. A service class's
 * method roster (`['getKbConfig', 'fetchRollup', …]`) *is* the obligation; deriving it from the class
 * would assert that the class has the methods it has, which is green forever including after someone
 * deletes one. **Deriving the EXPECTATION is how a test stops being able to fail**, so a lint that
 * flagged all 25 would have pushed the repo toward vacuous assertions under a mechanical-enforcement
 * badge.
 *
 * The discriminator that survives measurement, and it is structural rather than semantic:
 *
 *   > Fire only where the indexed object was **parsed from an external artifact in this same file** —
 *   > the only case where the set can grow **without editing anything the spec imports**.
 *
 * A class's method list cannot grow behind a spec that imports the class; a Compose file's service list
 * can. On the corpus this rule was built against it fired 3 / suppressed 22, with the 3 all being the
 * known defect — including one instance a careful manual read had missed.
 *
 * ## Resolutions, in preference order
 *
 * 1. **Derive the domain.** `for (const service of Object.keys(compose.services))` — then assert a
 *    property that does *not* come from the artifact (does this service mount the plane volume?).
 *    Derive the DOMAIN; the EXPECTATION must come from somewhere the artifact cannot supply.
 * 2. **Pin the enumeration.** Keep the roster and assert it equals the derived set, the shape
 *    `test/playwright/unit/ai/planeConfig.spec.mjs` already ships. Enumeration stays legal and cannot
 *    drift.
 * 3. **Escape**, with a stated reason — see `ESCAPE_MARKER`.
 *
 * @example
 * node ./buildScripts/util/check-derived-domain.mjs                 # whole test tree
 * node ./buildScripts/util/check-derived-domain.mjs path/to.spec.mjs
 */

/**
 * Inline relief valve for a roster that is deliberately partial. A line carrying this marker is skipped.
 * The marker must be followed by a reason: a bare escape is how an exception outlives the judgement that
 * justified it.
 * @type {String}
 */
export const ESCAPE_MARKER = 'derived-domain-ok:';

/**
 * Expressions that bind an identifier to the contents of an EXTERNAL artifact.
 *
 * Deliberately about *reading the world*, not about parsing per se: what makes a set growable behind a
 * spec is that its members live somewhere the spec does not import. A fixture object literal declared in
 * the file is not this, however large it gets.
 * @type {RegExp}
 */
export const ARTIFACT_READ = /readFileSync|readFile\(|yaml\.load|JSON\.parse|parseDocument|execFileSync|readdirSync|globSync/;

/**
 * Walks an acorn AST, invoking `visit` on every node.
 * @param {Object} node
 * @param {Function} visit
 * @returns {void}
 */
export function walkAst(node, visit) {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
        node.forEach(child => walkAst(child, visit));
        return
    }

    if (typeof node.type === 'string') visit(node);

    for (const key of Object.keys(node)) {
        if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
        walkAst(node[key], visit);
    }
}

/**
 * Identifiers in `source` bound to the contents of an external artifact.
 *
 * Both `const x = yaml.load(…)` and a later `x = yaml.load(…)` count: a spec that reads its artifact in
 * a `beforeAll` assigns rather than declares, and missing that shape would suppress the exact files this
 * check exists for.
 *
 * @param {String} source Module source text.
 * @param {Object} ast Parsed AST for `source`.
 * @returns {Set<String>} Identifier names.
 */
export function artifactBoundIdentifiers(source, ast) {
    const bound = new Set();

    walkAst(ast, node => {
        if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.init) {
            if (ARTIFACT_READ.test(source.slice(node.init.start, node.init.end))) bound.add(node.id.name);
        }

        if (node.type === 'AssignmentExpression' && node.left?.type === 'Identifier' && node.right) {
            if (ARTIFACT_READ.test(source.slice(node.right.start, node.right.end))) bound.add(node.left.name);
        }
    });

    return bound
}

/**
 * Finds hand-enumerated rosters that index an artifact-bound object.
 *
 * A finding requires all three, and each one is load-bearing:
 * - a `for…of` over an array of **string literals** (>= 2) — a roster, not a single case;
 * - the loop variable used as a **computed member key** — proof the object is keyed by these strings,
 *   so `Object.keys` was available;
 * - the indexed object's root **bound from an external artifact** — so the set can grow unobserved.
 *
 * @param {String} source Module source text.
 * @param {String} [file] Repo-relative path, for the report.
 * @returns {Object[]} `{file, line, roster, root}` findings.
 */
export function findUnderivedRosters(source, file = '<source>') {
    let ast;

    try {
        ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module', locations: true});
    } catch {
        // An unparseable file is a different check's problem; silently passing it here beats failing
        // every commit that touches a work-in-progress spec.
        return []
    }

    const bound    = artifactBoundIdentifiers(source, ast),
          lines    = source.split('\n'),
          findings = [];

    if (bound.size === 0) return findings;

    walkAst(ast, node => {
        if (node.type !== 'ForOfStatement' || node.right?.type !== 'ArrayExpression') return;

        const elements = node.right.elements;

        if (!elements || elements.length < 2) return;
        if (!elements.every(element => element?.type === 'Literal' && typeof element.value === 'string')) return;

        const declared = node.left?.declarations?.[0]?.id;

        if (declared?.type !== 'Identifier') return;

        const line = node.loc.start.line;

        if ((lines[line - 1] || '').includes(ESCAPE_MARKER)) return;
        if ((lines[line - 2] || '').includes(ESCAPE_MARKER)) return;

        let matchedRoot = null;

        walkAst(node.body, inner => {
            if (matchedRoot) return;
            if (inner.type !== 'MemberExpression' || !inner.computed) return;
            if (inner.property?.type !== 'Identifier' || inner.property.name !== declared.name) return;

            let object = inner.object;

            while (object?.type === 'MemberExpression') object = object.object;

            if (object?.type === 'Identifier' && bound.has(object.name)) matchedRoot = object.name;
        });

        if (matchedRoot) {
            findings.push({file, line, roster: elements.map(element => element.value), root: matchedRoot});
        }
    });

    return findings
}

/**
 * Lists the `.mjs` spec files this check governs.
 * @returns {String[]} Repo-relative paths.
 */
function listSpecFiles() {
    return execFileSync('git', ['ls-files', 'test'], {cwd: ROOT, encoding: 'utf8'})
        .split('\n')
        .filter(file => file.endsWith('.mjs'))
}

// Only the CLI invocation scans and exits. A spec must be able to `import` the predicates without the
// module reading the repo and calling `process.exit` on the way in — the first version of this file did
// exactly that and killed the test worker, which is the same class of defect the check exists to catch:
// the guard was not exercised against the consumer that would actually load it.
const invokedAsCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (!invokedAsCli) {
    // Imported for its predicates; nothing else to do.
} else {

const targets = process.argv.slice(2).length
    ? process.argv.slice(2).map(file => path.relative(ROOT, path.resolve(file)))
    : listSpecFiles();

const findings = targets.flatMap(file => {
    let source;

    try {
        source = readFileSync(path.join(ROOT, file), 'utf8');
    } catch {
        return []
    }

    return findUnderivedRosters(source, file)
});

if (findings.length) {
    console.error(`\x1b[31mcheck-derived-domain: ${findings.length} hand-enumerated roster(s) over a parsed artifact:\x1b[0m`);

    for (const finding of findings) {
        console.error(`  ${path.join(ROOT, finding.file)}:${finding.line}: iterates ['${finding.roster.join("', '")}'] to index \`${finding.root}\`, which is read from a file`);
    }

    console.error(`
The roster covers the members you knew about; the artifact can gain one without touching this spec,
and the suite stays green over a set that grew behind it.

Fix, in preference order:
  1. Derive the DOMAIN  — iterate \`Object.keys(<artifact>…)\`, and assert a property the artifact
                           does not itself supply. Deriving the EXPECTATION makes the test vacuous.
  2. PIN the roster     — assert it equals the derived set (see planeConfig.spec.mjs).
  3. Escape             — put \`${ESCAPE_MARKER} <reason>\` on or above the loop.`);

    process.exit(1);
}

}
