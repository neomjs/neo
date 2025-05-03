Neo.mjs classes are standard JavaScript classes. Every source file
you write will be a class definition, extending some Neo.mjs
class. 

<pre data-javascript>
import Base from '../../../node_modules/neo.mjs/src/core/Base.mjs';

class Mammal extends Base {
    static config = {
        className: 'Simple.example.Mammal'
    }
}

const myMammal = Neo.create(Mammal);

Neo.setupClass(Mammal); // Where Neo.mjs initializes the class config. 
export default Mammal;        // Makes the class available elsewhere.
</pre>

In the example above, we're extending the Neo.mjs base class. The static
config block is unique to Neo.mjs; it provides a way of defining special
properties, such as the `className` seen above. Over time we'll go into more detail
on the static config property.

The `const myMammal = Neo.create(Mammal);` statement creates an instance of
our class. For the sake of our discussion we're putting that statement in the same source
file where the class is defined, but normally your code would import the class elsewhere, 
and create instances as needed.

Let's add a `name` propery to the class.

<pre data-javascript>
import Base from '../../../node_modules/neo.mjs/src/core/Base.mjs';

class Mammal extends Base {
    static config = {
        className: 'Simple.example.Mammal',
        name     : 'Anonymous'
    }
}

const myMammal = Neo.create(Mammal);
console.log(myMammal.name);           // Logs "Anonymous"
myMammal.name = 'Herbert';
console.log(myMammal.name);           // Logs "Herbert"

Neo.setupClass(Mammal);

export default Mammal;
</pre>

In Neo.mjs, instance properties are usually added in the `static config` block.
The `static config` block does two things: 
- It formally describes the properties API for your class.
- It lets Neo.mjs manage the initialization and lifecycle of those properties.

Think of the `static config` block as "these are the properties
that can be set as instances are created." Config properties can be introduced 
anywhere in the class hierarchy. 

Since our class defines a `name` property, we can specify that when creating
the instance, using the second argument to the `create` method. 

<pre data-javascript>
const myMammal = Neo.create(Mammal, {
    name: 'Creature'
});
console.log(myMammal.name);           // Logs "Creature"
</pre>


Since _you_ define those properties, you can
look for them in class methods and use them as needed.
Let's add a `speak()` method that uses the `name` property.

<pre data-javascript>
import Base from '../../../node_modules/neo.mjs/src/core/Base.mjs';

class Mammal extends Base {
    static config = {
        className: 'Simple.example.Mammal',

        name: 'Anonymous'
    }
    speak(){
        console.log(`${this.name} is grunting`);
    }
}

const myMammal = Neo.create(Mammal, {
    name: 'Creature'
});

myMammal.speak(); // Logs "Creature is grunting."

Neo.setupClass(Mammal);

export default Mammal;
</pre>



