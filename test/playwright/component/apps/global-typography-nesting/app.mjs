import Component from '../../../../../src/component/Base.mjs';
import Container from '../../../../../src/container/Base.mjs';
import Viewport  from '../../../../../src/container/Viewport.mjs';

/**
 * @summary Renders one `h1`, one `mark` and one inline `code` so a spec can read their COMPUTED
 * styles — the only instrument that can see this contract.
 *
 * The emitted CSS cannot answer the question the spec asks. `resources/scss/src/Global.scss`
 * declares `var(--token, revert)` for each of these properties, and whether that fallback fires
 * depends on whether the token is present in the element's scope — which is a cascade fact, not a
 * text fact. A stylesheet diff shows the same bytes in both arms.
 * @class Test.Playwright.Component.GlobalTypographyNesting.Specimen
 * @extends Neo.component.Base
 */
class TypographySpecimen extends Component {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.GlobalTypographyNesting.Specimen'
         * @protected
         */
        className: 'Test.Playwright.Component.GlobalTypographyNesting.Specimen'
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const me = this;

        me.vdom.cn = [
            {tag: 'h1',   id: `${me.id}-h1`,   text: 'Heading'},
            {tag: 'mark', id: `${me.id}-mark`, text: 'Marked'},
            {tag: 'code', id: `${me.id}-code`, text: 'inline()'}
        ]
    }
}

TypographySpecimen = Neo.setupClass(TypographySpecimen);

/**
 * @summary A CLASSIC theme scope, carried as a class default so item creation hands it down.
 *
 * `neo-theme-dark` is deliberate and is not a stand-in for a neo theme: the classic families are
 * the ones that DECLINE the global element typography, and declining is the half that a nested
 * scope can get wrong. This is the shape shipped on the portal home page —
 * `apps/portal/view/home/parts/Helix.mjs` and `Colors.mjs` both set `theme: 'neo-theme-dark'`
 * inside the neo-themed portal — so the fixture reproduces a real configuration rather than one
 * constructed to fail.
 * @class Test.Playwright.Component.GlobalTypographyNesting.ClassicScope
 * @extends Neo.container.Base
 */
class ClassicScope extends Container {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.GlobalTypographyNesting.ClassicScope'
         * @protected
         */
        className: 'Test.Playwright.Component.GlobalTypographyNesting.ClassicScope',
        /**
         * @member {String} theme='neo-theme-dark'
         */
        theme: 'neo-theme-dark'
    }
}

ClassicScope = Neo.setupClass(ClassicScope);

/**
 * Two specimens: one under the app's neo theme (the first `themes` entry, stamped on the body), one
 * inside a nested classic scope. The outer arm is what makes the inner assertion non-vacuous — a
 * fixture whose outer scope resolved nothing would let the inner arm pass for the wrong reason.
 */
export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        id    : 'global-typography-nesting-viewport',
        layout: {ntype: 'vbox', align: 'start'},
        style : {gap: '40px', padding: '40px'},
        items : [{
            module: TypographySpecimen,
            id    : 'outer-neo'
        }, {
            module: ClassicScope,
            id    : 'classic-scope',
            layout: {ntype: 'vbox', align: 'start'},
            style : {padding: '20px'},
            items : [{
                module: TypographySpecimen,
                id    : 'inner-classic'
            }]
        }]
    },
    name: 'Test.Playwright.GlobalTypographyNesting'
});
