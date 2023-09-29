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

        routes:{
            '/home' :  'handleHomeRoutes',
            '/users/{userId}' : {handler: 'handleUserRoute', preHandler: 'doPrehandling'},
            '/users/{userId}/posts/{postId}' : {handler:'handleUserPostsRoute', preHandler: 'doPrehandlingFalse'},
            default: 'doDefaultHandling' //optional
        }

    }

    onConstructed() {
        super.onConstructed();
        Neo.Main.redirectTo({ url: '#/home' });

    }

    doPrehandling(value, oldValue, params = null) {
        console.log(`doPrehandling -> ${value} -> ${oldValue} --> ${params}`)
        return true;
    }
    doPrehandlingFalse(value, oldValue, params = null) {
        console.log(`doPrehandlingFalse -> ${value} -> ${oldValue} --> ${params}`)
        return false;
    }

    handleHomeRoutes(value, oldValue, params = null) {
        console.log(`HandleHomeRoutes -> ${value} -> ${oldValue} --> ${params}`)
    }
    handleUserRoute(value, oldValue, params = null) {
        console.log(`handleUserRoute -> ${value} -> ${oldValue} --> ${params}`)
    }
    handleUserPostsRoute(value, oldValue, params = null) {
        console.log(`handleUserRoute -> ${value} -> ${oldValue} --> ${params}`)
    }

    onNoRouteFound(value, oldValue) {
        console.error(`onNoRouteFound -> ${value} -> ${oldValue}`)
    }

    doDefaultHandling(value, oldValue) {
        console.log(`doDefaultHandling -> ${value} -> ${oldValue}`)
        Neo.Main.redirectTo({ url: '#/home' });
    }
}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
