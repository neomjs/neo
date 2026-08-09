#!/usr/bin/env node
/**
 * @summary Requires every member assigned in `initAsync()` to be read through *some* readiness
 * discipline — awaited readiness, or an accessor that throws a typed error on the member's absence
 * path. A member read through neither produces a raw `TypeError` naming no subsystem, during the
 * startup window the deferral itself opened.
 *
 * ## The invariant, and why it names TWO disciplines
 *
 * A member built in `initAsync()` is `null` between construction and readiness. Every reader of that
 * member silently acquired a new contract the moment the assignment left `construct()`, and nothing
 * mechanical observes that move.
 *
 * The first draft of this predicate demanded one idiom — `await this.ready()` — and **fired on 58
 * sites**. Investigating the top offender falsified the predicate rather than the code:
 * `GraphService` uses `await this.ready()` **zero** times and is not thereby defective, because it
 * carries `requireDb()`, which converts absence into a typed unavailable-error instead of a
 * `TypeError`. A gate's first large number more often indicts the gate than the tree.
 *
 * > A member built in `initAsync()` must be read through **awaited readiness** or through **a guard
 * > that throws a typed error on that member's absence path**. Reading it through neither is the
 * > defect.
 *
 * ## Why the typed-guard discipline is recognised at FILE level, not per read
 *
 * `GraphService` defines `requireDb()` once and reads `this.db` **124 times without calling it** —
 * the accessor exists for its *consumers*, which call `GraphService.requireDb(surface)` from 23 sites
 * in other files. A per-read rule would flag the very file the acceptance criteria name as the green
 * case, 124 times over.
 *
 * So: **a member is disciplined if its file defines a typed-error accessor for it.** The invariant is
 * that the member *has* a discipline, not that every read re-proves it. Whether each internal read
 * routes through the accessor is a weaker, separate question this predicate does not answer.
 *
 * ## The guard must be CAUSAL, not co-located
 *
 * An earlier revision credited the discipline whenever a method contained both `if (!this.member)`
 * and the token `throw` anywhere within it. That is co-location, not causation: a method that
 * early-`return`s on absence and throws later for an unrelated reason was credited with a discipline
 * it does not have — a false GREEN, which is the failure direction that matters in a gate.
 *
 * The throw must sit **inside the absence branch**. `ifBlockRange` resolves that branch's extent by
 * brace depth (and handles the single-statement `if (!x) throw …` form), so the credit follows the
 * control flow rather than the file order.
 *
 * ## Literals and comments are blanked before ANY structural question is asked
 *
 * Every question here — where a method begins and ends, whether readiness is awaited, whether a read
 * occurs — was at some point asked against raw source, and each was falsifiable by prose:
 *
 * | shape | what it used to do |
 * |---|---|
 * | `// await this.ready()` | credited readiness for the whole method |
 * | `const brace = "}"` | closed the enclosing method range early, hiding every read below it |
 * | a JSDoc table naming `this.db` | counted as a read |
 *
 * `stripSource` blanks comment and string/template TEXT while preserving `${…}` substitutions, which
 * are executable code that merely lives inside a template.
 *
 * ## Receiver aliases
 *
 * `const me = this` is a dominant idiom in this repo, and a scanner that only knows `this.member` is
 * blind to every read through it. `src/functional/component/Base.mjs` assigns `htmlTemplateProcessor`
 * in `initAsync()` and reads `me.htmlTemplateProcessor` — invisible to the first revision, which then
 * reported the member as unread. That silence became a false claim in a PR body: the scanner's zero
 * was published as a fact about the code.
 *
 * Aliases are collected per method from `const|let|var <name> = this`, and both reads and
 * `await <alias>.ready()` are recognised through them.
 *
 * ## What this reports, and what it does NOT
 *
 * A violation here is a **defect claim**, not an `unclassified` note. That differs from its sibling
 * `lint-retry-bounds`, which never says "unbounded" because its discovery patterns have a larger
 * false-positive family than true-positive set. This population is narrower and derived rather than
 * inferred: a member either is or is not assigned in `initAsync()`.
 *
 * **Bounds — what a green run does not establish:**
 *
 * - **This is a line-oriented scanner, not a parser.** It tracks brace and paren depth over
 *   literal-stripped lines. It does not build a syntax tree, and a construct that defeats depth
 *   tracking defeats it.
 * - **Per file only.** A member of `ServiceA` read by `ServiceB` is invisible. No cross-file
 *   following.
 * - **Textual order, not branch dominance.** Readiness and guards count when they appear earlier in
 *   the same method. A `ready()` awaited in one arm of a conditional reads as covering everything
 *   after it.
 * - **No call-graph following.** A method delegating to a helper that awaits readiness is not
 *   credited. The typed accessor's *existence* is checked; its *use* is not.
 * - **Aliases must be direct.** `const me = this` is followed; `const {store} = this` and
 *   `const me = other.thing` are not.
 * - **Assignment detection is syntactic.** `Object.assign(this, {…})` or a computed `this[name] = …`
 *   inside `initAsync()` does not register a deferred member.
 *
 * ## Shapes, because "undisciplined" hides three different risks
 *
 * | shape | what happens during the window |
 * |---|---|
 * | `bare-read` | `TypeError: Cannot read properties of null` — loud, names no subsystem |
 * | `truthy-skip` | the work is **silently skipped** and the caller is told nothing |
 * | `optional-chain` | evaluates `undefined` and flows on |
 *
 * `truthy-skip` is deliberately a violation rather than a third discipline: it does not convert
 * absence into a typed error, it converts it into *silence*. `SessionService.purgeSession()` is the
 * worked example — it returns `{success: true, deletedMemories: 0}` when the collections are absent,
 * which a caller cannot distinguish from a genuinely empty session, after the WAL tombstone pass
 * above it has already run unconditionally.
 *
 * ## Scope
 *
 * Production `.mjs` under `ai/`, `src/`, `apps/`, `buildScripts/`. Specs and tests are excluded: a
 * fixture asserting startup behaviour is not a production read site.
 */

import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const
    __filename   = fileURLToPath(import.meta.url),
    __dirname    = path.dirname(__filename),
    ROOT_DIR     = path.resolve(__dirname, '../../../'),
    REGISTRY_REL = 'ai/scripts/lint/deferred-member-registry.json',
    SCAN_ROOTS   = ['ai', 'src', 'apps', 'buildScripts'],

    SKIP_DIR = new Set(['node_modules', 'dist', '.git', 'test', 'tests', 'coverage']),

    VALID_SHAPE = new Set(['bare-read', 'truthy-skip', 'optional-chain']),

    KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'do', 'else']),

    /**
     * The committed registry, unless a spec points this at a fixture.
     *
     * A red-proof that mutated the real registry would leave the repo dirty on failure and could not
     * run in parallel. Production never sets this.
     */
    REGISTRY_PATH = process.env.NEO_DEFERRED_MEMBER_REGISTRY
        ? path.resolve(process.env.NEO_DEFERRED_MEMBER_REGISTRY)
        : path.join(ROOT_DIR, REGISTRY_REL);

/**
 * @summary Every surface whose contents can change this lint's verdict — the SSOT its CI workflow's
 * path filter must cover.
 *
 * Exported so the `scanned ⊆ watched` spec takes it as authority rather than a hand-copied duplicate.
 * The walker skips test directories, so the root globs are a deliberate superset of what is read — a
 * superset never under-watches.
 *
 * @type {String[]}
 */
export const SCAN_SURFACE = Object.freeze([
    ...SCAN_ROOTS.map(root => `${root}/**/*.mjs`),
    REGISTRY_REL
]);

/**
 * Blanks comment and literal TEXT across a whole file, preserving code shape and line count.
 *
 * @summary Every structural question this lint asks — method extent, readiness, reads, guards — is
 * asked against the result. Asking any of them against raw source lets prose answer them: a
 * commented-out `await this.ready()` credited readiness, and a `"}"` string literal closed a method
 * range early and hid every read below it.
 *
 * `${…}` substitutions are PRESERVED: they are executable code that merely lives inside a template.
 * Line count is preserved so every index stays comparable to the raw source the report cites.
 *
 * @param {String[]} lines Raw source lines.
 * @returns {String[]} Same length, with comment and literal text replaced by spaces.
 */
export function stripSource(lines) {
    const out = [];

    let inBlock    = false,
        inTemplate = false;

    for (const line of lines) {
        let result     = '',
            quote      = inTemplate ? '`' : null,
            substDepth = 0,
            i          = 0;

        while (i < line.length) {
            const char = line[i],
                  next = line[i + 1];

            if (inBlock) {
                if (char === '*' && next === '/') {
                    inBlock = false;
                    result += '  ';
                    i      += 2;
                    continue
                }

                result += ' ';
                i++;
                continue
            }

            if (substDepth > 0) {
                if (char === '{') substDepth++;
                if (char === '}') substDepth--;
                result += substDepth === 0 ? ' ' : char;
                i++;
                continue
            }

            if (quote) {
                if (quote === '`' && char === '$' && next === '{') {
                    substDepth = 1;
                    result    += '  ';
                    i         += 2;
                    continue
                }

                if (char === '\\') {
                    result += '  ';
                    i      += 2;
                    continue
                }

                if (char === quote) {
                    quote   = null;
                    result += ' ';
                    i++;
                    continue
                }

                result += ' ';
                i++;
                continue
            }

            if (char === '/' && next === '/') {
                result += ' '.repeat(line.length - i);
                break
            }

            if (char === '/' && next === '*') {
                inBlock = true;
                result += '  ';
                i      += 2;
                continue
            }

            if (char === '\'' || char === '"' || char === '`') {
                quote   = char;
                result += ' ';
                i++;
                continue
            }

            result += char;
            i++
        }

        // A single/double quote never carries across lines — an unterminated one is a syntax error,
        // and treating it as open would blank the rest of the file. Templates DO carry.
        inTemplate = quote === '`';

        out.push(result)
    }

    return out
}

/**
 * @param {String} line
 * @returns {Number} net brace depth change on this (already stripped) line
 */
function braceDelta(line) {
    return (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
}

/**
 * Resolves every method's line range, including multiline signatures.
 *
 * @summary Ranges rather than "nearest declaration above", because this predicate answers
 * *containment* questions and a backwards scan cannot tell a sibling method from an enclosing one.
 *
 * **Multiline signatures are the load-bearing case.** An earlier revision required the declaration
 * line to END at the opening brace, so `buildAgentFaqs({\n  minCount = …,\n} = {}) {` matched
 * nothing — and its reads, belonging to no method range, were dropped entirely rather than reported.
 * Three current production obligations were invisible that way. The parameter list is now consumed by
 * paren depth across as many lines as it takes.
 *
 * @param {String[]} stripped Literal-stripped source lines.
 * @returns {Object[]} `[{name, start, end}]`, zero-based inclusive.
 */
export function findMethodRanges(stripped) {
    const OPEN   = /^\s*(?:static\s+)?(?:async\s+)?(#?[A-Za-z_$][\w$]*)\s*\(/,
          ranges = [];

    let i = 0;

    while (i < stripped.length) {
        const match = stripped[i].match(OPEN);

        if (!match || KEYWORDS.has(match[1])) {
            i++;
            continue
        }

        // Consume the parameter list by paren depth — it may span lines.
        let parenDepth = 0,
            cursor     = i,
            seenParen  = false;

        while (cursor < stripped.length) {
            for (const char of stripped[cursor]) {
                if (char === '(') { parenDepth++; seenParen = true }
                else if (char === ')') parenDepth--
            }

            if (seenParen && parenDepth <= 0) break;

            cursor++
        }

        if (cursor >= stripped.length) {
            i++;
            continue
        }

        // A body that opens AND closes on the signature line is a complete method.
        //
        // Found while writing this file's own falsifier probes: `async initAsync() { this.db = await
        // mk(); }` matched no range, so `deferredMembersOf` found no members and the ENTIRE FILE went
        // silent — not one missed read, every read. The probes returned "no violation" for cases
        // designed to fire, and the harness looked correct because silence is what a green scanner
        // and a blind one both produce.
        if (/\)\s*\{.*\}\s*$/.test(stripped[cursor])) {
            ranges.push({name: match[1], start: i, end: cursor});
            i = cursor + 1;
            continue
        }

        // Otherwise the body must open at the end of the line the parameter list closes on.
        if (!/\)\s*\{\s*$/.test(stripped[cursor])) {
            i++;
            continue
        }

        // Depth starts at 1 for the body brace the test above just matched, and counting begins on
        // the NEXT line.
        //
        // Counting the whole signature line instead was a silent-truncation bug: `buildAgentFaqs({…}
        // = {}) {` closes a destructuring pattern and a `= {}` default on the same line, so its brace
        // delta is zero and the method "ended" on its own signature. Every read in the real body then
        // belonged to no range and collapsed into one `<module>` entry — seven distinct reads across
        // three methods reported as a single obligation. The regex guarantees the line ends at `) {`,
        // so nothing after the body brace can be missed by skipping the rest of it.
        let depth = 1,
            end   = cursor;

        for (let j = cursor + 1; j < stripped.length; j++) {
            depth += braceDelta(stripped[j]);
            end    = j;

            if (depth <= 0) {
                break
            }
        }

        ranges.push({name: match[1], start: i, end});

        i = end + 1
    }

    return ranges
}

/**
 * @param {Object[]} ranges From `findMethodRanges`.
 * @param {Number} index Zero-based line index.
 * @returns {Object|null} The innermost range containing `index`.
 */
export function methodAt(ranges, index) {
    return ranges.filter(r => index >= r.start && index <= r.end).sort((a, b) => b.start - a.start)[0] || null
}

/**
 * Receiver aliases bound to `this` within a line range.
 *
 * @summary `const me = this` is a dominant idiom here, and a scanner blind to it reports members as
 * unread when they are read through the alias — which is how this lint's first revision produced a
 * false claim about `functional/component/Base#htmlTemplateProcessor`.
 * @param {String[]} stripped Literal-stripped lines.
 * @param {Object} range `{start, end}`.
 * @returns {String[]} Alias identifiers, always including `this`.
 */
export function receiverAliases(stripped, range) {
    const aliases = new Set(['this']);

    for (let i = range.start; i <= range.end; i++) {
        for (const match of stripped[i].matchAll(/\b(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s*=\s*this\b(?!\s*\.)/g)) {
            match[1] !== 'this' && aliases.add(match[1])
        }
    }

    return [...aliases]
}

/**
 * @param {String[]} aliases
 * @returns {String} Regex-safe alternation, e.g. `(?:this|me)`
 */
function receiverGroup(aliases) {
    return `(?:${aliases.map(a => a.replace(/[$]/g, '\\$')).join('|')})`
}

/**
 * Members assigned inside `initAsync()`.
 *
 * @summary **The population is derived here, from the assignment — never from a member name.** The
 * defect this lint replaces was caused by a hand-written query that shaped its own population.
 * @param {String[]} stripped Literal-stripped lines.
 * @param {Object[]} ranges From `findMethodRanges`.
 * @returns {Set<String>} Member names.
 */
export function deferredMembersOf(stripped, ranges) {
    const members = new Set(),
          init    = ranges.find(r => r.name === 'initAsync');

    if (!init) {
        return members
    }

    const
        receivers = receiverGroup(receiverAliases(stripped, init)),
        // `=` but not `==`/`===`/`=>`. Deliberately NOT anchored to line start: an anchored pattern
        // missed every assignment that is not the first thing on its line, including the whole body
        // of a single-line `initAsync() { this.db = await mk(); }` — which then yielded no members
        // and silenced the entire file. The left boundary keeps `other.this.db` from matching.
        pattern   = new RegExp(`(?:^|[^\\w$.])${receivers}\\.([A-Za-z_$][\\w$]*)\\s*=(?![=>])`, 'g');

    for (let i = init.start; i <= init.end; i++) {
        for (const match of stripped[i].matchAll(pattern)) {
            members.add(match[1])
        }
    }

    return members
}

/**
 * The line range of the block an `if` on line `index` controls.
 *
 * @summary Resolves both `if (…) {` … `}` and the single-statement `if (…) throw x;` form, so
 * causality can be tested rather than assumed.
 * @param {String[]} stripped Literal-stripped lines.
 * @param {Number} index Zero-based index of the `if` line.
 * @returns {{start: Number, end: Number}}
 */
export function ifBlockRange(stripped, index) {
    if (!/\{\s*$/.test(stripped[index]) && !/\{/.test(stripped[index])) {
        // Single-statement form: the consequent is the remainder of this line, or the next line.
        return {start: index, end: /\)\s*\S/.test(stripped[index]) ? index : Math.min(index + 1, stripped.length - 1)}
    }

    let depth = 0;

    for (let i = index; i < stripped.length; i++) {
        depth += braceDelta(stripped[i]);

        if (depth <= 0 && i > index) {
            return {start: index, end: i}
        }

        if (depth <= 0 && /\}/.test(stripped[i]) && i === index) {
            return {start: index, end: i}
        }
    }

    return {start: index, end: stripped.length - 1}
}

/**
 * Members for which the file defines a typed-error accessor.
 *
 * @summary The `requireDb()` discipline. The throw must sit **inside the member's absence branch** —
 * co-location within the same method is not causation, and crediting it was a false GREEN: a method
 * that early-`return`s on absence and throws later for an unrelated reason has no discipline.
 * @param {String[]} stripped Literal-stripped lines.
 * @param {Object[]} ranges From `findMethodRanges`.
 * @returns {Map<String, String>} member → accessor method name.
 */
export function typedGuardMembers(stripped, ranges) {
    const guards = new Map();

    for (const range of ranges) {
        const receivers = receiverGroup(receiverAliases(stripped, range)),
              absence   = new RegExp(`if\\s*\\(\\s*!\\s*${receivers}\\.([A-Za-z_$][\\w$]*)\\s*\\)`);

        for (let i = range.start; i <= range.end; i++) {
            const match = stripped[i].match(absence);

            if (!match) {
                continue
            }

            const block = ifBlockRange(stripped, i),
                  body  = stripped.slice(block.start, block.end + 1).join('\n');

            /\bthrow\b/.test(body) && !guards.has(match[1]) && guards.set(match[1], range.name)
        }
    }

    return guards
}

/**
 * Classifies how a read fails the invariant.
 *
 * @summary The guard must precede the read. An earlier revision tested the whole method, so a bare
 * read on line 10 was excused by a guard added on line 20 — the read that actually crashes reported
 * as the shape that does not.
 * @param {String[]} stripped Literal-stripped lines.
 * @param {Object} range Enclosing method range.
 * @param {Number} index Zero-based line index of the read.
 * @param {String} member Member name.
 * @param {String[]} aliases Receiver aliases in scope.
 * @returns {String} One of `VALID_SHAPE`.
 */
export function readShape(stripped, range, index, member, aliases) {
    const
        receivers = receiverGroup(aliases),
        before    = stripped.slice(range.start, index + 1).join('\n'),
        guarded   = new RegExp(`(if\\s*\\(.*${receivers}\\.${member}\\b|${receivers}\\.${member}\\s*&&)`);

    if (guarded.test(before)) {
        return 'truthy-skip'
    }

    if (new RegExp(`${receivers}\\.${member}\\s*\\?\\.`).test(stripped[index])) {
        return 'optional-chain'
    }

    return 'bare-read'
}

/**
 * Whether a line is only the guard's own test rather than a use of the member.
 *
 * @summary `if (!this.db) return;` is the discipline being applied, not a read that needs one.
 * Used to choose which line to CITE, never to decide whether a site is a violation.
 * @param {String} line Stripped source line.
 * @param {String} member Member name.
 * @param {String[]} aliases Receiver aliases in scope.
 * @returns {Boolean}
 */
export function isGuardTestLine(line, member, aliases = ['this']) {
    const receivers = receiverGroup(aliases),
          trimmed   = line.trim();

    return new RegExp(`^\\}?\\s*(else\\s+)?if\\s*\\(.*${receivers}\\.${member}\\b`).test(trimmed) &&
           !new RegExp(`${receivers}\\.${member}\\s*[.\\[]`).test(trimmed)
}

/**
 * Walks the scan roots for production `.mjs` files.
 *
 * @param {String} dir Absolute directory.
 * @param {String[]} [acc=[]] Accumulator.
 * @returns {String[]} Absolute file paths.
 */
export function collectSourceFiles(dir, acc = []) {
    let entries;

    try {
        entries = fs.readdirSync(dir, {withFileTypes: true})
    } catch (error) {
        return acc
    }

    for (const entry of entries) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            !SKIP_DIR.has(entry.name) && collectSourceFiles(full, acc)
        } else if (entry.isFile() && entry.name.endsWith('.mjs') && !/\.spec\.mjs$/.test(entry.name)) {
            acc.push(full)
        }
    }

    return acc
}

/**
 * Finds every undisciplined read of a deferred member in one file's source.
 *
 * @summary Exported so a spec can drive it with synthetic source, which is how the causal-guard,
 * comment-pseudo-await, string-brace, multiline-declaration and alias cases are pinned.
 * @param {String} rel Repo-relative path, used for keys and the report.
 * @param {String[]} lines Raw source lines.
 * @returns {Object[]} Violations for this file.
 */
export function violationsInSource(rel, lines) {
    const
        stripped = stripSource(lines),
        ranges   = findMethodRanges(stripped),
        members  = deferredMembersOf(stripped, ranges);

    if (members.size === 0) {
        return []
    }

    const
        guarded  = typedGuardMembers(stripped, ranges),
        init     = ranges.find(r => r.name === 'initAsync'),
        seenKeys = new Map();

    for (let index = 0; index < stripped.length; index++) {
        if (init && index >= init.start && index <= init.end) {
            continue
        }

        const enclosing = methodAt(ranges, index);

        // A read outside every method range is keyed to `<module>` rather than dropped. The previous
        // revision skipped it, which turned a scanner limitation into silent under-reporting.
        const scope    = enclosing || {name: '<module>', start: 0, end: stripped.length - 1},
              aliases  = receiverAliases(stripped, scope),
              receiver = receiverGroup(aliases);

        for (const member of members) {
            // The member's file carries a causal typed-error accessor: the member HAS a discipline.
            if (guarded.has(member)) {
                continue
            }

            // A read, not a write. `x.m =` is the assignment; `x.m ==` is a comparison.
            if (!new RegExp(`${receiver}\\.${member}\\b(?!\\s*=(?![=>]))`).test(stripped[index])) {
                continue
            }

            // Discipline A — awaited readiness, textually before the read in this scope, through any
            // receiver alias, and never from a comment (the source is stripped).
            const before = stripped.slice(scope.start, index + 1).join('\n');

            if (new RegExp(`await\\s+${receiver}\\.ready\\s*\\(`).test(before)) {
                continue
            }

            // ONE obligation per (file, method, member) — not per read. Eleven reads of `this.db`
            // inside `admitBatch` are all fixed by the same single discipline, and eleven registry
            // rows would be eleven copies of one decision.
            const key      = `${rel}#${scope.name}:${member}`,
                  existing = seenKeys.get(key);

            if (existing) {
                existing.reads++;

                if (existing.citedGuard && !isGuardTestLine(stripped[index], member, aliases)) {
                    existing.line       = index + 1;
                    existing.snippet    = lines[index].trim().slice(0, 110);
                    existing.citedGuard = false
                }

                continue
            }

            seenKeys.set(key, {
                key,
                file      : rel,
                line      : index + 1,
                method    : scope.name,
                member,
                reads     : 1,
                shape     : readShape(stripped, scope, index, member, aliases),
                snippet   : lines[index].trim().slice(0, 110),
                citedGuard: isGuardTestLine(stripped[index], member, aliases)
            })
        }
    }

    return [...seenKeys.values()].map(({citedGuard, ...violation}) => violation)
}

/**
 * Finds every undisciplined read of a deferred member across the scan roots.
 *
 * @param {Object} [options]
 * @param {String} [options.rootDir=ROOT_DIR] Repo root.
 * @returns {Object[]} `[{key, file, line, method, member, reads, shape, snippet}]`, sorted by key.
 */
export function discoverViolations({rootDir = ROOT_DIR} = {}) {
    const violations = [];

    for (const root of SCAN_ROOTS) {
        for (const file of collectSourceFiles(path.join(rootDir, root))) {
            violations.push(...violationsInSource(
                path.relative(rootDir, file),
                fs.readFileSync(file, 'utf8').split('\n')
            ))
        }
    }

    return violations.sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * Resolves every repo-relative path a witness names.
 *
 * @summary A witness naming a file deleted two refactors ago reads exactly like one naming a live
 * file. Deliberately narrow — it resolves paths, and does not claim the cited reasoning still holds.
 * @param {String} key Registry key, for the message.
 * @param {String} witness The witness text.
 * @param {String} [rootDir=ROOT_DIR] Repo root.
 * @returns {String[]} Problems; empty when every named path exists.
 */
export function unresolvedWitnessPaths(key, witness, rootDir = ROOT_DIR) {
    const refs     = witness.match(/\b(?:ai|src|apps|test|buildScripts|learn)\/[\w./-]*\.\w+/g) || [],
          problems = [];

    for (const ref of [...new Set(refs)]) {
        fs.existsSync(path.join(rootDir, ref)) ||
            problems.push(`${key}: witness names ${ref}, which does not exist — a witness that cannot be resolved is not evidence.`)
    }

    return problems
}

/**
 * Validates one registry entry.
 *
 * @summary BOTH a reason and a witness are required. That requirement is what keeps this an
 * acceptance registry rather than a suppression allowlist.
 * @param {String} key Registry key.
 * @param {Object} entry Registry entry.
 * @returns {String[]} Problems; empty when valid.
 */
export function validateEntry(key, entry) {
    const problems = [];

    if (!VALID_SHAPE.has(entry?.shape)) {
        problems.push(`${key}: shape must be one of ${[...VALID_SHAPE].join(' | ')} (got ${JSON.stringify(entry?.shape)})`)
    }

    if (!entry?.reason || typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
        problems.push(`${key}: reason is required — say WHY this read is accepted. An entry without one is a suppression, not an acceptance.`)
    }

    if (!entry?.witness || typeof entry.witness !== 'string' || entry.witness.trim().length === 0) {
        problems.push(`${key}: witness is required — name the code or spec that makes the acceptance checkable.`)
    } else {
        problems.push(...unresolvedWitnessPaths(key, entry.witness))
    }

    return problems
}

/**
 * Diffs discovered violations against the registry.
 *
 * @param {Object} options
 * @param {Object[]} options.violations Discovered violations.
 * @param {Object} options.registry Registry `sites` map.
 * @returns {{unregistered: Object[], stale: String[], invalid: String[], drifted: String[]}}
 */
export function diffRegistry({violations, registry}) {
    const
        discovered   = new Map(violations.map(v => [v.key, v])),
        registered   = Object.keys(registry),
        unregistered = violations.filter(v => !registry[v.key]),
        stale        = registered.filter(key => !discovered.has(key)),
        invalid      = registered.flatMap(key => validateEntry(key, registry[key])),

        // A registered site whose SHAPE changed is not the site that was accepted: a `truthy-skip`
        // becoming a `bare-read` turns silent skipping into a crash, and the old reason no longer
        // describes it.
        drifted = registered
            .filter(key => discovered.has(key) && discovered.get(key).shape !== registry[key]?.shape)
            .map(key => `${key}: registered as ${registry[key].shape}, now ${discovered.get(key).shape} — re-examine and re-accept.`);

    return {unregistered, stale, invalid, drifted}
}

/**
 * The registry ratchet: it may shrink freely and may not grow silently.
 *
 * @summary Asserting EQUALITY would be the obvious check and the wrong one — it would fail the moment
 * someone gives a site a discipline and removes its entry, blocking the shrinkage this registry
 * exists to enable. `baselineAtIntroduction` is a historical high-water mark, not a current count.
 *
 * A MISSING baseline is an error, not a pass. An earlier revision skipped the ratchet when the value
 * was absent or malformed, so deleting one line from the registry silently disabled the growth gate —
 * a carve-out that quiets a guard opens a channel nobody is watching.
 * @param {Object} options
 * @param {Number} options.accepted Current entry count.
 * @param {*} [options.baseline] `baselineAtIntroduction` as read from the registry.
 * @returns {String[]} Problems; empty when the ratchet holds.
 */
export function registryGrowthProblems({accepted, baseline}) {
    if (!Number.isInteger(baseline)) {
        return [
            `the registry declares no valid integer \`$schema.baselineAtIntroduction\` (got ${JSON.stringify(baseline)}). ` +
            'Without it the growth ratchet does not run, so an added acceptance would land silently.'
        ]
    }

    if (accepted <= baseline) {
        return []
    }

    return [
        `the registry GREW: ${accepted} accepted entries against a baseline of ${baseline}. Accepting a ` +
        'new undisciplined read is a deliberate act — add a discipline instead, or raise ' +
        '`baselineAtIntroduction` in the same commit with the reason in the PR body.'
    ]
}

/**
 * @param {String} [registryPath=REGISTRY_PATH]
 * @returns {Object} `{sites, baseline}`
 */
function loadRegistry(registryPath = REGISTRY_PATH) {
    if (!fs.existsSync(registryPath)) {
        return {sites: {}, baseline: null}
    }

    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

    return {sites: parsed.sites || {}, baseline: parsed.$schema?.baselineAtIntroduction}
}

/**
 * Runs the guard.
 *
 * @returns {{exitCode: Number}}
 */
export function runLint() {
    const
        violations                              = discoverViolations(),
        {sites, baseline}                       = loadRegistry(),
        {unregistered, stale, invalid, drifted} = diffRegistry({violations, registry: sites}),
        accepted                                = Object.keys(sites).length;

    invalid.push(...registryGrowthProblems({accepted, baseline}));

    if (unregistered.length === 0 && stale.length === 0 && invalid.length === 0 && drifted.length === 0) {
        console.log(`[lint-deferred-member-readiness] OK (${violations.length} undisciplined read(s), all accepted; baseline ${baseline})`);
        return {exitCode: 0}
    }

    console.error('[lint-deferred-member-readiness] FAILED');

    if (unregistered.length) {
        console.error(`\n  ${unregistered.length} deferred member(s) read through NEITHER readiness discipline:\n`);

        unregistered.forEach(v => {
            console.error(`    ${v.key}   [${v.shape}]`);
            console.error(`        ${v.file}:${v.line}  ${v.snippet}`)
        });

        console.error('\n  A member assigned in initAsync() is null until readiness. Give it a discipline —');
        console.error('  `await this.ready()` before the read, or an accessor that throws a typed error on the');
        console.error(`  member's absence path (see GraphService.requireDb) — or record it in ${REGISTRY_REL}`);
        console.error('  with a reason and a witness.\n')
    }

    if (drifted.length) {
        console.error(`  ${drifted.length} DRIFTED entr(ies) — the accepted read changed shape:\n`);
        drifted.forEach(problem => console.error(`    ${problem}`));
        console.error('')
    }

    if (stale.length) {
        console.error(`  ${stale.length} STALE registry entr(ies) — the read is gone, or its method/member was renamed:\n`);
        stale.forEach(key => console.error(`    ${key}`));
        console.error('\n  The registry must shrink visibly. A stale entry silently widens the accepted set.\n')
    }

    if (invalid.length) {
        console.error(`  ${invalid.length} INVALID registry entr(ies):\n`);
        invalid.forEach(problem => console.error(`    ${problem}`));
        console.error('')
    }

    return {exitCode: 1}
}

function main() {
    if (process.argv.includes('--list')) {
        discoverViolations().forEach(v => console.log(`${v.key}\t${v.shape}\t${v.file}:${v.line}\t${v.snippet}`));
        process.exit(0)
    }

    process.exit(runLint().exitCode)
}

// Import-safe, per the house pattern in `lint-retry-bounds.mjs` and `lint-guard-ci-parity.mjs`: the
// `scanned ⊆ watched` spec imports SCAN_SURFACE from this module, and a bare `process.exit()` at
// module scope would terminate the test process on import.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main()
}
