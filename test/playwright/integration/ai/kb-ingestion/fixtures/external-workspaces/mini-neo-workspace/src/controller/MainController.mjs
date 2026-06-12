/**
 * @summary Controller fixture with a stable method sentinel for server-side parsing.
 */
export default class MainController {
    route = 'alpha-route';

    /**
     * @summary Emits the controller activation sentinel used by golden parsed chunks.
     * @returns {String}
     */
    activate() {
        return 'tenant alpha controller activated';
    }
}
