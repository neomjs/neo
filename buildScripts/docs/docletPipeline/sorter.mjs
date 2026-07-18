import utils from './utils.mjs';

function includes(source, value) {
    if (!Array.isArray(source)) source = [source];
    return source.indexOf(value) >= 0;
}

function $isTypeDef(symbol) {
    return utils.isTypeDef(symbol) && !utils.isCallback(symbol);
}

function $isProperty(symbol) {
    return utils.isProperty(symbol) && !utils.isEnum(symbol);
}

/**
 *  Compares the given two symbols by the specified property.
 *  @private
 *
 *  @param {String} prop - Property/key to be used for comparison.
 *  @param {String|Array} priorValue - Priority value. Which ever symbol has it,
 *  comes first. This can also be an array of values.
 *  @param {Object} a - First symbol to be compared.
 *  @param {Object} b - Second symbol to be compared.
 *
 *  @returns {Number} - `0` if both have the same value for the given
 *  property/key. `-1` if only `a` has the priority value. `1` if only
 *  `b` has the priority value. `null` if neither of the symbols have the
 *  priority value.
 */
function compareBy(prop, priorValue, a, b) {
    const incA = includes(priorValue, a[prop]);
    const incB = includes(priorValue, b[prop]);
    if (incA && incB) return 0;
    if (!incA && !incB) return null; // neither of a or b
    if (incA) return -1;
    return 1; // incB
}

function compareWith(fn, a, b) {
    const fA = fn(a);
    const fB = fn(b);
    if (fA && fB) return 0;
    if (!fA && !fB) return null; // neither of a or b
    if (fA) return -1;
    return 1; // fB
}

function compareAlpha(a, b, prop) {
    // colon (:) is not included bec. it just indicates a prefix, it's not a
    // level separator as dot (.).
    const re = /[#.~]/g;
    // alphabetic sort (ignoring operators)
    const nA = a[prop].replace(re, '_');
    const nB = b[prop].replace(re, '_');
    // console.log('comparing:', a, '<<—>>', b, '==>', result);
    return nA.toLocaleUpperCase().localeCompare(nB.toLocaleUpperCase());
}

// function compareHierarchy(a, b, compareNext) {
//     if (utils.getParentName(a) === utils.getParentName(b)) {
//         return compareNext ? compareNext(a, b) : 0;
//     }

//     const aLevels = utils.getLevels(a);
//     const bLevels = utils.getLevels(b);
//     if (aLevels > bLevels) return 1;
//     if (aLevels < bLevels) return -1;
//     return compareNext ? compareNext(a, b) : 0;
// }

function compareScopes(a, b, compareNext) {
    if (a.scope === b.scope) return compareNext(a, b);

    // if `scope` comparison returns `0` (equal), we'll use the secondary
    // comparer (which might also have a secondary comparer).
    function next(c) {
        return c === 0 // || c === null
            ? compareNext ? compareNext(a, b) : c
            : c;
    }

    // compareBy returns either -1, 0, 1 or null. If null is returned,
    // neither of a and b has the specified scope, so we move on to test
    // the next scope.

    // possible scope values: undefined, global, static, instance, inner
    let c;
    c = compareBy('scope', undefined, a, b); // module scopes are undefined
    if (c !== null) return next(c);
    c = compareBy('scope', 'global', a, b);
    if (c !== null) return next(c);
    c = compareBy('scope', 'static', a, b);
    if (c !== null) return next(c);
    c = compareBy('scope', 'instance', a, b);
    if (c !== null) return next(c);
    c = compareBy('scope', 'inner', a, b);
    return next(c);
}

function compareAccesses(a, b, compareNext) {
    if (a.access === b.access) return compareNext(a, b);

    // if `access` comparison returns `0` (equal), we'll use the secondary
    // comparer (which might also have a secondary comparer).
    function next(c) {
        return c === 0 || c === null
            ? compareNext ? compareNext(a, b) : c
            : c;
    }

    // possible access values: undefined, public, protected, private, package
    let c;
    c = compareBy('access', [undefined, 'public'], a, b);
    if (c !== null) return next(c);
    c = compareBy('access', 'protected', a, b);
    if (c !== null) return next(c);
    c = compareBy('access', 'private', a, b);
    if (c !== null) return next(c);
    c = compareBy('access', 'package', a, b);
    return next(c);
}

// possible kind values:
// constant, module, namespace, class, typedef, interface, mixin, function, member, event, external
// there is also enum but enum is not a kind, it's represented via `isEnum:Boolean` property.
function compareKinds(a, b, compareNext, grouped = false) {
    // if (a.$kind === b.$kind) return compareNext(a, b); // kind comparison is a bit more complex

    // if `kind` comparison returns `0` (equal), we'll use the secondary
    // comparer (which might also have a secondary comparer).
    function next(c) {
        return c === 0 || c === null
            ? compareNext ? compareNext(a, b) : c
            : c;
    }

    // Sorting by kind is done in the following order: constant, package/module,
    // namespace, class, constructor, method, property, enum, typedef, event,
    // interface, mixin, external, other members.

    // before this, symbols are first compared by `scope` and then `access`.
    // now that we're here, it means previous comparison returned `0`
    // (equal).
    let c;

    // if grouped-sort, we'll still list globals first
    if (grouped) {
        c = compareBy('scope', 'global', a, b);
        if (c !== null) return next(c);
    }

    c = compareBy('kind', 'constant', a, b);
    if (c !== null) return next(c);
    c = compareBy('kind', 'module', a, b);
    if (c !== null) return next(c);
    c = compareBy('kind', 'namespace', a, b);
    if (c !== null) return next(c);

    c = compareBy('kind', 'class', a, b);
    if (c !== null) return next(c);

    c = compareWith(utils.isConstructor, a, b);
    if (c !== null) return next(c);
    c = compareWith(utils.isMethod, a, b);
    if (c !== null) return next(c);
    c = compareWith($isProperty, a, b);
    if (c !== null) return next(c);
    c = compareWith(utils.isEnum, a, b);
    if (c !== null) return next(c);
    c = compareBy('kind', 'member', a, b);
    if (c !== null) return next(c);

    c = compareWith($isTypeDef, a, b);
    if (c !== null) return next(c);
    c = compareWith(utils.isCallback, a, b);
    if (c !== null) return next(c);

    c = compareBy('kind', 'event', a, b);
    if (c !== null) return next(c);
    c = compareBy('kind', 'interface', a, b);
    if (c !== null) return next(c);
    c = compareBy('kind', 'mixin', a, b);
    if (c !== null) return next(c);
    c = compareBy('kind', 'external', a, b);
    return next(c);
}

/**
 *  Gets a function that's used to deeply compare symbols for sorting order.
 *  When `sortType` is set to `"grouped"`, we'll sort the symbols by comparing
 *  the following features, with a fallback mechanism, in order. // by scope ➔
 *  by access ➔ by kind ➔ alphabetic
 *
 *  @param {Boolean|String} sortType - Possible values `"alphabetic"` (`true`),
 *  `"grouped"`, `"scope"`, `"access"`, `"kind"`, `false` (disabled).
 *  @param {String} prop - Property/key name to be used when the sort type is,
 *  or falls back to `"alphabetic"`.
 *
 *  @returns {Function} - A comparer function with signature `(a, b) => {}`.
 */
export function getSymbolsComparer(sortType, prop) {
    if (!sortType) return null;
    if (sortType === true) sortType = 'alphabetic';

    const $alphaComparer = (a, b) => {
        return compareAlpha(a, b, prop);
    };

    if (sortType === 'scope') {
        return (a, b) => {
            return compareScopes(a, b, $alphaComparer, false);
        };
    }

    if (sortType === 'access') {
        return (a, b) => {
            return compareAccesses(a, b, $alphaComparer);
        };
    }

    if (sortType === 'kind') {
        return (a, b) => {
            return compareKinds(a, b, $alphaComparer, false);
        };
    }

    if (sortType === 'grouped' || sortType === 'group') {
        const $kindComparer = (a, b) => {
            return compareKinds(a, b, $alphaComparer, true);
        };

        const $accessComparer = (a, b) => {
            return compareAccesses(a, b, $kindComparer);
        };

        return (a, b) => {
            // cannot short-circuit like below bec. for kind comparison, we
            // don't only check for the value. e.g. we check isEnum,
            // isConstructor, so on.

            // if (a.scope === b.scope && a.access === b.access && a.$kind === b.$kind) {
            //     return $alphaComparer(a, b);
            // }

            // (scopeComparer) ➔ $accessComparer ➔ $kindComparer ➔ $alphaComparer
            return compareScopes(a, b, $accessComparer);
        };
    }

    // otherwise aplhabetic
    return $alphaComparer;
}
