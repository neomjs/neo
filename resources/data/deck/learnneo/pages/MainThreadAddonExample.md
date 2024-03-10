Let's go through the steps of creating a main thread addon.

Let's say we needed to show a code editor. There are a lot of libraries
for this, such as Ace (<a href="https://ace.c9.io/" target="_blank">ace.c9.io</a>).
From a coding perspective, these editors have a simple API: a setter
to specify the string being edited, a getter to read the string, and
a change event fired as the user types.

Here's what we need to do:
- Define a main thread addon and its API
- Define a component wrapper

### Define the Main Thread Addon

### Define the component wrapper