import ComponentController from '../../../src/controller/Component.mjs';

/**
 * @summary Applies the toolbar's choices to the frames: Flexbox configs on three stages, and one active item on two.
 * @class Neo.examples.layout.sideBySide.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static config = {
        /**
         * @member {String} className='Neo.examples.layout.sideBySide.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.layout.sideBySide.MainContainerController'
    }

    /**
     * The index of the item the card and the cube show; the cube starts angled, on no face.
     * @member {Number} activeIndex=0
     */
    activeIndex = 0

    /**
     * The three stages whose layout is a Flexbox, the only ones align, pack and flex apply to.
     * @returns {Neo.container.Base[]}
     */
    getFlexboxStages() {
        return ['hbox', 'vbox', 'flexbox'].map(reference => this.getReference(reference))
    }

    /**
     * @param {Object} data
     */
    onAlignClick(data) {
        this.setFlexboxConfig('align', data.component)
    }

    /**
     * A layout reads an item's flex when it lays the item out, so a change at runtime goes to the item's style.
     * @param {Object} data
     * @param {Boolean} data.value
     */
    onFlexChange(data) {
        let flex = data.value ? '1 1 0%' : '0 1 auto';

        this.getFlexboxStages().forEach(stage => {
            stage.items.forEach(item => {
                let style = item.wrapperStyle;

                style.flex = flex;
                item.wrapperStyle = style
            })
        })
    }

    /**
     * Steps the card and the cube to the same next item.
     */
    onNextClick() {
        let me = this;

        me.activeIndex = (me.activeIndex + 1) % 6;

        me.getReference('card').layout.activeIndex = me.activeIndex;
        me.getReference('cube').layout.activeIndex = me.activeIndex
    }

    /**
     * @param {Object} data
     */
    onPackClick(data) {
        this.setFlexboxConfig('pack', data.component)
    }

    /**
     * Presses the clicked button alone in its group and sets its text as the config on every Flexbox stage.
     * @param {String} config 'align' or 'pack'
     * @param {Neo.button.Base} button
     */
    setFlexboxConfig(config, button) {
        button.parent.items.forEach(item => {
            if (item.ntype === 'button') {
                item.pressed = item === button
            }
        });

        this.getFlexboxStages().forEach(stage => {
            stage.layout[config] = button.text
        })
    }
}

export default Neo.setupClass(MainContainerController);
