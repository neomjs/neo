#!/usr/bin/env node

import fs                    from 'node:fs';
import path                  from 'node:path';
import {parseArgs}           from 'node:util';
import isEntryModule         from '../util/isEntryModule.mjs';
import {planMove, applyMove} from '../util/movePlan.mjs';

/**
 * @module buildScripts/create/move
 * @summary Reviews a source relocation by default and applies only an explicitly requested, unblocked plan.
 */

const help = `Usage: npm run move-files -- --from <path> --to <path> [options]

  --from <path>                 Source file or folder, relative to the owned root
  --to <path>                   Exact destination, relative to the owned root
  --root <path>                 Owned repository/workspace root (default: cwd)
  --namespace <path=Namespace>  Declare namespace ownership; repeatable
  --reference-scopes <file>     JSON array of exact-source reference declarations
  --options <file>              JSON object with namespaceRoots and/or referenceScopes
  --apply                       Apply the checked plan; default is a read-only dry run
  --json                        Print before/after text and source-bound reference records
  --help                        Show this help

Option-file paths resolve from cwd. namespaceRoots entries accept path, namespace,
and optional appThemeFolder. Blocked plans exit nonzero and cannot be applied.

In a consuming workspace, run:
  node node_modules/neo.mjs/buildScripts/create/move.mjs --from <path> --to <path>

A reference-scopes entry contains file, start, expression and sourceHash copied
from --json's referenceLedger, plus roots (owned-root-relative directories) or
protocols (http:, https:, data:, node:). Declare the entire possible target domain,
not just a template's constant prefix. Intersecting, stale or unknown domains block.
`;

/**
 * @summary Loads declaration inputs without allowing option files to enable application or change the root.
 * @param {Object} values Parsed CLI values.
 * @returns {Object} Namespace roots and exact-source reference scopes.
 */
function declarations(values) {
    const read  = file => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')),
        options = values.options ? read(values.options) : {};

    if (!options || Array.isArray(options) || typeof options !== 'object' ||
        Object.keys(options).some(key => !['namespaceRoots', 'referenceScopes'].includes(key))) {
        throw new Error('--options accepts only namespaceRoots and referenceScopes');
    }
    const namespaceRoots = options.namespaceRoots ?? [], referenceScopes = options.referenceScopes ?? [],
        scopes           = values['reference-scopes'] ? read(values['reference-scopes']) : [];

    if (![namespaceRoots, referenceScopes, scopes].every(Array.isArray)) {
        throw new Error('namespaceRoots and referenceScopes must be JSON arrays');
    }
    for (const value of values.namespace ?? []) {
        const separator = value.indexOf('=');
        if (separator < 1 || separator === value.length - 1) throw new Error('--namespace requires path=Namespace');
        namespaceRoots.push({path: value.slice(0, separator), namespace: value.slice(separator + 1)});
    }
    for (const entry of namespaceRoots) {
        if (!entry || typeof entry.path !== 'string' || !entry.path ||
            typeof entry.namespace !== 'string' || !/^[$A-Z_a-z][$\w]*(?:\.[$A-Z_a-z][$\w]*)*$/.test(entry.namespace) ||
            entry.appThemeFolder !== undefined && (typeof entry.appThemeFolder !== 'string' || !entry.appThemeFolder)) {
            throw new Error('Namespace roots require path, namespace and an optional nonempty appThemeFolder');
        }
    }
    const paths = namespaceRoots.map(entry => path.resolve(values.root ?? process.cwd(), entry.path));
    if (new Set(paths).size !== paths.length) throw new Error('Namespace root declared more than once');
    if ([...referenceScopes, ...scopes].some(scope => !scope || typeof scope !== 'object' || Array.isArray(scope))) {
        throw new Error('Reference scopes must contain declaration objects');
    }
    return {namespaceRoots, referenceScopes: [...referenceScopes, ...scopes]}
}

/**
 * @summary Projects source bytes into reviewable text and keeps scope file identities relative to the owned root.
 * @param {Object} plan Checked relocation plan.
 * @param {Object|null} applied Application counts, or null for an unapplied plan.
 * @returns {Object} JSON-safe review document.
 */
function review(plan, applied) {
    const relative = file => path.isAbsolute(file) ? path.relative(plan.root, file).split(path.sep).join('/') : file,
        record     = item => ({...item, ...(item.file ? {file: relative(item.file)} : {})});

    return {
        root    : plan.root,
        applied,
        moves   : plan.moves.map(({from, to}) => ({from: relative(from), to: relative(to)})),
        rewrites: plan.rewrites.map(({from, to, before, after}) => ({from: relative(from), to: relative(to),
            before: before.toString('utf8'), after: after.toString('utf8')})),
        classNames     : plan.classNames,
        blockers       : plan.blockers.map(record),
        referenceLedger: plan.referenceLedger.map(record),
        readOnlyInputs : plan.readOnlyInputs.map(record),
        boundary       : plan.boundary
    }
}

/**
 * @summary Runs the flag-only move CLI and reports errors on stderr without bypassing planner guards.
 * @param {String[]} [args] Command-line arguments excluding node and script paths.
 * @returns {Number} Zero for a successful plan/application/help, one for refusal or invalid input.
 */
export function run(args=process.argv.slice(2)) {
    try {
        const {values} = parseArgs({args, options: {
            from     : {type: 'string'}, to: {type: 'string'}, root: {type: 'string'},
            namespace: {type: 'string', multiple: true}, 'reference-scopes': {type: 'string'},
            options  : {type: 'string'}, apply: {type: 'boolean'}, json: {type: 'boolean'}, help: {type: 'boolean'}
        }});
        if (values.help) {
            console.log(help);
            return 0
        }
        if (!values.from || !values.to) throw new Error('--from and --to are required; use --help for usage');
        const plan = planMove({root: values.root ?? process.cwd(), source: values.from, destination: values.to,
                ...declarations(values)}),
            applied = values.apply && !plan.blockers.length ? applyMove(plan) : null,
            output = review(plan, applied);

        if (values.json) console.log(JSON.stringify(output, null, 2));
        else {
            console.log(`${applied ? 'Move applied' : 'Move plan (dry run)'}\nRoot: ${output.root}`);
            console.log(`Moves (${output.moves.length}):`);
            output.moves.forEach(move => console.log(`  ${move.from} -> ${move.to}`));
            console.log(`Rewritten files (${output.rewrites.length}):`);
            output.rewrites.forEach(item => console.log(`  ${item.from} -> ${item.to}`));
            console.log(`Blockers (${output.blockers.length}):`);
            output.blockers.forEach(item => console.log(`  ${item.file ?? ''}: ${item.reason}`));
            console.log(`Scope boundary: ${output.boundary}`);
            if (!applied && !plan.blockers.length) console.log('Use --json for source changes or --apply to apply this plan.');
        }
        if (plan.blockers.length) {
            console.error(`Move blocked by ${plan.blockers.length} unresolved reference(s); no files changed.`);
            return 1
        }
        return 0
    } catch (error) {
        console.error(error.message);
        return 1
    }
}

if (isEntryModule(import.meta.url)) process.exitCode = run();
