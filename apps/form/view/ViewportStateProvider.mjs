import SideNavStore  from '../store/SideNav.mjs'
import StateProvider from '../../../src/state/Provider.mjs';

/**
 * @class Form.view.ViewportStateProvider
 * @extends Neo.state.Provider
 */
class ViewportStateProvider extends StateProvider {
    static config = {
        /**
         * @member {String} className='Form.view.ViewportStateProvider'
         * @protected
         */
        className: 'Form.view.ViewportStateProvider',
        /**
         * @member {Object} data
         */
        data: {
            /**
             * The index of the open step
             * @member {Number} data.activeIndex
             */
            activeIndex: 0,
            /**
             * The name of the open step
             * @member {String} data.activeTitle
             */
            activeTitle: 'About you',
            /**
             * The index of the last step, which the step list sets from its store
             * @member {Number} data.maxIndex
             */
            maxIndex: 0,
            /**
             * What the open step asks the visitor to fix after Next or Create account met an invalid field
             * @member {String|null} data.stepMessage
             */
            stepMessage: null,
            /**
             * True while a phone shows the step list above the form
             * @member {Boolean} data.stepsOpen
             */
            stepsOpen: false
        },
        /**
         * @member {Object} stores
         */
        stores: {
            /**
             * One record per step, in the order of the cards inside `pages-container`
             * @member {Object} stores.sideNav
             */
            sideNav: {
                module: SideNavStore,
                data  : [
                    {cardIndex: 0, id: 'about-you',   name: 'About you'},
                    {cardIndex: 1, id: 'address',     name: 'Address'},
                    {cardIndex: 2, id: 'team',        name: 'Your team'},
                    {cardIndex: 3, id: 'preferences', name: 'Preferences'},
                    {cardIndex: 4, id: 'review',      name: 'Review'}
                ]
            }
        }
    }
}

export default Neo.setupClass(ViewportStateProvider);
