import Base from '../core/Base.js';

declare namespace Neo.util {
    class KeyNavigation extends Base {
        static config: KeyNavigation.Config;

        add(value: any): void;
        onKeyDown(data: { key: string }): void;
        parseKeys(value: object | Array<any>): Array<any>;
        protected parseUpperCaseKey(key: string): string;
        register(component: Neo.component.Base): void;
        removeKey(config: object): void;
        removeKeys(items: Array<any>): void;
        unregister(): void;
    }

    namespace KeyNavigation {
        interface Config extends Neo.core.Base.Config {
            /**
             * @member {String} className='Neo.util.KeyNavigation'
             * @protected
             */
            className: 'Neo.util.KeyNavigation';
            /**
             * @member {String} ntype='keynav'
             * @protected
             */
            ntype: 'keynav';
            /**
             * Internally stores the component id inside _component
             * @member {Neo.component.Base|null} component_=null
             */
            component_?: Neo.component.Base | null;
            /**
             * Set this to true in case the keydown event is supposed to bubble upwards inside the component tree
             * @member {Boolean} keyDownEventBubble=false
             */
            keyDownEventBubble?: boolean;
            /**
             * @member {Array|null} keys_=null
             */
            keys_?: Array<any> | null;
        }
    }
}

// This attempts to capture the effect of setupClass() applying config to the prototype
type WithConfig<T> = {
    [K in keyof T]: K extends keyof Neo.util.KeyNavigation.Config ? T[K] : never;
};

type KeyNavigationClass = Neo.util.KeyNavigation & WithConfig<Neo.util.KeyNavigation.Config>;

declare const KeyNavigation: KeyNavigationClass & {
    new (config?: Partial<Neo.util.KeyNavigation.Config>): Neo.util.KeyNavigation;
    config: Neo.util.KeyNavigation.Config;
    isClass: boolean;
    observable: boolean;
    registerToGlobalNs: boolean;
};

export default KeyNavigation;
