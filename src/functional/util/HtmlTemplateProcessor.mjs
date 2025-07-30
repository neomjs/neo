import Neo            from '../../../src/Neo.mjs';
import Base           from '../../../src/core/Base.mjs';
import {HtmlTemplate} from './html.mjs';

/**
 * A singleton class responsible for processing HtmlTemplate objects,
 * coordinating with the HtmlStringToVdom addon, and continuing the
 * component update lifecycle.
 * @class Neo.functional.util.HtmlTemplateProcessor
 * @extends Neo.core.Base
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
     * This method is the entry point for processing a template.
     * It flattens the template, calls the parsing addon, and then
     * calls back to the component to continue the update process.
     * @param {Neo.functional.util.HtmlTemplate} template The root template object
     * @param {Neo.functional.component.Base} component The component instance
     */
    async process(template, component) {
        const me = this;
        const {flatString, flatValues} = me.flattenTemplate(template);

        const parsedVdom = await Neo.main.addon.HtmlStringToVdom.createVdom({
            value : flatString,
            values: flatValues
        });

        // The component update can continue synchronously after the await
        component.continueUpdateWithVdom(parsedVdom);
    }

    /**
     * Recursively flattens a nested HtmlTemplate structure into a single
     * string with placeholders and a single array of corresponding values.
     * @param {Neo.functional.util.HtmlTemplate} template
     * @returns {{flatString: string, flatValues: Array<*>}}
     */
    flattenTemplate(template) {
        let flatString = '';
        const flatValues = [];

        for (let i = 0; i < template.strings.length; i++) {
            flatString += template.strings[i];

            if (i < template.values.length) {
                const value = template.values[i];

                if (value instanceof HtmlTemplate) {
                    // If the value is another template, recurse
                    const nested = this.flattenTemplate(value);
                    // Adjust indices for the nested values
                    const nestedString = nested.flatString.replace(/__DYNAMIC_VALUE_(\d+)__/g, (match, index) => {
                        return `__DYNAMIC_VALUE_${parseInt(index, 10) + flatValues.length}__`;
                    });
                    flatString += nestedString;
                    flatValues.push(...nested.flatValues);
                } else {
                    // Otherwise, add the value and a placeholder
                    flatString += `__DYNAMIC_VALUE_${flatValues.length}__`;
                    flatValues.push(value);
                }
            }
        }

        return {flatString, flatValues};
    }
}

export default Neo.setupClass(HtmlTemplateProcessor);
