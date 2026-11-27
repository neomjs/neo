import {parseExpressionAt} from 'acorn';

// Plain prose may mention a user, an npm scope or a decorator. Only an intended documentation
// tag has metadata to lose when it follows another tag on the same line.
const memberTags = new Set((
    'abstract access alias augments author borrows class classdesc constant constructor copyright ' +
    'default defaultvalue deprecated description enum event example exception exports extends external ' +
    'file fires function inherits instance interface internal invariant kind license listens material ' +
    'member memberof method mixes mixin module name namespace override package param private property ' +
    'protected public reactive readonly requires return returns see since singleton static summary ' +
    'template this throws todo tutorial type typedef version warning yields'
).split(' '));

/**
 * @summary Returns the documentation lines the guard reads. Markdown fences and example bodies can
 * contain literal JSDoc examples; a following tag starts documentation again.
 * @param {Object} comment An Acorn JSDoc block comment.
 * @returns {String[]}
 */
function tagLines(comment) {
    const lines = [];

    let fence   = '',
        example = false;

    for (const raw of comment.value.split(/\r?\n/)) {
        const line   = raw.replace(/^\s*\*\s?/, '').trim(),
              marker = line.match(/^(`{3,}|~{3,})/);

        if (fence) {
            if (line.startsWith(fence) && line.replaceAll(fence[0], '') === '') fence = '';
        } else if (marker) {
            fence = marker[1]
        } else if (/^@example\b/.test(line)) {
            example = true
        } else if (!example || /^@\w/.test(line)) {
            example = false;
            lines.push(line)
        }
    }

    return lines
}

/**
 * @summary Reads the member name and inline default after its balanced type. Record and function
 * types may themselves contain braces or span several lines.
 * @param {String} text Tag text after `@member`.
 * @returns {{type: String, declaration: String}}
 */
function splitMember(text) {
    text = text.trimStart();

    if (text.startsWith('{')) {
        let depth = 1;
        for (let i = 1; i < text.length; i++) {
            if (text[i] === '\\') {
                i++
            } else if (text[i] === '{') {
                depth++
            } else if (text[i] === '}' && --depth === 0) {
                return {type: text.slice(1, i), declaration: text.slice(i + 1).trimStart()}
            }
        }
    }

    return {type: '', declaration: text}
}

/**
 * @summary A space after a finished default begins its description. Inside a literal, constructor
 * call or function expression the same space truncates the value JSDoc publishes.
 * @param {String} declaration The member name followed by its optional inline default.
 * @param {Boolean} compact Whether the entire comment occupies one line.
 * @param {Boolean} collectionType Whether the declared type has its default extracted from the source line.
 * @returns {Boolean}
 */
function losesInlineDefault(declaration, compact, collectionType) {
    const match = /^\[?[^\s=\]]+([^\S\n]*=[^\S\n]*)(\S+)([^\n]*)/.exec(declaration);

    if (!match) return false;

    const [, equals, token, remainder] = match,
          value = declaration.startsWith('[') ? token.replace(/\]$/, '') : token;

    if (/\s/.test(equals)) return true;
    // The generator re-extracts truthy array/object defaults, including named constants. In a
    // one-line block there is no newline after the equals sign, so that extraction is empty.
    if (compact && (/^[{\[]/.test(token) || (collectionType && !/^(?:null|false|0|NaN|undefined)$/.test(value)))) return true;
    if (!remainder.trim()) return false;

    if (['new', 'function', 'async'].includes(token) || /^\s*=>/.test(remainder)) {
        try {
            const expression = parseExpressionAt(token + remainder, 0, {ecmaVersion: 'latest'});
            return ['NewExpression', 'FunctionExpression', 'ArrowFunctionExpression'].includes(expression.type)
        } catch {
            return false
        }
    }

    if (!/^['"`({\[]/.test(token)) return false;

    try {
        parseExpressionAt(token, 0, {ecmaVersion: 'latest'});
        return false
    } catch {
        return true
    }
}

/**
 * @summary Whether the local config carries its own standalone reactive marker.
 * @param {Object|null} comment An Acorn JSDoc block comment.
 * @returns {Boolean}
 */
export function hasReactiveTag(comment) {
    return Boolean(comment && tagLines(comment).includes('@reactive'))
}

/**
 * @summary Reports documented metadata loss from a misplaced tag or an inline member default.
 * @param {Object} comment An Acorn JSDoc block comment.
 * @param {Function} report Receives the violated rule once per comment.
 */
export function checkMemberDoc(comment, report) {
    const lines   = tagLines(comment),
          compact = !comment.value.includes('\n');

    for (const line of lines) {
        const prose = line.replace(/`[^`]*`|\{@[\w-]+[^}]*\}/g, '')
            .replace(/^(@default(?:value)?\s+)(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/, '$1');

        if ((prose.startsWith('@') && [...prose.matchAll(/\s@([A-Za-z][\w-]*)(?=\s|$)/g)].some(match => memberTags.has(match[1].toLowerCase()))) ||
            /\S\s+@(?:member|param|property|returns?|throws|type)\s+\{/.test(prose) ||
            /\S\s+@(?:private|protected|reactive|readonly|static)$/.test(prose)) {
            report('compact-jsdoc-loss');
            return
        }
    }

    const member = lines.findIndex(line => /^@member\b/.test(line));
    if (member === -1) return;

    const {type, declaration} = splitMember(lines.slice(member).join('\n').slice('@member'.length)),
          separateDefault     = lines.find(line => /^@default(?:value)?\s+/.test(line)),
          firstType           = type.trim().replace(/^[(!?]+/, '').split('|')[0].trim(),
          collectionType      = /^(?:Array\b|Object\b|\{)/i.test(firstType) || firstType.endsWith('[]');

    if (losesInlineDefault(declaration, compact, collectionType) || (separateDefault && collectionType)) {
        report('compact-jsdoc-loss')
    }
}
