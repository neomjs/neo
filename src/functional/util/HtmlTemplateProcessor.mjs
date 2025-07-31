import Base           from '../../../src/core/Base.mjs';
import {HtmlTemplate} from './html.mjs';
import * as parse5    from '../../../dist/parse5.mjs';
import * as Logic     from './HtmlTemplateProcessorLogic.mjs';

/**
 * A singleton class responsible for processing HtmlTemplate objects at runtime.
 * It delegates the core transformation logic to `HtmlTemplateProcessorLogic`,
 * injecting the `Neo.ns` namespace resolver to handle component tags.
 * @class Neo.functional.util.HtmlTemplateProcessor
 * @extends Neo.core.Base
 * @singleton
 */
class HtmlTemplateProcessor extends Base {
    static config = {
        /**
         * @member {String} className='Neo.functional.util.HtmlTemplateProcessor'
         * @protected
         */
        className: 'Neo.functional.util.HtmlTemplateProcessor',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Delegates to the logic module, providing the Neo-specific namespace resolver.
     * @param {Object} ast The root parse5 AST
     * @param {Array<*>} values Interpolated values
     * @param {String} originalString The flattened template string
     * @param {Array<string>} attributeNames The original attribute names with mixed case
     * @returns {Object} The final Neo.mjs VDOM
     */
    convertAstToVdom(ast, values, originalString, attributeNames) {
        return Logic.convertAstToVdom(ast, values, originalString, attributeNames, Neo.ns, { trimWhitespace: false });
    }

    /**
     * Delegates directly to the logic module.
     * @param {Neo.functional.util.HtmlTemplate} template The root template object
     * @returns {{flatString: string, flatValues: Array<*>, attributeNames: Array<string>}}
     */
    flattenTemplate(template) {
        return Logic.flattenTemplate(template);
    }

    /**
     * The main entry point for processing a template at runtime.
     * It orchestrates the flattening, parsing, and VDOM conversion, and then passes the result
     * back to the component to continue its update lifecycle.
     * @param {Neo.functional.util.HtmlTemplate} template The root template object
     * @param {Neo.functional.component.Base} component The component instance
     */
    process(template, component) {
        const
            me                                       = this,
            {flatString, flatValues, attributeNames} = me.flattenTemplate(template),
            ast                                      = parse5.parseFragment(flatString, {sourceCodeLocationInfo: true}),
            parsedVdom                               = me.convertAstToVdom(ast, flatValues, flatString, attributeNames);

        component.continueUpdateWithVdom(parsedVdom)
    }
}

export default Neo.setupClass(HtmlTemplateProcessor);
