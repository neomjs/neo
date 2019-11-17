1. Flaws of the ES6 class system
    1. No "this" inside constructors before the parent call
    2. It is not possible to define properties inside the class body without using get & set
    3. No private methods or properties
    4. No support for mixins
2. Neo Modules & Classes
    1. One Class per File
    2. Each Class is "wrapped" inside a JS Module
    3. Private Class methods
    4. *.mjs
3. Neo ES6 Class Enhancements
    1. Neo.applyClassConfig
    2. Reducing boiler plate code

#### (1) Flaws of the ES6 class system

(1.1.) This might not sound like a big deal at first, but it does prevent any pre-processing inside the constructor chain.
```
class TabContainer extends Container {
    constructor(config) {
        //let me = this; // breaks!
        super(config);
        let me = this;  //ok
    }
}
```

(1.2.) The most likely biggest flaw is that you can not define any properties directly inside the class body,
as well as a missing config system.
```
class TabContainer extends Container {
    activeIndex: 1 // nope
    static foo: 'bar' // impossible as well
}
```
There is hope: <https://tc39.github.io/proposal-class-fields/#sec-private-bound-names>

(1.3.) Although there are some proposals out there for many years, still not implemented.

(1.4.) Independant whether you like the mixin pattern or not, it is just not possible.

- - - -

#### (2) Neo Modules & Classes

(2.1.) One Class per File. Might sound trivial from classic OOP concepts, but we do stick to it and recommend you to
do the same for your application files.

(2.2) As soon as you want to extend an ES6 class, you need to ensure that the base class is available.
One good way to achieve this is to use import:

<https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import>

This automatially makes the file a JS module and you will notice that we will at least export the Class
at the end of of each module.

(2.3) Having the JS Module around each Class definition allows us to place methods outside of the class deinition,
but still between the import and export statements. A nice place for "private" methods or attributes which can get
accessed from Class methods easily, but not as easy from the outside world.

(2.4.) In case you missed it, *.mjs is not something we came up with, but the new standard file extension name for 
Javascript Modules. You can find more details e.g. in Axels Blog:

<http://2ality.com/2017/05/es-module-specifiers.html>

- - - -

#### (3) Neo ES6 Class Enhancements

(3.1.) To reduce the issue of 1.2. we created Neo.applyClassConfig (Neo.mjs),
which does get called in every Class File at the very bottom (before the export statement).
If you look at Neo Class / Module files, like component/Button.mjs, you will notice 2 methods at the top of the class body:

##### getStaticConfig

##### getConfig

Both methods simply return an object. Put all static keys into getStaticConfig and all other ones into getConfig.
Neo.applyClassConfig **(strongly recommended to look at the source code)** will apply all static configs to the class
constructor (as well as adding the staticConfig object itself there) and all non static configs will get added using
Object.defineProperty() on the Class prototype.

So, why is a "config system" useful, you might ask yourself at this point.
This can easily get showcased using a simple example:

```
class TabContainer extends Container {
    get activeIndex() {
        return this._activeIndex || 0;
    }
    set activeIndex(value) {
        this._activeIndex = value;
    }
}
```
So far so good, we now have an activeIndex property which will use _activeIndex to read & save its value.
Now you might want to extend this class:
```
class MyTabContainer extends TabContainer {
    static getConfig() {return {
        _activeIndex: 1
    }}
}
```
Ok, this one was easy. _activeIndex will get applied as a class property.
Neither the first version with 0 nor the second one using the underscore and the value of 1 will trigger the setter.
When you call:
```
Neo.create(MyTabContainer);
```
the constructor of our Base Class (Neo.core.Base) will call initConfig(),
which will apply _activeIndex to the instance, silently setting the value

```
class MyTabContainer2 extends TabContainer {
    static getConfig() {return {
        activeIndex: 1
    }}
}
```
Now it does get more interesting. You want to trigger the setter when creating an instance,
but you definitely do **not** want to override the activeIndex property defined via get & set with the new one.
No worries, Neo.applyClassConfig will check the base class prototype chain and in case it does find a property with the
same name, it will not override the version having the setter. Instead it will only apply activeIndex inside the config
object itself.
Now, when you call:
```
Neo.create(MyTabContainer2);
```
the constructor of our Base Class (Neo.core.Base) will call initConfig(),
which will apply activeIndex to your instance and this will call the setter.
```
Neo.create(MyTabContainer2, {
    activeIndex: 2
});
```
This will also call the setter **once**, this time using the value of 2
(initConfig does merge the prototype config object with the one you pass into Neo.create -> the constructor)

(3.2.) Reducing boiler plate code. When looking back at the first TabContainer example you will probably think:
Damn, in case I want to define many properties via get&set which all just save&get their value inside an undercored
version of its name key, this will create quite some overhead.

To avoid this and make your code more beautiful, we added a trailing underscore for class configs:
```
class TabContainer extends Container {
    static getConfig() {return {
        activeIndex_: 0
    }}
}
```
Look close: activeIndex<span style="color:red;font-size:200%;">_</span> .This gets you the exact same result as the previous example:
```
class TabContainer extends Container {
    get activeIndex() {
        return this._activeIndex || 0;
    }
    set activeIndex(value) {
        this._activeIndex = value;
    }
}
```
Even better, this also **optionally** gives you support for 3 more methods you can use:
```
class TabContainer extends Container {
    static getConfig() {return {
        activeIndex_: 0
    }}
    
    beforeSetActiveIndex(value, oldValue) {
        return 42; // the answer to Life, the Universe, and Everything
    }
    
    beforeGetActiveIndex(value) {
        return 5; // but hey, why tell anyone?
    }
    
    // this one would only get called in case value !== oldValue
    afterSetActiveIndex(value, oldValue) {
        // update the UI
    }
}
```
<a href="module-Neo.html#~autoGenerateGetSet">Details here</a>



