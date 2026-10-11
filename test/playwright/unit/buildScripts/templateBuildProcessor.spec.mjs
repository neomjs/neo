import {test, expect} from '@playwright/test';

/**
 * The property under test is that emitted code **parses**, not that it matches an expected string.
 *
 * A string-equality assertion passes for any consistent-but-wrong escaping — it pins whatever the
 * emitter currently does, including the identity replacement this file exists to catch. Parsing is
 * the property a build actually depends on, so every arm below compiles the emitted expression.
 *
 * The two call sites are independent: `:120` builds the text-node chain, `:182` the attribute chain.
 * They carry the same defect because the logic was inlined twice, so each gets its own arm and its
 * own mutation control — a fix to one site must not green the other's.
 *
 * @see https://github.com/neomjs/neo/issues/17484
 */
test.describe('templateBuildProcessor — static text is escaped so the emitted chain parses', () => {
    let processHtmlTemplateLiteral;

    test.beforeAll(async () => {
        ({processHtmlTemplateLiteral} =
            await import('../../../../buildScripts/util/templateBuildProcessor.mjs'));
    });

    /**
     * Extracts the generated expression from the `##__NEO_EXPR__` envelope the processor emits.
     * Returns null when the node carries no expression, which is itself a failure for these arms:
     * a static-only result would mean the dynamic part never made it into a chain, so the arm would
     * be asserting on the wrong shape rather than on escaping.
     */
    const extractExpression = value => {
        const match = typeof value === 'string' && value.match(/##__NEO_EXPR__(.*)##__NEO_EXPR__##/s);
        return match ? match[1] : null
    };

    /** Compiles the expression, returning the SyntaxError message rather than throwing. */
    const parseFailure = expression => {
        try {
            new Function('count', `return ${expression}`);
            return null
        } catch (error) {
            return error.message
        }
    };

    test('text node: an apostrophe in static text next to an interpolation still parses', () => {
        // html`<div>it's ${count} here</div>` — the minimal shape that reaches the `:120` chain.
        // An apostrophe alone is not enough: without a dynamic part there is no addition chain and
        // the static text is never wrapped in a quoted literal.
        const result     = processHtmlTemplateLiteral(["<div>it's ", ' here</div>'], ['count']),
              expression = extractExpression(result?.text);

        expect(expression, 'the dynamic part must produce an expression chain').not.toBeNull();
        expect(parseFailure(expression)).toBeNull()
    });

    test('attribute: an apostrophe in a static attribute chunk still parses', () => {
        // html`<div title="it's ${count}"></div>` — the `:182` chain, independent of the text path.
        const result = processHtmlTemplateLiteral(['<div title="it\'s ', '"></div>'], ['count']),
              // Attribute expressions land on the attribute, not on `text`.
              expression = extractExpression(result?.title ?? result?.attributes?.title);

        expect(expression, 'the dynamic attribute must produce an expression chain').not.toBeNull();
        expect(parseFailure(expression)).toBeNull()
    });

    test('a TRAILING backslash does not consume the closing delimiter', () => {
        // The defect one character over: escaping the quote but not the backslash lets a trailing
        // `\` escape the closing quote. CodeQL named only the quote, so this arm is what keeps a
        // literal-minded fix from closing the alert while the bug survives.
        //
        // The chunk must END in the backslash. An interior `a\b` emits `'a\b '`, where `\b` is a
        // valid escape — it parses, and corrupts the value to a backspace instead. That is a real
        // but DIFFERENT manifestation, and using it here would make this arm fail on the apostrophe
        // or on nothing at all rather than on the backslash. Isolated deliberately.
        const result     = processHtmlTemplateLiteral(['a\\', ' b'], ['count']),
              expression = extractExpression(result?.text);

        expect(expression, 'the dynamic part must produce an expression chain').not.toBeNull();
        expect(parseFailure(expression)).toBeNull();

        // Round-trip, so a fix cannot pass by dropping the backslash.
        expect(new Function('count', `return ${expression}`)('X')).toBe('a\\X b')
    });

    test('an INTERIOR backslash is not silently reinterpreted as an escape', () => {
        // `a\b` emits `'a\b '`, which parses but yields a backspace character. Parse-only coverage
        // is blind to this, so the value is the assertion.
        const result     = processHtmlTemplateLiteral(['a\\b ', 'c'], ['count']),
              expression = extractExpression(result?.text);

        expect(expression).not.toBeNull();
        expect(new Function('count', `return ${expression}`)('X')).toBe('a\\b Xc')
    });

    test('escaping does not corrupt the value: the chain still evaluates to the original text', () => {
        // Parse-only assertions accept an emitter that escapes into a *different* string — e.g. one
        // that drops the apostrophe entirely. This arm pins the round-trip, so the fix has to
        // preserve the text rather than merely produce something compilable.
        const result     = processHtmlTemplateLiteral(["it's ", ' done'], ['count']),
              expression = extractExpression(result?.text);

        expect(expression).not.toBeNull();

        const evaluated = new Function('count', `return ${expression}`)('X');

        expect(evaluated).toBe("it's X done")
    });

    test('a static-only template is untouched — no chain, no escaping', () => {
        // Non-vacuity control in the other direction: the escaping path must not start firing on
        // templates that have no dynamic part, which would change output for every static node.
        const result = processHtmlTemplateLiteral(["<div>it's here</div>"], []);

        expect(extractExpression(result?.text)).toBeNull();
        expect(result?.text).toBe("it's here")
    });
});
