declare namespace Neo.core {
    class Base {
        static config: Base.Config;
        static configSymbol: symbol;
        static isClass: boolean;
        static observable: boolean;
        static registerToGlobalNs: boolean;

        constructor(config?: Partial<Base.Config>);

        [configSymbol: symbol]: object;
        [key: string]: any;

        initConfig(config: object): void;
        afterSetId(value: string, oldValue: string): void;
        applyOverwrites(config: object): void;
        beforeSetEnumValue(value: any, oldValue: any, staticName: string): any;
        beforeSetId(value: string, oldValue: string): string;
        construct(config: object): void;
        destroy(preventDestroy?: boolean): void;
        getConfigData(): object;
        getStaticConfig(key: string): any;
        init(): void;
        mergeConfig(config: object): object;
        onConstructed(): void;
        onAfterConstructed(): void;
        parseConfigValue(value: any): any;
        setStaticConfig(key: string, value: any): void;
        toJSON(): object;
        toString(): string;
        valueOf(): string;
    }

    namespace Base {
        interface Config {
            /**
             * The class name which will get mapped into the Neo or app namespace
             */
            className: string;
            /**
             * The unique component id
             */
            id?: string;
            /**
             * Add mixins as an array of classNames, imported modules or a mixed version
             */
            mixins?: Array<string | object>;
            /**
             * The unique ntype of this class
             */
            ntype?: string;
            /**
             * True automatically applies the core.Observable mixin
             */
            observable?: boolean;
            /**
             * True for classes which should not get cached
             */
            singleton?: boolean;
            [key: string]: any;
        }
    }

    interface BaseConstructor extends Function {
        new (config?: Partial<Base.Config>): Base;
        config: Base.Config;
        isClass: boolean;
        observable: boolean;
        registerToGlobalNs: boolean;
    }
}

// This attempts to capture the effect of setupClass() applying config to the prototype
type WithConfig<T> = {
    [K in keyof T]: K extends keyof Neo.core.Base.Config ? T[K] : never;
};

type BaseWithConfig = Neo.core.Base & WithConfig<Neo.core.Base.Config>;

declare const Base: Neo.core.BaseConstructor & WithConfig<Neo.core.Base.Config>;

export default Base;
