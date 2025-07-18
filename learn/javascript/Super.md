# Super

To call a super-class method use the `super` keyword.

```javascript readonly
class Mammal extends Base {
    static config = {
        className: 'Simple.example.Mammal',

        name: 'Anonymous'
    }
    doSomething(){
        console.log(`${this.name} is doing something mammals do`)
    }
}
export default Neo.setupClass(Mammal);
```

```javascript readonly
class Human extends Mammal {
    static config = {
        className: 'Simple.example.Human',
    }
    doSomething(){
        super.doSomething();
        console.log(`${this.name} is doing something humans do`)
    }
}

Human = Neo.setupClass(Human);

const myPerson = Neo.create(Human, {
    name: 'Herbert'
});

myPerson.doSomething();
```

Sometimes you aren't sure if a super class has a method. In that case use the
conditional chaining operator &mdash; `?.`

```javascript readonly
class Mammal extends Base {
    static config = {
        className: 'Simple.example.Mammal',

        name: 'Anonymous'
    }
    doSomething(){
        console.log(`${this.name} is doing something mammals do`)
    }
}
export default Neo.setupClass(Mammal);
```

```javascript readonly
class Human extends Mammal {
    static config = {
        className: 'Simple.example.Human',
    }
    doSomething(){
        super.doSomething?.();
        console.log(`${this.name} is doing something humans do`)
    }
}

Human = Neo.setupClass(Human);

const myPerson = Neo.create(Human, {
    name: 'Herbert'
});

myPerson.doSomething();
```
