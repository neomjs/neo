# Overriding Methods

In Neo.mjs you sub-class and override methods in the usual way. 

Here, we'll extend `Mammal` and override the `speak()` method. 
(For brevity, we'll exclude `export` and `import` statements.)

```javascript readonly
class Mammal extends Base {
    static config = {
        className: 'Simple.example.Mammal',

        name: 'Anonymous'
    }
    speak(){
        console.log(`(${this.name} is grunting)`);
    }
}
export default Neo.setupClass(Mammal);
```

```javascript readonly
class Human extends Mammal {
    static config = {
        className: 'Simple.example.Human',
    }
    speak(){
        console.log(`Hello! My name is ${this.name}. I am ${this.married?'':'not'} married.`);
    }
}

const myMammal = Neo.create(Human, {
    name: 'Herbert'
});
myMammal.speak(); // Logs "Hello! My name is Herbert. I am not married."

export default Neo.setupClass(Human);
```

Any class in the hierarchy is free to add new properties and methods. Let's add
a property and behavior (method) to the Human class.

```javascript readonly
import Base from '../../../node_modules/neo.mjs/src/core/Base.mjs';

class Mammal extends Base {
    static config = {
        className: 'Simple.example.Mammal',

        name: 'Anonymous'
    }
    speak(){
        console.log(`(${this.name} is grunting)`);
    }
}
export default Neo.setupClass(Mammal);
```

```javascript readonly
class Human extends Mammal {
    static config = {
        className: 'Simple.example.Human',
        name: 'J. Doe',
        married: false
    }
    speak(){
        console.log(`Hello! My name is ${this.name}. I am ${this.married?'':'not'} married.`);
    },
    yodel(){
        console.log('Yodelay hee hoo!');
    }}

const myPerson = Neo.create(Human, {
    name: 'Herbert'
});

myPerson.speak(); // Logs "Hello! My name is Herbert. I am not married."
myPerson.yodel(); // Logs "Yodelay hee hoo!"

export default Neo.setupClass(Human);
```
