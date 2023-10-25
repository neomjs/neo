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
         '/contact': 'handleContactRoute',
         '/users/{userId}': { handler: 'handleUserRoute', preHandler: 'doPrehandling' },
         // '/users/{userId}' : {handler: 'handleUserRoute', preHandler: 'doPrehandling'}, //example
         //'/users/{userId}/posts/{postId}' : {handler:'handleUserPostsRoute', preHandler: 'doPrehandlingFalse'}, //example
         // default: 'doDefaultHandling' //optional - example
      },

      //Demo data
      data: {
         users: [{ id: 1, name: 'Joe Doe' }, { id: 2, name: 'Max Mustermann' }],
         activeUser: 0
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


   doPrehandling(value, oldValue, params = null) {
      const userId = parseInt(params.userId);

      if (userId > 0 && userId === this.data.activeUser) {
         return true;
      }

      const centerContainer = this.getReference('center-container');
      centerContainer.layout.activeIndex = 5;

      return false;

   }

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

      Neo.Main.redirectTo({ url: `#/users/${this.data.activeUser}` });
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

   /**
   * @param {Object} data
   */
   onSwitchButtonMetaUser1(data) {
      const currentUser = this.data.activeUser;
      this.data.activeUser = 1;
      this.#removeMetaButtonSelection();
      this.#setUsername();
      data.component?.addCls('route_meta_button_grant_selected');
   }

   /**
   * @param {Object} data
   */
   onSwitchButtonMetaUser2(data) {
      const currentUser = this.data.activeUser;
      this.data.activeUser = 2;
      this.#removeMetaButtonSelection();
      this.#setUsername();
      data.component?.addCls('route_meta_button_grant_selected');
   }

   /**
   * @param {Object} data
   */
   onSwitchButtonMetaReset(data) {
      this.data.activeUser = 0;
      this.#setUsername();
      this.#removeMetaButtonSelection();
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

   handleContactRoute(value, oldValue, params = null) {
      const centerContainer = this.getReference('center-container');
      centerContainer.layout.activeIndex = 0;
   }

   handleUserRoute(value, oldValue, params = null) {
      const centerContainer = this.getReference('center-container');
      centerContainer.layout.activeIndex = 1
   }

   #removeFromButtonSelection() {
      const buttonbar = this.getReference('buttonbar');
      buttonbar.items.forEach(element => {
         element.removeCls('route_button_selected');
      });

      const footer = this.getReference('footer-container');
      footer.items.forEach(element => {
         element.removeCls('route_button_selected');
      });

   }

   #addButtonSelection(data) {
      data.component?.addCls('route_button_selected');
   }

   #removeMetaButtonSelection(user) {
      const buttonbar = this.getReference('metabar');
      buttonbar.items.forEach(element => {
         element.removeCls('route_meta_button_grant_selected');
      });
      this.#removeFromButtonSelection();
      const data = {
         component: this.getReference('home_button')
      }
      this.#addButtonSelection(data);
      Neo.Main.redirectTo({ url: '#/home' });

   }

   #setUsername() {
      const user = this.data.users.find(item => { return item.id === this.data.activeUser });

      const centerContainer = this.getReference('center-container');
      const adminPage = centerContainer.items[1];
      adminPage.username = user ? user.name : '';

   }

}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
