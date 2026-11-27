#!/usr/bin/env node
/**
 * @module buildScripts/util/check-theme-radius-literals
 * @summary Fails when a structural rule of the engine files sets a corner radius to a literal length,
 * which no theme can reach.
 *
 * A structural rule reads component variables only, and a theme says its shape through them. A literal
 * `6px` in a structural rule keeps theme Neo's corner in every theme, and a model that
 * sets the component's radius variable sees nothing move. The reading is `radiusLiterals` in
 * `themeCss.mjs`, shared with `theme-census` (section 8): `border-radius`, its corner longhands, either
 * with a vendor prefix, and a `--*-border-radius` custom property re-valued in a structural file. `0`, the
 * CSS-wide keywords and values made of percentages only pass. `apps/` and `examples/` are out of scope.
 *
 * `ALLOWED` lists the literals that stay by design, each with its reason. An entry that no longer matches
 * fails the run, so the list can only shrink.
 *
 *     node buildScripts/util/check-theme-radius-literals.mjs [--root <resources/css/src>]
 */
import path                                from 'node:path';
import {fileURLToPath}                     from 'node:url';
import isEntryModule                       from './isEntryModule.mjs';
import {cssFiles, radiusLiterals, readCss} from './themeCss.mjs';

const
    dirname  = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot = path.resolve(dirname, '../..');

/**
 * Every tracked surface whose contents can change this guard's verdict, as repo-relative globs.
 * @type {String[]}
 */
export const SCAN_SURFACE = Object.freeze(['resources/css/src/**/*.css']);

/**
 * Literals that stay, keyed `<file relative to the src root>|<property>`, each with its reason.
 * @type {Object<String, String>}
 */
export const ALLOWED = Object.freeze({
    'dashboard/Container.css|--neo-dock-splitter-border-radius':
        'The dock\'s consumer floor on `.neo-dashboard`: a host that sets nothing still gets a findable splitter. ' +
        'Its values move to the themes together, with the dashboard package\'s theme-base move.'
});

/**
 * @summary Collects the literal corner radii of the structural rules under `srcRoot`, outside `apps/` and `examples/`.
 * @param {String} [srcRoot] The `resources/css/src` directory
 * @param {Object<String, String>} [allowed=ALLOWED] Literals that stay, keyed `<file>|<property>`
 * @returns {{offences: Object[], stale: String[]}} Offending literals as `{file, line, property, value}`, and allowed keys that matched nothing
 */
export function findRadiusLiterals(srcRoot=path.join(repoRoot, 'resources/css/src'), allowed=ALLOWED) {
    const matched  = new Set(),
          offences = [];

    for (const file of cssFiles(srcRoot)) {
        const rel = path.relative(srcRoot, file).split(path.sep).join('/');

        if (/^(apps|examples)\//.test(rel)) continue;

        for (const literal of radiusLiterals(readCss(file))) {
            const key = `${rel}|${literal.property}`;

            if (Object.hasOwn(allowed, key)) {
                matched.add(key)
            } else {
                offences.push({file: rel, ...literal})
            }
        }
    }

    return {offences, stale: Object.keys(allowed).filter(key => !matched.has(key))}
}

if (isEntryModule(import.meta.url)) {
    const
        args              = process.argv.slice(2),
        index             = args.indexOf('--root'),
        {offences, stale} = findRadiusLiterals(index === -1 ? undefined : path.resolve(args[index + 1] || ''));

    for (const {file, line, property, value} of offences) {
        console.error(`resources/css/src/${file}:${line}  ${property}: ${value}  — read a component variable, and declare its value in every theme folder`)
    }

    for (const key of stale) {
        console.error(`ALLOWED entry "${key}" matches no literal any more — delete it`)
    }

    if (offences.length || stale.length) {
        console.error(`check-theme-radius-literals: ${offences.length} literal corner radii, ${stale.length} stale allowed entries`);
        process.exit(1)
    }

    console.log(`check-theme-radius-literals: no literal corner radius in the engine's structural rules (${Object.keys(ALLOWED).length} allowed by design)`)
}
