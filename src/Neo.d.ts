declare namespace Neo {
    const ntypeMap: Record<string, string>;
    const insideWorker: boolean;

    function applyFromNs(target: any, namespace: any, config: Record<string, string>, bind?: boolean): any;
    function applyToGlobalNs(cls: Function | object): void;
    function assignDefaults(target: object, defaults: object): object;
    function camel(value: string): string;
    function capitalize(value: string): string | false;
    function clone<T>(obj: T, deep?: boolean, ignoreNeoInstances?: boolean): T;
    function cloneNeoInstance(instance: any): any;
    function create(className: string | object | Function, config?: object): any;
    function emptyFn(): void;
    function hasPropertySetter(proto: object, key: string): boolean;
    function merge(target: object, source: object, defaults?: object): object;
    function ns(names: string | string[], create?: boolean, scope?: object): object;
    function nsWithArrays(names: string | string[], create?: boolean, scope?: object): object;
    function ntype(ntype: string | { ntype: string, [key: string]: any }, config?: object): any;
    function setupClass<T extends Function>(cls: T): T;
    function typeOf(item: any): string | null;

    // Add other utility functions that are borrowed in the Neo namespace
    const bindMethods: Function;
    const createStyleObject: Function;
    const createStyles: Function;
    const decamel: Function;
    const isArray: Function;
    const isBoolean: Function;
    const isDefined: Function;
    const isEqual: Function;
    const isNumber: Function;
    const isObject: Function;
    const isString: Function;
    const toArray: Function;
}

export default Neo;
export as namespace Neo;
