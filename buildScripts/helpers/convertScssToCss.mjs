import {execFileSync}  from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {createRequire} from 'node:module';

/**
 * @summary One-shot converter of the 14.0 clean cut: turns a repository's
 * `resources/scss` theme sources into plain CSS that keeps nesting, and proves that each converted file
 * compiles to what its original compiles to.
 *
 * It needs Sass, so it leaves the tree in the commit that removes Sass. Consumers run it from the pull
 * request's first commit:
 *
 *     [TOOLS=<neo checkout>] [OUT=<dir>] node buildScripts/helpers/convertScssToCss.mjs [repo] [ref]
 *
 * `repo` defaults to the working directory, `ref` to `HEAD`; `ref` `.` reads `repo`'s working tree instead of
 * a commit. `TOOLS` is a checkout whose `node_modules`
 * hold sass, postcss, postcss-scss and autoprefixer (default: `repo`). `OUT`, when set, receives the
 * converted tree as `<OUT>/resources/css/**.css`.
 *
 * - `//` comments become block comments; adjacent line comments become one block.
 * - Mixins are inlined with their arguments bound; a `@use`d module that emits CSS is inlined once;
 *   `sass:*` modules and member-only partials are dropped.
 * - Every value, selector and query holding Sass script takes what Sass computes for it.
 * - D2, D3: a top-level node holding a nested rule under a parent list of mixed specificity, or a
 *   declaration after a nested node, takes Sass's flattened output in place.
 * - D4: a file with control flow or an `&-suffix` selector takes Sass's compiled output, comments kept.
 *
 * Equality is the normalized text through autoprefixer, comments removed. The exit code is 1 when a file
 * differs or fails.
 */
const
    [repo = process.cwd(), ref = 'HEAD'] = process.argv.slice(2),
    req          = createRequire(path.join(process.env.TOOLS || repo, 'package.json')),
    sass         = req('sass'),
    postcss      = req('postcss'),
    postcssScss  = req('postcss-scss'),
    autoprefixer = req('autoprefixer'),
    git          = (...args) => execFileSync('git', args, {cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024}),
    SCRIPT       = /\$[\w-]|#\{|\b(?:color|math|string|list|map|meta)\.[a-z-]+\(/,
    LOGIC        = /^\s*\$[\w-]+\s*:|@use\b|@(?:include|mixin|function|each|if|for|while|extend|forward)\b|#\{|\b(?:color|math)\.[a-z-]+\(|&[-_]\w/m,
    FALLBACK     = /@(?:each|if|for|while|function|extend)\b|&[-_]\w/;

/**
 * @summary The comparable form of compiled CSS: comments, the charset and whitespace removed, empty rules dropped.
 * @param {String} css
 * @returns {String}
 */
function normalize(css) {
    let out = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@charset "UTF-8";/g, '').replace(/\s+/g, ' ').replace(/\s*([{};:,>])\s*/g, '$1').trim(),
        prev;

    do {
        prev = out;
        out  = out.replace(/(^|[{}])[^{}]+\{\}/g, '$1')
    } while (out !== prev);

    return out
}

/**
 * @summary Runs autoprefixer as the theme build does, so equality holds for what the build ships.
 * @param {String} css
 * @returns {Promise<String>}
 */
async function prefix(css) {
    return (await postcss([autoprefixer]).process(css, {from: undefined})).css
}

/**
 * @summary Doubles Sass's two-space indentation to the four spaces of the theme sources. Sass shifts the
 * continuation lines of a multi-line comment by its own re-nesting, so they are aligned again under the
 * comment's first line (`*`-led lines one column in, prose three).
 * @param {String} css Sass output.
 * @returns {String}
 */
function reindent(css) {
    let base = null;

    return css.replace(/^@charset "UTF-8";\n/, '').replace(/^ +/gm, spaces => spaces + spaces).split('\n').map(line => {
        if (base !== null) {
            const text = line.trimStart(), aligned = text && ' '.repeat(base + (text.startsWith('*') ? 1 : 3)) + text;

            if (text.includes('*/')) base = null;

            return aligned
        }

        const open = line.indexOf('/*');

        if (open !== -1 && !line.includes('*/', open + 2)) base = line.length - line.trimStart().length;

        return line
    }).join('\n')
}

/**
 * @summary Resolves a `@use` or `@forward` URL as Sass does: the file, its partial, or the folder's `_index`.
 * @param {String} fromFile Absolute path of the file holding the rule.
 * @param {String} url
 * @returns {String|null}
 */
function resolveModule(fromFile, url) {
    const base = path.resolve(path.dirname(fromFile), url.replace(/\.scss$/, ''));

    for (const candidate of [`${base}.scss`, path.join(path.dirname(base), `_${path.basename(base)}.scss`), path.join(base, '_index.scss')]) {
        if (fs.existsSync(candidate)) return candidate
    }

    return null
}

/**
 * @summary The mixin name of a `@mixin` or `@include` parameter string.
 * @param {String} params
 * @returns {String}
 */
function mixinName(params) {
    return params.trim().match(/^[\w-]+/)[0]
}

/**
 * @summary Collects the variables and mixins a file reaches through its `@use` and `@forward` chain.
 * @param {String} file Absolute path.
 * @param {Set<String>} [seen]
 * @returns {{vars: String[], mixins: Map<String, {file: String, node: Object}>}}
 */
function moduleMembers(file, seen = new Set()) {
    if (seen.has(file)) return {vars: [], mixins: new Map()};

    seen.add(file);

    const ast = postcssScss.parse(fs.readFileSync(file, 'utf8')), vars = [], mixins = new Map();

    ast.each(node => {
        if (node.type === 'decl' && node.prop.startsWith('$')) {
            vars.push(`${node.prop}: ${node.value};`)
        } else if (node.type === 'atrule' && node.name === 'mixin') {
            mixins.set(mixinName(node.params), {file, node})
        } else if (node.type === 'atrule' && ['use', 'forward'].includes(node.name)) {
            const url    = node.params.match(/['"]([^'"]+)['"]/)?.[1],
                  target = url && !url.startsWith('sass:') && resolveModule(file, url);

            if (target) {
                const sub = moduleMembers(target, seen);

                vars.push(...sub.vars);
                sub.mixins.forEach((mixin, name) => mixins.set(name, mixin))
            }
        }
    });

    return {vars, mixins}
}

/**
 * @summary Whether a module emits CSS of its own, which is then inlined once.
 * @param {String} file Absolute path.
 * @returns {Boolean}
 */
function emitsCss(file) {
    return sass.compile(file, {style: 'expanded'}).css.trim().length > 0
}

/**
 * @summary Compiles a probe with a file's variables in scope.
 * @param {String} file Absolute path, for module resolution.
 * @param {String[]} vars `$name: value;` lines.
 * @param {String} wrap The probe body.
 * @returns {String} Sass's expanded output.
 */
function probe(file, vars, wrap) {
    return sass.compileString(`@use 'sass:color';\n@use 'sass:math';\n${vars.join('\n')}\n${wrap}`, {style: 'expanded', url: new URL('file://' + file)}).css
}

/**
 * @summary Replaces Sass script in a declaration value, a selector or a media, container or supports
 * query with what Sass computes for it.
 * @param {String} file Absolute path.
 * @param {String[]} vars `$name: value;` lines in scope.
 * @param {Object} node A postcss node.
 */
function evaluate(file, vars, node) {
    if (node.type === 'decl' && !node.prop.startsWith('$') && SCRIPT.test(node.value)) {
        const match = probe(file, vars, `__probe__ { ${node.prop}: ${node.value}; }`).match(/__probe__ \{\s*([\s\S]*?);?\s*\}/);

        if (!match) throw new Error(`probe failed: ${node.prop}: ${node.value}`);

        node.value = match[1].slice(match[1].indexOf(':') + 1).trim().replace(/;$/, '')
    } else if (node.type === 'rule' && SCRIPT.test(node.selector)) {
        const css = probe(file, vars, `${node.selector} { __p: 1; }`);

        node.selector = css.slice(0, css.indexOf('{')).trim()
    } else if (node.type === 'atrule' && ['media', 'container', 'supports'].includes(node.name) && SCRIPT.test(node.params)) {
        const css = probe(file, vars, `@${node.name} ${node.params} { __p { a: b; } }`);

        node.params = css.slice(css.indexOf('@') + node.name.length + 1, css.indexOf('{')).trim()
    }
}

/**
 * @summary The comparable form of a value: whitespace, quote style and leading zeros do not change what a
 * browser reads.
 * @param {String} value
 * @returns {String}
 */
function valueKey(value) {
    return value.replace(/\s+/g, ' ').replace(/\s*([,()/*])\s*/g, '$1').replace(/'/g, '"').replace(/(^|[^\w.])\.(\d)/g, '$10.$2').trim().toLowerCase()
}

/**
 * @summary Makes the source read in a browser as Sass's output reads. Sass accepts more than CSS: it
 * computes values (`rgba(#fff, .5)`, unit arithmetic, its own functions) and drops empty selector-list
 * entries, while a browser rejects such a declaration or rule outright. Equality under Sass cannot see
 * this, so every value takes what Sass computes for it where the two differ, and empty selector entries
 * are dropped. Exempt: custom properties, whose values Sass passes through, and CSS math functions, which
 * Sass only simplifies and a browser computes alike.
 * @param {Object} ast
 * @returns {String[]} `property: before → after` per adopted value.
 */
function adoptSassReadings(ast) {
    const adopted = [];

    ast.walkRules(rule => {
        const selectors = rule.selectors.filter(selector => selector.trim() !== '');

        if (selectors.length !== rule.selectors.length) {
            adopted.push(`selector: ${rule.selector.replace(/\s+/g, ' ')} → ${selectors.join(', ')}`);
            rule.selectors = selectors
        }
    });

    ast.walkDecls(decl => {
        if (decl.prop.startsWith('--') || decl.prop.startsWith('$') || /\b(?:calc|min|max|clamp)\(/.test(decl.value)) return;

        const match = sass.compileString(`__probe__ { ${decl.prop}: ${decl.value}; }`, {style: 'expanded'}).css.match(/__probe__ \{\s*[^:]+:\s*([\s\S]*?);?\s*\}/),
              value = match?.[1].trim();

        if (value === undefined) throw new Error(`probe failed: ${decl.prop}: ${decl.value}`);

        if (valueKey(value) !== valueKey(decl.value)) {
            adopted.push(`${decl.prop}: ${decl.value} → ${value}`);
            decl.value = value
        }
    });

    return adopted
}

/**
 * @summary `$name: value;` lines binding a mixin's parameters to an include's arguments (positional,
 * keyword, defaults).
 * @param {Object} mixin The `@mixin` node.
 * @param {Object} include The `@include` node.
 * @returns {String[]}
 */
function bindArguments(mixin, include) {
    const
        split  = list => list ? list.split(/,(?![^(]*\))/).map(part => part.trim()).filter(Boolean) : [],
        params = split(mixin.params.trim().match(/^[\w-]+\s*\(([\s\S]*)\)\s*$/)?.[1]),
        args   = split(include.params.trim().match(/^[\w-]+\s*\(([\s\S]*)\)\s*$/)?.[1]);

    return params.map((param, index) => {
        const
            [name, fallback] = param.split(/:(.*)/s).map(part => part?.trim()),
            keyword          = args.find(arg => arg.startsWith(name + ':')),
            value            = keyword
                ? keyword.slice(name.length + 1).trim()
                : args[index] && !/^\$[\w-]+\s*:/.test(args[index]) ? args[index] : fallback;

        if (value === undefined) throw new Error(`no value for ${name} in @include ${include.params}`);

        return `${name}: ${value};`
    })
}

/**
 * @summary The specificity of one selector as an `a,b,c` key; pseudo-class arguments are ignored.
 * @param {String} selector
 * @returns {String}
 */
function specificity(selector) {
    const flat = selector.replace(/\([^)]*\)/g, '()');

    return [
        (flat.match(/#[\w-]+/g) || []).length,
        (flat.match(/(\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+)/g) || []).length,
        (flat.match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length + (flat.match(/::[\w-]+/g) || []).length
    ].join(',')
}

/**
 * @summary D2: native nesting wraps a parent selector list in `:is()`, so a list of mixed specificity
 * raises the lower ones.
 * @param {Object} rule
 * @returns {Boolean}
 */
function isSpecificitySensitive(rule) {
    return rule.parent?.type === 'rule' && rule.parent.selectors.length > 1 &&
        new Set(rule.parent.selectors.map(specificity)).size > 1
}

/**
 * @summary D3: a declaration after a nested node is a nested-declarations block where browsers support one
 * and is hoisted above it where they do not. Property names cannot tell when moving it is safe, since a
 * shorthand also sets its longhands, so the containing rule is flattened.
 * @param {Object} rule
 * @returns {Boolean}
 */
function hasTrailingDeclaration(rule) {
    let sawNested = false;

    return (rule.nodes ?? []).some(node => {
        if (node.type === 'rule' || node.type === 'atrule') sawNested = true;

        return node.type === 'decl' && sawNested
    })
}

/**
 * @summary D2 and D3: replaces each top-level node holding either shape, in place, with Sass's flattened
 * output of that node. Exact by construction; only those nodes lose their nesting. Moving single rules
 * or declarations instead reordered them against their siblings.
 * @param {String} file Absolute path, for module resolution.
 * @param {Object} ast
 * @returns {Number} The count of flattened top-level nodes.
 */
function flattenNestingSensitive(file, ast) {
    let flattened = 0;

    ast.each(top => {
        let sensitive = top.type === 'rule' && hasTrailingDeclaration(top);

        top.walkRules?.(rule => {
            if (isSpecificitySensitive(rule) || hasTrailingDeclaration(rule)) sensitive = true
        });

        if (sensitive) {
            const nodes = postcss.parse(reindent(sass.compileString(top.toString(), {style: 'expanded', url: new URL('file://' + file)}).css)).nodes;

            nodes.forEach((node, index) => node.raws.before = index === 0 ? top.raws.before : '\n\n');
            top.replaceWith(nodes);
            flattened++
        }
    });

    return flattened
}

/**
 * @summary Turns `//` comments into block comments. Adjacent line comments on their own lines become one
 * block whose continuation lines align under the first line's text. Every comment names the converted
 * files (`resources/css`, `.css`), and a glob segment that would close the block (`theme-*` + `/`) reads
 * `theme-<name>/`.
 * @param {Object} ast A postcss-scss root.
 */
function convertComments(ast) {
    // postcss-scss keeps a line comment's own text in `raws.text` when its `text` escapes a `*/`
    const textOf = comment => comment.raws.inline ? comment.raws.text ?? comment.text : comment.text;

    ast.walkComments(comment => {
        let text = textOf(comment);

        if (comment.raws.inline) {
            const ownLine = comment.raws.before === '' || comment.raws.before?.includes('\n'),
                  indent  = (comment.raws.before ?? '').match(/[ \t]*$/)[0];

            let next = comment.next();

            while (ownLine && next?.type === 'comment' && next.raws.inline && /^\n[ \t]*$/.test(next.raws.before)) {
                const following = next.next(), line = textOf(next);

                text += line ? `\n${indent}   ${line}` : '\n';
                next.remove();
                next = following
            }

            Object.assign(comment.raws, {inline: false, left: ' ', right: ' '});
            delete comment.raws.text
        }

        // A partial has no file of its own after the conversion, so a path naming one stays as written
        text = text.replace(/-\*\//g, '-<name>/')
            .replace(/resources\/scss\/(?![\w/-]*\/_[\w-]+\.scss)/g, 'resources/css/')
            .replace(/([\w-]+)\.scss\b/g, (match, name) => name.startsWith('_') ? match : `${name}.css`);

        if (text.includes('*/')) throw new Error(`a comment holds "*/": ${text}`);

        comment.text = text
    })
}

/**
 * @summary A marker comment for a block that Sass shared and the conversion copies. It records where the
 * copy lands; once every file is converted, `describeCopies` names the other copies in its place.
 * @param {String} key `module <path>` or `mixin <name>@<path>`, paths relative to `resources/scss`, no extension.
 * @param {String} entry The output path receiving the copy.
 * @returns {Object} A postcss comment.
 */
function marker(key, entry) {
    copies.set(key, [...copies.get(key) ?? [], entry]);

    return postcss.comment({text: `@@shared ${key}@@`, raws: {left: ' ', right: ' '}})
}

/**
 * @summary Replaces the marker comments of one output with a comment naming the other copies of each
 * block, or drops a marker whose block has no other copy.
 * @param {String} css The converted output.
 * @param {String} entry Its output path, relative to `resources/css`.
 * @returns {String}
 */
function describeCopies(css, entry) {
    return css.replace(/(^|\n)([ \t]*)\/\*\s*@@shared (module|mixin) (\S+)@@\s*\*\//g, (match, newline, indent, kind, key) => {
        const others = [...copies.get(`${kind} ${key}`)];

        if (kind === 'module' && !path.basename(key).startsWith('_')) others.push(`${key}.css`);

        others.splice(others.indexOf(entry), 1);

        if (others.length === 0) return '';

        const label = kind === 'module' ? `rules of ${key}.css` : `${key.split('@')[0]} block`,
              where = [...new Set(others)].map(other => other === entry ? 'this file' : other);

        return `${newline}${indent}/* A copy of the shared ${label}; the other ${where.length > 1 ? 'copies' : 'copy'}: ${where.join(', ')}. Keep them identical. */`
    }).replace(/^\s+/, '')
}

/**
 * @summary Converts one file, inlining the modules it emits and the mixins it includes.
 * @param {String} file Absolute path.
 * @param {String} entry The output path receiving the conversion, relative to `resources/css`.
 * @param {Set<String>} [emitted] Modules already inlined.
 * @returns {Object} The converted postcss root.
 */
function convert(file, entry, emitted = new Set()) {
    const ast            = postcssScss.parse(fs.readFileSync(file, 'utf8')),
          {vars, mixins} = moduleMembers(file),
          key            = target => path.relative(scssRoot, target).replace(/\.scss$/, '');

    ast.walkAtRules('use', node => {
        const url = node.params.match(/['"]([^'"]+)['"]/)?.[1];

        if (!url || url.startsWith('sass:')) return node.remove();

        const target = resolveModule(file, url);

        if (!target) throw new Error(`unresolved @use '${url}' in ${file}`);

        if (emitsCss(target) && !emitted.has(target)) {
            emitted.add(target);
            node.replaceWith(marker(`module ${key(target)}`, entry), ...convert(target, entry, emitted).nodes)
        } else {
            node.remove()
        }
    });

    ast.walkAtRules('forward', node => node.remove());

    for (let pass = 0; ast.toString().includes('@include') && pass < 5; pass++) {
        ast.walkAtRules('include', node => {
            const name = mixinName(node.params), mixin = mixins.get(name);

            if (!mixin) throw new Error(`unknown mixin ${node.params} in ${file}`);

            const body = mixin.node.clone(), bindings = bindArguments(mixin.node, node);

            if (bindings.length) body.walk(child => evaluate(file, [...vars, ...bindings], child));

            node.replaceWith(marker(`mixin ${name}@${key(mixin.file)}`, entry), ...body.nodes)
        })
    }

    ast.walkAtRules('mixin', node => node.remove());
    ast.walk(node => { if (node.type === 'decl' && node.prop.startsWith('$')) node.remove() });
    ast.walk(node => evaluate(file, vars, node));
    convertComments(ast);

    return ast
}

// Negative control: the trailing shorthand must not cross the nested longhand.
{
    const control = postcssScss.parse('.probe { & { margin-left: 10px; } margin: 0; }');

    flattenNestingSensitive(path.join(os.tmpdir(), 'control.scss'), control);

    const out = control.toString().replace(/\s+/g, ' ');

    if (/\{[^{}]*\{/.test(out) || out.indexOf('margin-left') > out.indexOf('margin: 0')) throw new Error(`D3 control failed: ${out}`)
}

const
    root     = fs.mkdtempSync(path.join(os.tmpdir(), 'scss-to-css-')),
    scssRoot = path.join(root, 'resources/scss'),
    worktree = ref === '.',
    files    = (worktree
        ? fs.readdirSync(path.join(repo, 'resources/scss'), {recursive: true}).map(file => path.join('resources/scss', file))
        : git('ls-tree', '-r', '--name-only', ref, 'resources/scss').split('\n')
    ).filter(file => file.endsWith('.scss')).sort(),
    copies   = new Map(),
    outputs  = new Map(),
    report   = {adopted: [], converted: 0, declAfterNested: [], diffs: [], errors: [], fallback: [], files: 0, flattened: [], isRisk: new Set()};

for (const file of files) {
    fs.mkdirSync(path.join(root, path.dirname(file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), worktree ? fs.readFileSync(path.join(repo, file)) : git('show', `${ref}:${file}`))
}

for (const file of files) {
    if (path.basename(file).startsWith('_')) continue;

    report.files++;

    const abs   = path.join(root, file), src = fs.readFileSync(abs, 'utf8'),
          entry = path.relative('resources/scss', file).replace(/\.scss$/, '.css');

    try {
        const expected = normalize(await prefix(sass.compile(abs, {style: 'expanded'}).css));
        let out;

        if (FALLBACK.test(src)) {
            const ast = postcssScss.parse(src);

            convertComments(ast);
            report.fallback.push(file);
            out = reindent(sass.compileString(ast.toString(), {style: 'expanded', url: new URL('file://' + abs)}).css)
        } else {
            const ast = convert(abs, entry), flattened = flattenNestingSensitive(abs, ast);

            report.converted++;
            if (flattened) report.flattened.push(`${file} (${flattened})`);
            adoptSassReadings(ast).forEach(line => report.adopted.push(`${file}: ${line}`));
            out = ast.toString()
        }

        out = out.replace(/[ \t]+$/gm, '').replace(/\s*$/, '\n');

        if (LOGIC.test(out.replace(/\/\*[\s\S]*?\*\//g, ''))) throw new Error('Sass logic left in the converted source');

        postcssScss.parse(out).walkRules(rule => {
            if (hasTrailingDeclaration(rule)) report.declAfterNested.push(file);
            if (isSpecificitySensitive(rule)) report.isRisk.add(file)
        });

        const actual = normalize(await prefix(sass.compileString(out, {style: 'expanded', url: new URL('file://' + abs)}).css));

        if (actual !== expected) report.diffs.push(file);

        outputs.set(entry, out)
    } catch (error) {
        report.errors.push(`${file}: ${error.message.split('\n')[0]}`)
    }
}

fs.rmSync(root, {recursive: true, force: true});

if (process.env.OUT) {
    outputs.forEach((out, entry) => {
        const dest = path.join(process.env.OUT, 'resources/css', entry);

        fs.mkdirSync(path.dirname(dest), {recursive: true});
        fs.writeFileSync(dest, describeCopies(out, entry))
    })
}

console.log(`${repo} @ ${worktree ? 'working tree' : git('rev-parse', '--short', ref).trim()}: ${report.files} files, ${report.converted} converted, ${report.fallback.length} compiled (D4)`);
report.fallback.forEach(file => console.log(`  compiled: ${file}`));
console.log(`D2/D3 flattened: ${report.flattened.length} files`);
report.flattened.forEach(file => console.log(`  flattened: ${file}`));
console.log(`equal: ${report.files - report.diffs.length - report.errors.length}, different: ${report.diffs.length}, errors: ${report.errors.length}`);
report.diffs.forEach(file => console.log(`  different: ${file}`));
report.errors.forEach(line => console.log(`  error: ${line}`));
console.log(`left under a mixed-specificity list: ${report.isRisk.size}; declarations after a nested node: ${report.declAfterNested.length}`);
console.log(`readings where Sass and a browser differ, Sass's adopted: ${report.adopted.length}`);
report.adopted.forEach(line => console.log(`  adopted: ${line}`));

process.exitCode = report.diffs.length || report.errors.length ? 1 : 0;
