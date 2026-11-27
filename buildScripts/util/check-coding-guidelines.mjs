/**
 * @module buildScripts/util/check-coding-guidelines
 * @summary Checks the locally decidable Neo class and JSDoc rules. The baseline identifies existing
 * findings by file, rule and member so moving a line cannot create or retire debt.
 */
import {parse}                          from 'acorn';
import {execFileSync}                   from 'node:child_process';
import {readFileSync, writeFileSync}    from 'node:fs';
import path                             from 'node:path';
import process                          from 'node:process';
import {checkMemberDoc, hasReactiveTag} from './codingGuidelinesJsdoc.mjs';
import isEntryModule                    from './isEntryModule.mjs';

const ROOTS        = ['src', 'apps', 'examples', 'docs/app'],
      BASELINE     = 'buildScripts/util/check-coding-guidelines-baseline.json',
      GUIDELINES   = '.github/CODING_GUIDELINES.md',
      MERGE_OWNERS = new Map([
          ['src/core/Base.mjs', 'Base'],
          ['src/component/Base.mjs', 'Component'],
          ['src/container/Base.mjs', 'Container'],
          ['src/form/field/Text.mjs', 'Text']
      ]),
      RULES = {
          'compact-jsdoc-loss'  : '§12: Use a lossless JSDoc member/default form and start each tag on its own line.',
          'leaf-merge-config'   : '§8 (29b): Declare config merge policy on the class descriptor.',
          'local-reactive-tag'  : '§5, The @reactive Tag: A local trailing underscore requires a standalone @reactive tag. check-reactive-tags checks inherited reactivity.',
          'missing-config-jsdoc': '§4 (18) and §5 (21): Document this static config with JSDoc.',
          'no-private-methods'  : '§8 (29a): Use an overridable method for class behavior.',
          'redundant-vdom-div'  : "§6 (24): Omit tag: 'div' on a VDOM node that already defaults to div.",
          'static-config-order' : '§5 (21): Put className first, ntype second, other configs in alphabetical order, then vdom or _vdom.'
      };

/** @summary Tracked input paths consumed by the repository's hook/CI alignment check. */
export const SCAN_SURFACE = Object.freeze([...ROOTS.map(root => root + '/**/*.mjs'), BASELINE]);

/** @summary Iterates immediate Acorn children without visiting locations and other metadata. */
function forEachChild(node, fn) {
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
            for (const child of value) if (child?.type) fn(child)
        } else if (value?.type) {
            fn(value)
        }
    }
}

/** @summary Visits a syntax subtree; returning false leaves ownership of the children to the caller. */
function visit(node, fn) {
    if (node?.type && fn(node) !== false) forEachChild(node, child => visit(child, fn))
}

/** @summary Returns a statically known key, including quoted names, without guessing computed expressions. */
function keyName(node) {
    const key = node.key || node.property;
    if (key?.type === 'Literal' && typeof key.value === 'string') return key.value;
    if (!node.computed && key?.type === 'Identifier') return key.name;
}

/** @summary Names introduced by a declaration, parameter or destructuring pattern. */
function bindingNames(pattern) {
    switch (pattern?.type) {
        case 'Identifier': return [pattern.name];
        case 'AssignmentPattern': return bindingNames(pattern.left);
        case 'RestElement': return bindingNames(pattern.argument);
        case 'ObjectPattern': return pattern.properties.flatMap(prop => bindingNames(prop.value || prop.argument));
        case 'ArrayPattern': return pattern.elements.flatMap(bindingNames);
        default: return []
    }
}

/** @summary Matches registrations to the class binding visible at the call site, including local class factories. */
function registeredClasses(ast) {
    const calls = [], result = new Map();
    function scan(statements, parent, parameters = []) {
        const bindings = new Map(parameters.map(name => [name, null])),
              scope    = {bindings, parent};
        for (const statement of statements) {
            const declaration = statement.declaration || statement;
            if (declaration.type === 'ClassDeclaration' && declaration.id) {
                bindings.set(declaration.id.name, declaration)
            } else if (declaration.type === 'VariableDeclaration') {
                for (const {id, init} of declaration.declarations) {
                    for (const name of bindingNames(id)) {
                        bindings.set(name, id.type === 'Identifier' && init?.type === 'ClassExpression' ? init : null)
                    }
                }
            } else if (declaration.type === 'FunctionDeclaration' && declaration.id) {
                bindings.set(declaration.id.name, null)
            }
        }
        for (const statement of statements) {
            visit(statement, node => {
                if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) {
                    scan(node.body.type === 'BlockStatement' ? node.body.body : [node.body], scope, node.params.flatMap(bindingNames));
                    return false
                }
                if (node.type === 'CatchClause') {
                    scan(node.body.body, scope, bindingNames(node.param));
                    return false
                }
                if (node.type === 'BlockStatement') {
                    scan(node.body, scope);
                    return false
                }
                const callee = node.callee;
                if (node.type === 'CallExpression' && callee?.type === 'MemberExpression' &&
                    callee.object.name === 'Neo' && keyName(callee) === 'setupClass') {
                    calls.push({argument: node.arguments[0], scope})
                }
            })
        }
    }
    scan(ast.body, null);
    for (const {argument, scope} of calls) {
        if (argument?.type === 'ClassExpression') {
            result.set(argument, argument.id?.name || 'default')
        } else if (argument?.type === 'Identifier') {
            let current = scope;
            while (current && !current.bindings.has(argument.name)) current = current.parent;
            const declaration = current?.bindings.get(argument.name);
            if (declaration) result.set(declaration, argument.name)
        }
    }
    return result
}

/** @summary Finds the immediately preceding JSDoc without associating a previous sibling's comment. */
function memberComment(source, comments, node) {
    let low = 0, high = comments.length;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (comments[middle].end <= node.start) low = middle + 1;
        else high = middle
    }
    const previous = comments[low - 1];
    if (previous?.type === 'Block' && previous.value.startsWith('*') && !source.slice(previous.end, node.start).trim()) {
        return previous
    }
}

/** @summary Compares config declarations within a run of known property names. */
function configOrder(name) {
    if (name === 'className') return '0';
    if (name === 'ntype') return '1';
    if (name === 'vdom' || name === '_vdom') return '3';
    return '2' + name.toLowerCase()
}

/** @summary Inspects actual node literals and their cn children, leaving data, attributes and callback locals alone. */
function checkVdom(node, onDiv) {
    if (!node) return;
    switch (node.type) {
        case 'ObjectExpression': {
            let tag;
            for (const prop of node.properties) {
                const name = keyName(prop);
                if (prop.type === 'SpreadElement' || prop.computed || name === 'tag' && tag) {
                    // Removing an explicit tag could expose an earlier tag on an object being merged.
                    tag = false
                } else if (name === 'tag' && tag !== false) {
                    tag = prop
                }
                if (name === 'cn') checkVdom(prop.value, onDiv)
            }
            if (tag?.value?.value === 'div') onDiv(tag);
            break
        }
        case 'ArrayExpression':
            node.elements.forEach(child => checkVdom(child, onDiv));
            break
        case 'SpreadElement':
            checkVdom(node.argument, onDiv);
            break
        case 'ConditionalExpression':
            checkVdom(node.consequent, onDiv);
            checkVdom(node.alternate, onDiv);
            break
        case 'LogicalExpression':
            checkVdom(node.left, onDiv);
            checkVdom(node.right, onDiv);
            break
        case 'FunctionExpression':
        case 'ArrowFunctionExpression':
            if (node.body.type !== 'BlockStatement') {
                checkVdom(node.body, onDiv)
            } else {
                visit(node.body, child => {
                    if (/Function|Class/.test(child.type)) return false;
                    if (child.type === 'ReturnStatement') checkVdom(child.argument, onDiv)
                })
            }
    }
}

/** @summary Checks named VDOM slots, including reactive item templates, and reports their literal tags. */
function checkVdomSlots(root, onDiv) {
    visit(root, node => {
        if (/^Class/.test(node.type)) return false;
        const key = keyName(node.type === 'AssignmentExpression' ? node.left : node);
        if (key === 'vdom' || key === '_vdom' || key === 'itemTpl' || key === 'itemTpl_') {
            checkVdom(node.right || node.value, tag => onDiv(key, tag))
        }
    })
}

/** @summary Checks the instance receiver and locally bound me alias inside a construction hook. */
function checkConstruct(body, onCall) {
    // Only diagnose the alias when its identity is static. A reassignment leaves it to semantic review.
    let reassigned = false;
    visit(body, node => {
        if (node.type === 'AssignmentExpression' && bindingNames(node.left).includes('me') ||
            node.type === 'UpdateExpression' && node.argument.name === 'me') reassigned = true
    });

    function inspect(node, meIsInstance) {
        if (/^(Class|Function)/.test(node.type)) return;
        if (node.type === 'BlockStatement') {
            for (const statement of node.body) {
                if (statement.type !== 'VariableDeclaration') continue;
                const me = statement.declarations.find(declaration => bindingNames(declaration.id).includes('me'));
                if (me) meIsInstance = !reassigned && me.id.type === 'Identifier' && me.init?.type === 'ThisExpression'
            }
        } else if ((node.type === 'ArrowFunctionExpression' && node.params.flatMap(bindingNames).includes('me')) ||
                   (node.type === 'CatchClause' && bindingNames(node.param).includes('me'))) {
            meIsInstance = false
        } else if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
            const {callee} = node;
            if (keyName(callee) === 'mergeConfig' && (callee.object.type === 'ThisExpression' ||
                meIsInstance && callee.object.name === 'me')) onCall(node)
        }
        forEachChild(node, child => inspect(child, meIsInstance))
    }

    inspect(body, false)
}

/** @summary Returns the findings, or null when the parser cannot inspect the source. */
function inspectSource(source, file) {
    const comments = [], findings = [], checkedTags = new Set();
    let ast;
    try {
        ast = parse(source, {ecmaVersion: 'latest', sourceType: 'module', locations: true, onComment: comments})
    } catch (error) {
        if (error instanceof SyntaxError) return null;
        throw error
    }
    function reportDiv(owner, key, tag) {
        if (!checkedTags.has(tag)) {
            findings.push({file, rule: 'redundant-vdom-div', name: owner + '.' + key, line: tag.loc.start.line});
            checkedTags.add(tag)
        }
    }
    for (const [declaration, className] of registeredClasses(ast)) {
        const report = (rule, name, node) => findings.push({file, rule, name: className + '.' + name, line: node.loc.start.line});
        for (const member of declaration.body.body) {
            const name = keyName(member) ?? member.key?.name,
                  doc  = memberComment(source, comments, member);
            if (doc) checkMemberDoc(doc, rule => report(rule, name, doc));

            if (member.type === 'PropertyDefinition' && member.static && name === 'config' && member.value?.type === 'ObjectExpression') {
                let previous;
                for (const prop of member.value.properties) {
                    const key = keyName(prop);
                    if (key === undefined) {
                        previous = undefined;
                        continue
                    }
                    const comment = memberComment(source, comments, prop);
                    if (!comment) report('missing-config-jsdoc', key, prop);
                    else checkMemberDoc(comment, rule => report(rule, key, comment));
                    if (key.endsWith('_') && (!comment || !hasReactiveTag(comment))) report('local-reactive-tag', key, prop);
                    const order = configOrder(key);
                    if (previous !== undefined && order < previous) report('static-config-order', key, prop);
                    previous = order
                }
            }

            if (member.type === 'MethodDefinition') {
                if (member.key.type === 'PrivateIdentifier' &&
                    !(file === 'src/core/Base.mjs' && className === 'Base' && !member.static && name === 'preDestroyHook' && doc)) {
                    report('no-private-methods', '#' + name, member)
                }
                if (name === 'mergeConfig' && member.key.type !== 'PrivateIdentifier' && MERGE_OWNERS.get(file) !== className) {
                    report('leaf-merge-config', name, member)
                }
                if (name === 'construct' && !(file === 'src/core/Base.mjs' && className === 'Base')) {
                    checkConstruct(member.value.body, node => report('leaf-merge-config', name, node))
                }
            }

            checkVdomSlots(member, (key, tag) => reportDiv(className + '.' + name, key, tag))
        }
    }
    visit(ast, node => {
        const callee = node.callee;
        if (node.type === 'CallExpression' && callee?.type === 'MemberExpression' && callee.object.name === 'Neo' &&
            (keyName(callee) === 'app' || keyName(callee) === 'create')) {
            for (const arg of node.arguments) {
                if (arg.type === 'ObjectExpression') checkVdomSlots(arg, (key, tag) => reportDiv('Neo.' + keyName(callee), key, tag))
            }
        }
    });
    return findings
}

/**
 * @summary Finds locally decidable class and doclet violations without requiring generated documentation.
 * @param {String} source Module source.
 * @param {String} file Repository-relative path.
 * @returns {Object[]} Findings with file, rule, member name and line. Syntax errors belong to check-parse.
 */
export function findViolations(source, file) {
    return inspectSource(source, file) ?? []
}

/** @summary Indexes locations by file, rule and member; repeated names retain their multiplicity. */
function groupFindings(findings) {
    const groups = Object.create(null);
    for (const {file, rule, name} of findings) {
        const rules = groups[file] ??= Object.create(null);
        (rules[rule] ??= []).push(name)
    }
    return groups
}

/** @summary Writes one sorted array per file/rule so removing known debt produces a local, readable diff. */
function formatBaseline(groups) {
    const files = Object.keys(groups).sort().map(file => {
        const rules = Object.keys(groups[file]).sort().map(rule =>
            '    ' + JSON.stringify(rule) + ': ' + JSON.stringify(groups[file][rule].sort())
        );
        return '  ' + JSON.stringify(file) + ': {\n' + rules.join(',\n') + '\n  }'
    });
    return '{\n' + files.join(',\n') + '\n}\n'
}

/** @summary Reads tracked sources from the selected snapshot; one batch reads the exact staged blobs. */
function scanFiles(root, {staged, ref, selected}) {
    const options = {cwd: root, maxBuffer: 128 * 1024 * 1024},
          command = ref ? ['ls-tree', '-r', '-z', ref] : ['ls-files', '--stage', '-z'],
          listed  = execFileSync('git', [...command, '--', ...ROOTS], {...options, encoding: 'utf8'}),
          files   = [];
    for (const record of listed.split('\0')) {
        if (!record) continue;
        const tab  = record.indexOf('\t'),
              file = record.slice(tab + 1);
        if (!file.endsWith('.mjs') || selected && !selected.has(file)) continue;
        const [mode, object, stageOrOid] = record.slice(0, tab).split(' ');
        if (!ref && stageOrOid !== '0') throw new Error('Unmerged index entry: ' + file);
        if (mode === '100644' || mode === '100755') files.push({file, oid: ref ? stageOrOid : object})
    }

    let blobs, offset = 0;
    if ((staged || ref) && files.length) {
        blobs = execFileSync('git', ['cat-file', '--batch'], {...options, input: files.map(f => f.oid).join('\n') + '\n'})
    }
    const findings = [], unparsed = new Set();
    for (const {file, oid} of files) {
        let source;
        if (blobs) {
            const end              = blobs.indexOf(10, offset),
                  [id, type, size] = blobs.toString('ascii', offset, end).split(' ');
            if (id !== oid || type !== 'blob' || !/^\d+$/.test(size)) throw new Error('Unreadable staged source: ' + file);
            offset = end + 1;
            source = blobs.toString('utf8', offset, offset + Number(size));
            offset += Number(size) + 1
        } else {
            try {
                source = readFileSync(path.join(root, file), 'utf8')
            } catch (error) {
                if (error.code === 'ENOENT') continue;
                throw error
            }
        }
        const rows = inspectSource(source, file);
        if (rows) findings.push(...rows);
        else unparsed.add(file)
    }
    return {findings, unparsed}
}

/** @summary Matches each finding to one recorded occurrence and reports both new and retired debt. */
function compareBaseline({findings, unparsed}, baseline, selected, checkingPriorSource = false) {
    const remaining = new Map(), messages = [];
    for (const [file, rules] of Object.entries(baseline)) {
        if (selected && !selected.has(file) || !checkingPriorSource && unparsed.has(file)) continue;
        if (!rules || typeof rules !== 'object' || Array.isArray(rules) || !Object.keys(rules).length) {
            throw new Error('Empty or invalid baseline entry: ' + file)
        }
        for (const [rule, names] of Object.entries(rules)) {
            if (!Object.hasOwn(RULES, rule) || !Array.isArray(names) || !names.length || !names.every(name => typeof name === 'string' && name)) {
                throw new Error('Empty or invalid baseline rule in ' + file + ': ' + rule)
            }
            for (const name of names) {
                const key = JSON.stringify([file, rule, name]);
                remaining.set(key, (remaining.get(key) || 0) + 1)
            }
        }
    }
    for (const {file, rule, name, line} of findings) {
        const key = JSON.stringify([file, rule, name]), count = remaining.get(key);
        if (count) {
            if (count === 1) remaining.delete(key);
            else remaining.set(key, count - 1)
        } else if (!checkingPriorSource) {
            messages.push(`${file}:${line} [${rule}] ${name} — ${GUIDELINES} ${RULES[rule]}`)
        }
    }
    for (const [key, count] of remaining) {
        const [file, rule, name] = JSON.parse(key);
        const change             = checkingPriorSource ? 'new baseline occurrence(s) absent from the base revision' : 'retired baseline occurrence(s)';
        messages.push(`${file} [${rule}] ${name} — remove ${count} ${change}. ${GUIDELINES} ${RULES[rule]}`)
    }
    return messages
}

/** @summary Runs the repository scan or compares only the staged paths against the staged baseline. */
function main(args) {
    const root   = execFileSync('git', ['rev-parse', '--show-toplevel'], {encoding: 'utf8'}).trim(),
          staged = args.includes('--staged'),
          write  = args.includes('--write-baseline'),
          paths  = args.filter(arg => !arg.startsWith('--'));
    if (args.some(arg => arg.startsWith('--') && !['--staged', '--write-baseline'].includes(arg)) ||
        write && (staged || paths.length)) {
        throw new Error('Usage: check-coding-guidelines.mjs [--staged | --write-baseline | paths...]')
    }
    let selected;
    if (staged) {
        const changed = execFileSync('git', ['diff', '--cached', '--name-only', '--no-renames', '-z'], {cwd: root, encoding: 'utf8'}).split('\0');
        if (!changed.some(file => [BASELINE, 'buildScripts/util/check-coding-guidelines.mjs', 'buildScripts/util/codingGuidelinesJsdoc.mjs'].includes(file))) {
            selected = new Set(changed)
        }
    } else if (paths.length) {
        selected = new Set(paths.map(file => path.relative(root, path.resolve(file)).split(path.sep).join('/')))
    }
    const snapshot             = scanFiles(root, {staged, selected}),
          {findings, unparsed} = snapshot;
    if (write) {
        if (unparsed.size) throw new Error('Cannot remeasure unparseable source: ' + [...unparsed].join(', '));
        writeFileSync(path.join(root, BASELINE), formatBaseline(groupFindings(findings)));
        console.log(`Recorded ${findings.length} existing coding-guideline findings in ${BASELINE}.`);
        return
    }
    const data = staged
        ? execFileSync('git', ['show', ':' + BASELINE], {cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024})
        : readFileSync(path.join(root, BASELINE), 'utf8');
    const baseline = JSON.parse(data),
          messages = compareBaseline(snapshot, baseline, selected);
    // A regenerated ledger can agree perfectly with a regression. When the ledger changes, prove
    // that its entries already existed in the PR base (or local HEAD) using this same analyzer.
    const ref = process.env.BASE_SHA || execFileSync('git', ['rev-parse', '--revs-only', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
    if (!messages.length && ref && execFileSync('git', ['diff', ...(staged ? ['--cached'] : []), '--name-only', ref, '--', BASELINE],
        {cwd: root, encoding: 'utf8'}).trim()) {
        const recorded = new Set(Object.keys(baseline));
        messages.push(...compareBaseline(scanFiles(root, {ref, selected: recorded}), baseline, recorded, true))
    }
    if (messages.length) {
        messages.forEach(message => console.error(message));
        process.exitCode = 1
    } else {
        console.log(`check-coding-guidelines: OK — ${findings.length} existing finding(s) in the checked paths.`)
    }
}

if (isEntryModule(import.meta.url)) {
    try {
        main(process.argv.slice(2))
    } catch (error) {
        console.error('check-coding-guidelines:', error.message);
        process.exitCode = 1
    }
}
