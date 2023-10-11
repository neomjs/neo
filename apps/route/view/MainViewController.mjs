import Component from '../../../src/controller/Component.mjs';

/**
 * @class Route.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Component {
   static config = {
      /**
       * @member {String} className='Route.view.MainContainerController'
       * @protected
       */
      className: 'Route.view.MainContainerController'
   }


   /**
    * Card sort order
    * 0 - Contact
    * 1 - Administration
    * 2 - Section 1
    * 3 - Section 2
    */

   /**
   * @param {Object} data
   */
   onSwitchButtonCardContact(data) {
      const centerContainer = this.getReference('center-container');
      console.log(centerContainer);
      centerContainer.layout.activeIndex = 0;
      console.log('button clicked - Contact');
   }

   /**
       * @param {Object} data
       */
   onSwitchButtonAdministration(data) {
      const centerContainer = this.getReference('center-container');
      console.log(centerContainer);
      centerContainer.layout.activeIndex = 1;
      console.log('button clicked - verein');
   }

   /**
* @param {Object} data
*/
   onSwitchButtonCardSection1(data) {
      const centerContainer = this.getReference('center-container');
      console.log(centerContainer);
      centerContainer.layout.activeIndex = 2;
      console.log('button clicked - fussball ');
   }

   /**
* @param {Object} data
*/
onSwitchButtonCardSection2(data) {
      const centerContainer = this.getReference('center-container');
      console.log(centerContainer);
      centerContainer.layout.activeIndex = 3;
      console.log('button clicked - tischtennis');
   }




}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
