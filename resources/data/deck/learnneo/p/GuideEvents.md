[Add content on listeners options here]

How are events set up? We don't really care, but in case you're curious: Neo.mjs has a `Neo.core.Observable` class
that can be mixed into any class. It maintains a `listeners` object map that's a key-value pair, where
the key is the event name, and the value is an array of function references. The first time a listener is 
added an entry is added to the map using the event name as the key, and the event handler added as the first
item in the associated array. If another listener is added for the same event, a second item is added to the
array. If a new event is added, a new entry is added. Etc. When the event is fired, Neo.mjs looks up the map
entry for the event name, then runs each function in the array, passing whatever data is specified in the
call to `fire()`.

<img style="width:80%" src="https://s3.amazonaws.com/mjs.neo.learning.images/gettingStarted/events/ObservableInMemory.png"></img>
