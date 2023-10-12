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
      className: 'Route.view.MainContainerController',


      routes: {
         '/home': 'handleHomeRoute',
         '/section1': 'handleSection1Route',
         '/section2': 'handleSection2Route',
         // '/users/{userId}' : {handler: 'handleUserRoute', preHandler: 'doPrehandling'}, //example
         // '/users/{userId}/posts/{postId}' : {handler:'handleUserPostsRoute', preHandler: 'doPrehandlingFalse'}, //example
         // default: 'doDefaultHandling' //optional - exmple
      }
   }

   onConstructed() {
      super.onConstructed();


   }

   /**
    * Card sort order
    * 0 - Contact
    * 1 - Administration
    * 2 - Section 1
    * 3 - Section 2
    * 4 - Home
    */

   /**
   * @param {Object} data
   */
   onSwitchButtonCardContact(data) {
      Neo.Main.redirectTo({ url: '#/contact' });
      this.#removeFromButtonSelection();
      this.#addButtonSelection(data);
   }

   /**
       * @param {Object} data
       */
   onSwitchButtonAdministration(data) {

      Neo.Main.redirectTo({ url: '#/user/x' });
      this.#removeFromButtonSelection();
      this.#addButtonSelection(data);

   }

   /**
   * @param {Object} data
   */
   onSwitchButtonCardSection1(data) {
      Neo.Main.redirectTo({ url: '#/section1' });
      this.#removeFromButtonSelection();
      this.#addButtonSelection(data);

   }

   /**
   * @param {Object} data
   */
   onSwitchButtonCardSection2(data) {
      Neo.Main.redirectTo({ url: '#/section2' });
      this.#removeFromButtonSelection();
      this.#addButtonSelection(data);
   }

   /**
   * @param {Object} data
   */
   onSwitchButtonCardHome(data) {
      Neo.Main.redirectTo({ url: '#/home' });
      this.#removeFromButtonSelection();
      this.#addButtonSelection(data);

   }


   handleHomeRoute(value, oldValue, params = null) {
      const centerContainer = this.getReference('center-container');
      centerContainer.layout.activeIndex = 4;
   }

   handleSection1Route(value, oldValue, params = null) {
      const centerContainer = this.getReference('center-container');
      centerContainer.layout.activeIndex = 2;
   }

   handleSection2Route(value, oldValue, params = null) {
      const centerContainer = this.getReference('center-container');
      centerContainer.layout.activeIndex = 3;
   }

   #removeFromButtonSelection(){
      const buttonbar = this.getReference('buttonbar');
      buttonbar.items.forEach(element => {
         element.removeCls('route_button_selected');
      });

      const footer = this.getReference('footer-container');
      footer.items.forEach(element => {
         element.removeCls('route_button_selected');
      });

   }

   #addButtonSelection(data){
      data.component?.addCls('route_button_selected');
   }

}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
