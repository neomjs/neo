#!/usr/bin/env node

/**
 * @summary Requires every `ai/scripts` script to declare the execution plane it needs, and fails
 * when that declaration contradicts what the script's own dependencies prove.
 *
 * A script's plane decides whether it is usable at all: per Local Runtime Parity a client topology
 * has no host shell and no Docker socket. The `ai/scripts` taxonomy is verb-named (`maintenance`,
 * `diagnostics`) and answers a different question, so before this guard the only way to learn where
 * a script runs was to open it — across 144 files in 9 directories, 5 of them mixed.
 *
 * **This is a comparator, not a convention.** The declaration is read from the script's COMMENTS and
 * the evidence from its CODE, and those two texts are disjoint by construction — so no amount of
 * confident documentation can move the evidence. A README would rot on the first commit with nothing
 * detecting the rot, and a naming convention is graded by whoever follows it — both are rules whose
 * only evidence of compliance is the performer's own account of it.
 *
 * Only the checkable direction is enforced. `declares in-plane` + host evidence is a contradiction —
 * the script claims to run where it demonstrably cannot. The reverse is NOT: an operator-run script
 * may legitimately import plane modules and talk to services over the network. The full asymmetry
 * argument, and the 15 measured scripts that shell out AND import a plane module, are documented in
 * `scriptSource.mjs`.
 *
 * @plane in-plane
 */

import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {PLANE_VALUES, classifyPlane, readDeclaredPlane, stripComments} from './scriptSource.mjs';

const __filename = fileURLToPath(import.meta.url),
      SCAN_ROOT  = 'ai/scripts';

/**
 * Recursively collects every `.mjs` file under a root.
 *
 * The population is read from the FILESYSTEM rather than from a registry, which is what makes the
 * coverage assertion self-maintaining: a newly added script is in scope the moment it exists, so it
 * cannot pass by being absent from a list somebody forgot to update.
 * @param {string} absoluteRoot
 * @param {string} cwd
 * @returns {string[]} Repo-relative POSIX paths, sorted.
 */
export function collectScripts(absoluteRoot, cwd) {
    const found = [];

    function visit(directory) {
        fs.readdirSync(directory, {withFileTypes: true})
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(entry => {
                const entryPath = path.join(directory, entry.name);

                if (entry.isDirectory()) {
                    visit(entryPath);
                } else if (entry.name.endsWith('.mjs')) {
                    found.push(path.relative(cwd, entryPath).split(path.sep).join('/'));
                }
            });
    }

    visit(absoluteRoot);

    return found.sort();
}

/**
 * Checks one script's declaration against its evidence.
 * @param {Object} params
 * @param {string} params.file Repo-relative path.
 * @param {string} params.content Raw source.
 * @param {string} [params.cwd]
 * @returns {(Object|null)} A finding, or `null` when the script is consistent.
 */
export function auditScript({file, content, cwd=process.cwd()}) {
    const {plane: declared, invalid, conflicting} = readDeclaredPlane(content, file);

    if (conflicting) {
        return {
            file,
            rule   : 'CONFLICTING_TAG',
            message: `declares more than one @plane value. Exactly one of ${PLANE_VALUES.join(' | ')} is legal.`
        };
    }

    if (invalid.length > 0 && !declared) {
        return {
            file,
            rule   : 'INVALID_TAG',
            message: `@plane ${invalid[0]} is not a legal value. Use ${PLANE_VALUES.join(' or ')}.`
        };
    }

    if (!declared) {
        return {
            file,
            rule   : 'MISSING_TAG',
            message: `no @plane declaration. Add \`@plane host\` if it needs the operator's shell, Docker socket or home directory, otherwise \`@plane in-plane\`.`
        };
    }

    const {plane: evidenced, evidence} = classifyPlane({file, code: stripComments(content, file), cwd});

    if (declared === 'in-plane' && evidenced === 'host') {
        return {
            file,
            rule   : 'CONTRADICTION',
            message: `declares @plane in-plane but ${evidence.join('; ')} — that is a host requirement, so a client topology cannot run it.`
        };
    }

    return null;
}

/**
 * Audits every script under the scan root.
 * @param {Object} [params]
 * @param {string} [params.cwd]
 * @returns {{findings: Object[], scanned: number, declared: number}}
 */
export function lintScriptPlanes({cwd=process.cwd()} = {}) {
    const files    = collectScripts(path.resolve(cwd, SCAN_ROOT), cwd),
          findings = [];

    files.forEach(file => {
        const content = fs.readFileSync(path.resolve(cwd, file), 'utf8'),
              finding = auditScript({file, content, cwd});

        if (finding) {
            findings.push(finding);
        }
    });

    // A script is DECLARED iff it carries exactly one legal tag — precisely the complement of the
    // three declaration rules. CONTRADICTION is not among them: that script declared, and lied.
    const undeclared = findings.filter(
        finding => ['MISSING_TAG', 'INVALID_TAG', 'CONFLICTING_TAG'].includes(finding.rule)
    ).length;

    return {findings, scanned: files.length, declared: files.length - undeclared};
}

/**
 * Runs the lint and reports.
 * @param {Object} [params]
 * @param {string} [params.cwd]
 * @param {Object} [params.console]
 * @returns {{exitCode: number}}
 */
export function runLint({cwd=process.cwd(), console: out=console} = {}) {
    const {findings, scanned, declared} = lintScriptPlanes({cwd});

    if (findings.length === 0) {
        out.log(`[lint-script-plane] OK — ${declared}/${scanned} scripts declare an execution plane, none contradicted by its own dependencies.`);

        return {exitCode: 0};
    }

    out.error(`[lint-script-plane] FAILED — ${findings.length} of ${scanned} scripts (${declared} declared):`);

    findings.forEach(finding => {
        out.error(`  ${finding.rule}  ${finding.file}`);
        out.error(`      ${finding.message}`);
    });

    return {exitCode: 1};
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    if (process.argv.includes('--help')) {
        console.log('Usage: node ai/scripts/lint/lint-script-plane.mjs');
        console.log('');
        console.log(`Every .mjs under ${SCAN_ROOT} declares where it can run, and the declaration is checked:`);
        console.log('  1. MISSING_TAG      every script carries @plane host or @plane in-plane');
        console.log('  2. INVALID_TAG      no other value is legal — two values, never a catch-all third');
        console.log('  3. CONFLICTING_TAG  a script declares exactly one plane');
        console.log('  4. CONTRADICTION    @plane in-plane is refuted by a host dependency in the same file');
        process.exit(0);
    }

    const {exitCode} = runLint();

    process.exit(exitCode);
}
