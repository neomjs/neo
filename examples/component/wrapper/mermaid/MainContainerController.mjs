import ComponentController from '../../../../src/controller/Component.mjs';
import {DIAGRAMS}          from './diagrams.mjs';

/**
 * @summary Keeps the Mermaid example's diagram in step with its source: an edit or a preset sets the
 * diagram's `value`, and the theme switch sets the example's theme, which the diagram follows.
 *
 * @class Neo.examples.component.wrapper.mermaid.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.wrapper.mermaid.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.component.wrapper.mermaid.MainContainerController'
    }

    /**
     * @summary Loads a preset into the source; the source's change draws it.
     * @param {Object} data
     */
    onPresetClick(data) {
        this.getReference('source').value = DIAGRAMS[data.component.text]
    }

    /**
     * @param {Object} data
     */
    onSourceChange(data) {
        this.getReference('diagram').value = data.value
    }
}

export default Neo.setupClass(MainContainerController);
