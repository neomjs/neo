#!/usr/bin/env node
/**
 * @module buildScripts/util/theme-census
 * @summary Counts the shape of the theme tree so that a number deciding the design system comes from one
 * instrument any reviewer can re-run, instead of a private script per seat.
 *
 * Eight sections: custom properties per layer, what an engine component value is made of, what a light
 * and dark pair differ in, the component names every full theme declares, declarations no CSS reads,
 * structural reads without a fallback that nothing declares, colour literals in structural rules, and
 * the words that name a background, a text colour, an icon colour and a state.
 *
 * A report, not a guard: a finding never fails the run, and there is no baseline and no workflow. A rule
 * worth enforcing becomes its own guard once the design system names it.
 *
 * Reading rules: comments are stripped (`themeCss.mjs`, shared with the theme guards); a declaration is
 * `--name: value;`; a read is `var(--name` followed by `,` (a fallback) or `)` (none); a colour literal
 * is a hex colour or an `rgb()` / `rgba()` / `hsl()` / `hsla()` call. A theme or structural file below
 * `apps/` or `examples/` belongs to that area, every other one to `engine`. A name declared more than
 * once in an area takes its first declaration in sorted file order, and section 1 counts those names
 * and the ones declared again with another value. A full theme is one of a light and dark pair, named
 * alike but for its last word.
 *
 *     npm run theme-census                   Markdown tables for resources/css
 *     npm run theme-census -- --json         the census object
 *     npm run theme-census -- --root <dir>   another tree holding src/ and theme-* directories
 */
import fs                                      from 'node:fs';
import path                                    from 'node:path';
import {fileURLToPath}                         from 'node:url';
import isEntryModule                           from './isEntryModule.mjs';
import {RUNTIME_PROPERTIES, cssFiles, readCss} from './themeCss.mjs';

const
    cssRoot     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../resources/css'),
    AREAS       = ['engine', 'apps', 'examples'],
    LAYERS      = ['palette', 'sem', 'cmp', 'component'],
    DECLARATION = /(?<![\w-])(--[A-Za-z0-9_-]+)\s*:\s*([^;{}]+);/g,
    READ        = /var\(\s*(--[A-Za-z0-9_-]+)\s*([,)])/g,
    COLOUR      = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g,
    // the primitive scales and the `--core-*` aliases a theme's palette declares
    PALETTE     = /^--(core-|gray-|purple-|green-|red-|orange-|yellow-|blue-|spacing-|height-|borderradius-|white|black|Transparent)/,
    STATES      = new Set(['hover', 'active', 'disabled', 'pressed', 'selected', 'focus', 'focused', 'checked', 'invalid', 'readonly']),
    // per meaning, the first word whose pattern a name matches
    WORDS       = {
        background: [['background-color', /-background-color(-|$)/], ['background', /-background(-|$)/], ['bg', /-bg(-|$)/], ['surface', /-surface(-|$)/]],
        text      : [['text-color', /-text-color(-|$)/], ['font-color', /-font-color(-|$)/], ['fg', /-fg(-|$)/], ['text', /-text(-|$)/], ['color', /(?<!background)(?<!border)(?<!glyph)(?<!icon)-color(-|$)/]],
        icon      : [['glyph-color', /-glyph-color(-|$)/], ['icon-color', /-icon-color(-|$)/]]
    };

/**
 * @param {String} name
 * @returns {String} `palette`, `sem`, `cmp` or `component`
 */
function layerOf(name) {
    return name.startsWith('--sem-') ? 'sem' : name.startsWith('--cmp-') ? 'cmp' : PALETTE.test(name) ? 'palette' : 'component'
}

/**
 * @param {String} dir
 * @param {String} file
 * @returns {String} `engine`, `apps` or `examples`
 */
function areaOf(dir, file) {
    const first = path.relative(dir, file).split(path.sep)[0];

    return first === 'apps' || first === 'examples' ? first : 'engine'
}

/**
 * @param {Function} create
 * @returns {Object} One value per area, made by `create`.
 */
function perArea(create) {
    return Object.fromEntries(AREAS.map(area => [area, create(area)]))
}

/**
 * @param {String} css
 * @returns {Number} The colour literals in `css`.
 */
function colourCount(css) {
    return css.match(COLOUR)?.length ?? 0
}

/**
 * @summary Reads one directory of stylesheets: per area, its files, its declarations (first value per
 * name), the names declared again and the ones declared again with another value, and its reads
 * (name → whether some read has no fallback).
 * @param {String} dir
 * @returns {Object}
 */
function readTree(dir) {
    const
        files      = perArea(() => 0),
        declared   = perArea(() => new Map()),
        redeclared = perArea(() => new Set()),
        conflicts  = perArea(() => new Set()),
        reads      = perArea(() => new Map()),
        css        = {};

    for (const file of cssFiles(dir)) {
        const area = areaOf(dir, file), text = readCss(file);

        files[area]++;
        css[path.relative(dir, file).replaceAll('\\', '/')] = {area, text};

        for (const [, name, raw] of text.matchAll(DECLARATION)) {
            const value = raw.split(/\s+/).filter(Boolean).join(' ');

            if (!declared[area].has(name)) {
                declared[area].set(name, value)
            } else {
                redeclared[area].add(name);
                // which value wins is then a matter of load order and specificity, not of the theme file
                declared[area].get(name) === value || conflicts[area].add(name)
            }
        }

        for (const [, name, close] of text.matchAll(READ)) {
            reads[area].set(name, reads[area].get(name) || close === ')')
        }
    }

    return {files, declared, redeclared, conflicts, reads, css}
}

/**
 * @param {Map<String,String>} declared
 * @param {String} layer
 * @returns {Map<String,String>} The entries of `layer`.
 */
function inLayer(declared, layer) {
    return new Map([...declared].filter(([name]) => layerOf(name) === layer))
}

/**
 * @param {String} value
 * @returns {String} What a component value is made of.
 */
function compositionOf(value) {
    const refs = [...value.matchAll(READ)].map(([, name]) => layerOf(name));

    if (!refs.length) {
        return colourCount(value) ? 'colourLiteral' : 'literal'
    }

    return refs.includes('cmp') ? 'cmp' : refs.includes('sem') ? 'sem' : refs.includes('palette') ? 'palette' : 'variable'
}

/**
 * @param {String[]} names Component names.
 * @returns {Object} Counts per word for a background, a text colour and an icon colour, and where a state word sits.
 */
function namingOf(names) {
    const naming = Object.fromEntries(Object.keys(WORDS).map(meaning => [meaning, {}]));

    naming.state = {last: 0, elsewhere: 0};

    for (const name of names) {
        for (const [meaning, words] of Object.entries(WORDS)) {
            const word = words.find(([, pattern]) => pattern.test(name))?.[0];

            word && (naming[meaning][word] = (naming[meaning][word] || 0) + 1)
        }

        const
            parts  = name.slice(2).split('-'),
            states = parts.map((part, index) => index > 0 && STATES.has(part) ? index : -1).filter(index => index > 0);

        states.length && naming.state[states.at(-1) === parts.length - 1 ? 'last' : 'elsewhere']++
    }

    return naming
}

/**
 * @summary Counts the theme tree under `root`. Pure over the filesystem: no logging, no exit.
 * @param {Object} [options]
 * @param {String} [options.root=resources/css] Holds `src/` and the `theme-*` directories.
 * @param {Object<String,String>} [options.runtimeProperties=RUNTIME_PROPERTIES] Read although no CSS declares them.
 * @returns {Object} `{themes, pairs, shared, structural}`, plain JSON.
 */
export function collectThemeCensus({root = cssRoot, runtimeProperties = RUNTIME_PROPERTIES} = {}) {
    const
        srcDir = path.join(root, 'src'),
        names  = fs.existsSync(root) ? fs.readdirSync(root).filter(name => name.startsWith('theme-')).sort() : [];

    // reading nothing must never look like a tree without findings
    if (!names.length || !fs.existsSync(srcDir)) {
        throw new Error(`theme-census: ${root} needs src/ and at least one theme-* directory`)
    }

    const
        src       = readTree(srcDir),
        trees     = Object.fromEntries(names.map(name => [name, readTree(path.join(root, name))])),
        readNames = new Set([src, ...Object.values(trees)].flatMap(tree => AREAS.flatMap(area => [...tree.reads[area].keys()]))),
        srcNames  = new Set(AREAS.flatMap(area => [...src.declared[area].keys()])),
        pairs     = names.filter(name => /dark$/.test(name) && names.includes(name.replace(/dark$/, 'light'))).map(dark => ({dark, light: dark.replace(/dark$/, 'light')})),
        full      = pairs.flatMap(({dark, light}) => [dark, light]).sort(),
        themes    = {};

    for (const name of names) {
        const
            tree        = trees[name],
            engine      = inLayer(tree.declared.engine, 'component'),
            themeNames  = new Set(AREAS.flatMap(area => [...tree.declared[area].keys()])),
            composition = Object.fromEntries(['sem', 'cmp', 'palette', 'variable', 'colourLiteral', 'literal'].map(kind => [kind, 0]));

        engine.forEach(value => composition[compositionOf(value)]++);

        themes[name] = {
            files      : tree.files,
            properties : perArea(area => ({...Object.fromEntries(LAYERS.map(layer => [layer, inLayer(tree.declared[area], layer).size])), total: tree.declared[area].size})),
            redeclared : perArea(area => ({count: tree.redeclared[area].size, conflicting: [...tree.conflicts[area]].sort()})),
            composition: {...composition, total: engine.size},
            unread     : perArea(area => Object.fromEntries(LAYERS.map(layer => [layer, [...inLayer(tree.declared[area], layer).keys()].filter(property => !readNames.has(property)).sort()]))),
            unresolved : perArea(area => [...src.reads[area]].filter(([property, bare]) => bare && !themeNames.has(property) && !srcNames.has(property) && !(property in runtimeProperties)).map(([property]) => property).sort()),
            naming     : namingOf([...engine.keys()])
        }
    }

    return {
        themes,
        pairs: pairs.map(({dark, light}) => ({
            dark,
            light,
            layers: Object.fromEntries(LAYERS.map(layer => {
                const a = inLayer(trees[dark].declared.engine, layer), b = inLayer(trees[light].declared.engine, layer), both = [...a.keys()].filter(property => b.has(property));

                return [layer, {
                    shared   : both.length,
                    identical: both.filter(property => a.get(property) === b.get(property)).length,
                    differ   : both.filter(property => a.get(property) !== b.get(property)).length,
                    onlyDark : a.size - both.length,
                    onlyLight: b.size - both.length
                }]
            }))
        })),
        shared: {
            themes   : full,
            component: full.length ? [...inLayer(trees[full[0]].declared.engine, 'component').keys()].filter(property => full.every(theme => trees[theme].declared.engine.has(property))).length : 0
        },
        structural: {
            files         : src.files,
            colourLiterals: Object.fromEntries(Object.entries(src.css)
                .filter(([, {area}]) => area === 'engine')
                .map(([file, {text}]) => [file, colourCount(text.replace(DECLARATION, ''))])
                .filter(([, count]) => count > 0)
                .sort(([fileA, countA], [fileB, countB]) => countB - countA || fileA.localeCompare(fileB)))
        }
    }
}

/**
 * @param {String[]} header
 * @param {Array[]} rows
 * @returns {String} A Markdown table.
 */
function table(header, rows) {
    return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map(row => `| ${row.join(' | ')} |`)].join('\n')
}

/**
 * @param {Object} counts word → count
 * @returns {String} `word n · word n`, most used first.
 */
function words(counts) {
    return Object.entries(counts).sort(([, a], [, b]) => b - a).map(([word, count]) => `\`${word}\` ${count}`).join(' · ') || '—'
}

/**
 * @summary Renders a census as Markdown, one table per section.
 * @param {Object} census From {@link collectThemeCensus}.
 * @param {String} [label='resources/css'] The measured tree as the heading names it: a relative path, so
 * that a pasted report carries no local home directory.
 * @returns {String}
 */
export function renderCensus(census, label = 'resources/css') {
    const
        names     = Object.keys(census.themes),
        layerHead = ['Palette', '`--sem-*`', '`--cmp-*`', 'Component'],
        literals  = Object.entries(census.structural.colourLiterals),
        runtime   = Object.keys(RUNTIME_PROPERTIES).map(property => `\`${property}\``).join(', ');

    return [
        `# Theme census: \`${label}\``,
        `${names.length} themes; full themes (light and dark pairs): ${census.shared.themes.join(', ') || 'none'}.`,
        '## 1. Files and unique custom properties per layer',
        table(['Theme', 'Area', 'Files', ...layerHead, 'Unique', 'Declared again (another value)'], names.flatMap(name => AREAS.map(area => {
            const {files, properties, redeclared} = census.themes[name];

            return [name, area, files[area], ...LAYERS.map(layer => properties[area][layer]), properties[area].total, `${redeclared[area].count} (${redeclared[area].conflicting.length})`]
        }))),
        '## 2. What an engine component value is made of',
        table(['Theme', 'Values', 'via `--sem-*`', 'via `--cmp-*`', 'via palette', 'via another variable', 'Colour literal', 'Other literal'], names.map(name => {
            const {sem, cmp, palette, variable, colourLiteral, literal, total} = census.themes[name].composition;

            return [name, total, sem, cmp, palette, variable, colourLiteral, literal]
        })),
        '## 3. Light and dark pairs (engine files)',
        table(['Pair', 'Layer', 'Shared names', 'Identical', 'Differ', 'Only dark', 'Only light'], census.pairs.flatMap(({dark, light, layers}) => LAYERS.map(layer => {
            const {shared, identical, differ, onlyDark, onlyLight} = layers[layer];

            return [`${dark} / ${light}`, layer, shared, identical, differ, onlyDark, onlyLight]
        }))),
        '## 4. Component names every full theme declares (engine files)',
        `${census.shared.component} names.`,
        '## 5. Declared and never read by any CSS under the root (unread of declared)',
        table(['Theme', 'Area', ...layerHead], names.flatMap(name => AREAS.map(area => {
            const {properties, unread} = census.themes[name];

            return [name, area, ...LAYERS.map(layer => `${unread[area][layer].length} of ${properties[area][layer]}`)]
        }))),
        '## 6. Structural reads without a fallback that neither the theme nor a structural file declares',
        `Set at runtime, so not counted: ${runtime}.`,
        table(['Theme', 'Engine', 'Apps', 'Examples', 'Engine names (up to 8)'], names.map(name => {
            const {unresolved} = census.themes[name];

            return [name, ...AREAS.map(area => unresolved[area].length), unresolved.engine.slice(0, 8).map(property => `\`${property}\``).join(', ') || '—']
        })),
        '## 7. Colour literals in structural rules (engine files)',
        `${literals.reduce((sum, [, count]) => sum + count, 0)} in ${literals.length} files.`,
        table(['File', 'Literals'], literals.map(([file, count]) => [`\`${file}\``, count])),
        '## 8. Naming (engine component names)',
        table(['Theme', 'A background', 'A text colour', 'An icon colour', 'State word last', 'State word elsewhere'], names.map(name => {
            const {background, text, icon, state} = census.themes[name].naming;

            return [name, words(background), words(text), words(icon), state.last, state.elsewhere]
        }))
    ].join('\n\n') + '\n'
}

if (isEntryModule(import.meta.url)) {
    const
        args  = process.argv.slice(2),
        index = args.indexOf('--root');

    if (index !== -1 && !args[index + 1]) {
        console.error('theme-census: --root needs a directory');
        process.exit(1)
    }

    const
        root   = index === -1 ? cssRoot : path.resolve(args[index + 1]),
        census = collectThemeCensus({root});

    process.stdout.write(args.includes('--json') ? JSON.stringify(census, null, 4) + '\n' : renderCensus(census, path.relative(process.cwd(), root) || '.'))
}
