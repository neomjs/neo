This example covers the same business logic as examples/stateProvider/inline.

Instead of using a state.Provider instance, the view controller is storing the data properties directly.

Compare the MainContainer.mjs as well as the MainContainerController.mjs files inside both examples to get the idea.

While this implementation is beautifully easy, it does get a lot more complex in case you want to use nested data
or a nested state provider & controller hierarchy.
