#!/usr/bin/env node
/**
 * @summary Fails when an agent-facing MCP tool description calls Neo a framework.
 *
 * ## Why this surface specifically
 *
 * Tool descriptions are loaded into every agent's context as the authoritative statement of what a
 * tool operates on. They reach agents that never read a single guide — including fresh sessions,
 * other model families, and any external consumer of the OpenAPI surface. A category noun stated
 * there is not wording drift; it is a claim about what Neo *is*, delivered on every call.
 *
 * That matters because the identity anchor exists to nullify a pre-training prior: all three model
 * families reduce Neo to a web framework unless something local says otherwise. A description that
 * says "framework" feeds exactly the prior the anchor is built to cancel, from inside the substrate,
 * where re-reading the anchor cannot reach it.
 *
 * Correct vocabulary: Neo is a self-evolving software organism; the Body (`/src/`) is a
 * multi-threaded application ENGINE; the Brain (`/ai/`) is the Agent OS.
 *
 * ## The rule, and why it is default-deny
 *
 * Any `framework` token in these files is a violation UNLESS it names a specific external one —
 * `React framework`, `Playwright framework`. The carve-out is deliberately narrow and mechanical:
 * an external framework is always *named*, so the qualifier is a reliable signal, while an
 * unqualified `framework` in a Neo-owned description can only mean Neo.
 *
 * Default-deny is the right polarity because the failure this guards against is a category claim
 * arriving by omission — nobody writes "Neo is a framework"; they write "the framework", and the
 * claim rides in on the definite article. An allowlist-of-bad-phrases would have to enumerate the
 * ways one can imply it, which is unbounded; enumerating the ways to name an external framework is
 * not.
 *
 * There is no `--fix`. The correct substitution depends on which hemisphere a line is about —
 * "engine" for runtime-facing text, "Neo.mjs" for text about knowledge of the project — and a flag
 * that guessed would launder one category error into another.
 * @plane in-plane
 */

import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT        = path.resolve(import.meta.dirname, '../../..'),
      SERVER_ROOT = path.join(ROOT, 'ai/mcp/server'),
      /**
       * A `framework` token counts as external — and therefore legal — only when the word directly
       * before it is a capitalized NAME. `Vue framework` passes; `the framework` does not.
       *
       * Determiners are excluded explicitly because capitalization alone is not evidence of a name:
       * a sentence-initial "The framework evolves rapidly" is capitalized and is the most explicit
       * category claim of all. That exact line survived the first draft of this guard, which is why
       * the stoplist exists rather than a bare `[A-Z]` test.
       */
      DETERMINERS = new Set(['a', 'an', 'the', 'this', 'that', 'these', 'those', 'our', 'its',
                             'their', 'his', 'her', 'any', 'each', 'every', 'no', 'some', 'one']),
      /**
       * The qualifier that makes a `framework` token legal must name something OTHER than Neo.
       * Without this, the carve-out exempted the exact phrase the guard exists to catch: `Neo` is
       * capitalized and is not a determiner, so `Neo framework` and `Neo.mjs framework` read as
       * "external product name + framework" and passed. A guard whose escape hatch admits its own
       * subject is worse than no guard, because it certifies the thing it was built to stop.
       */
      NEO_TOKENS  = new Set(['neo', 'neo.mjs', 'neomjs']),
      /**
       * Every `framework` token with its immediately preceding word, if any. Global and
       * occurrence-scoped so each token is judged on its own qualifier.
       */
      OCCURRENCE  = /(?:([A-Za-z0-9.+-]+)\s+)?\bframeworks?\b/gi;

/**
 * @summary Whether one `framework` occurrence's qualifier names a specific external framework.
 *
 * Legal requires all three: a capitalized qualifier, not a determiner, and not Neo itself. A bare
 * token with no qualifier at all is never legal — an unqualified `framework` in a Neo-owned
 * description can only mean Neo.
 * @param {String|undefined} qualifier The word directly before the token.
 * @returns {Boolean}
 */
export function isExternalQualifier(qualifier) {
    if (!qualifier) return false;

    const lower = qualifier.toLowerCase();

    return /^[A-Z]/.test(qualifier) && !DETERMINERS.has(lower) && !NEO_TOKENS.has(lower);
}

/**
 * @summary Whether one line states a framework-category claim about Neo.
 *
 * Exported so the carve-out matrix is pinned in CI rather than living only in the reviewer's head:
 * this predicate is the entire policy, and its first two drafts each had a hole that a clean-tree
 * run could not reveal.
 * @param {String} text Source line.
 * @returns {Boolean}
 */
export function claimsNeoIsAFramework(text) {
    // Evaluated per OCCURRENCE, not per line. A line-level carve-out let one legal mention launder
    // every other token beside it — `Vue framework adapter; Neo.mjs framework internals` passed,
    // because the first match was legal and the whole line was then exempt. The claim is made by an
    // occurrence, so the occurrence is what must be judged.
    return Array.from(text.matchAll(OCCURRENCE))
        .some(match => !isExternalQualifier(match[1]));
}

/**
 * @summary Collects every `openapi.yaml` under the MCP server tree.
 * @returns {String[]} Absolute file paths.
 */
function collectSurfaces() {
    if (!fs.existsSync(SERVER_ROOT)) return [];

    return fs.readdirSync(SERVER_ROOT, {withFileTypes: true})
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(SERVER_ROOT, entry.name, 'openapi.yaml'))
        .filter(file => fs.existsSync(file));
}

/**
 * @summary Reports every line whose `framework` token is not a named external one.
 * @param {String} file Absolute path.
 * @returns {Object[]} `{file, line, text}` violations.
 */
function findViolations(file) {
    return fs.readFileSync(file, 'utf8').split('\n')
        .map((text, index) => ({text, line: index + 1}))
        .filter(({text}) => claimsNeoIsAFramework(text))
        .map(({text, line}) => ({file: path.relative(ROOT, file), line, text: text.trim()}));
}

/**
 * @summary Scans the surfaces and exits non-zero on any violation.
 *
 * Runs ONLY when this module is the entrypoint. Importing the predicate for a spec must have no
 * side effect — an import-time scan would `process.exit(1)` inside the test runner the moment the
 * tree had a real violation, so the guard's own coverage would die exactly when it mattered.
 * @returns {void}
 */
function main() {
    const surfaces   = collectSurfaces(),
          violations = surfaces.flatMap(findViolations);

    if (violations.length) {
        console.error(`\x1b[31mlint-identity-vocabulary: ${violations.length} framework-category claim(s) in agent-facing tool descriptions:\x1b[0m`);
        violations.forEach(({file, line, text}) => console.error(`  ${file}:${line}: ${text}`));
        console.error(
            'Neo is not a framework — the Body is an ENGINE, the Brain is the Agent OS. Tool descriptions\n' +
            'are read by every agent as authority on what Neo is, including agents that never read a guide.\n' +
            'Use "engine" for runtime-facing text and "Neo.mjs" for text about knowledge of the project.\n' +
            'Naming a specific external framework (e.g. "React framework") is legal and passes.'
        );
        process.exit(1);
    }

    console.log(`lint-identity-vocabulary: ${surfaces.length} agent-facing surface(s) scanned, 0 violations.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
