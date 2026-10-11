import Component from '../../../../../src/component/Base.mjs';

/**
 * @class Test.Playwright.Component.DockAuthoring.Pane
 * @extends Neo.component.Base
 * @summary Ordinary pane with an instance-only construction witness.
 */
class Pane extends Component {
    /** @member {Number} sequence=0 @static */
    static sequence = 0

    static config = {
        className: 'Test.Playwright.Component.DockAuthoring.Pane',
        baseCls  : ['dock-authoring-pane']
    }

    /**
     * @summary Gives each constructed object a witness which cannot survive recreation.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.instanceWitness = `${this.className}:${++this.constructor.sequence}`
    }
}

export default Neo.setupClass(Pane);
