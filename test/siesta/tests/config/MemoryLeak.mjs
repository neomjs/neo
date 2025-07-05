import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

class PublisherComponent extends core.Base {
    static config = {
        className: 'PublisherComponent',
        myConfig_: 'initialValue'
    }
}

class LeakySubscriberComponent extends core.Base {
    static config = {
        className: 'LeakySubscriberComponent'
    }

    // A flag to check if the subscriber was called
    subscriberCalled = false; // This will be updated via sharedState

    // A method to subscribe to a publisher's config
    subscribeToPublisher(publisherInstance, sharedStateRef) {
        const configController = publisherInstance.getConfig('myConfig');
        // Store the cleanup function, but we won't call it in the leak scenario
        this.cleanupFn = configController.subscribe((newValue, oldValue) => {
            sharedStateRef.subscriberCalled = true;
        });
    }
}

PublisherComponent = Neo.setupClass(PublisherComponent);
LeakySubscriberComponent = Neo.setupClass(LeakySubscriberComponent);

StartTest(t => {
    t.it('Memory leak scenario: destroyed subscriber without cleanup', t => {
        const sharedState = { subscriberCalled: false };
        const publisher = Neo.create(PublisherComponent);
        let subscriber = Neo.create(LeakySubscriberComponent);

        subscriber.subscribeToPublisher(publisher, sharedState);

        // Destroy the subscriber instance without calling cleanupFn
        subscriber.destroy();
        subscriber = null; // Nullify reference to help GC, though subscription still exists

        // Change the publisher's config value
        // This should trigger the subscriber's callback if the leak exists
        publisher.myConfig = 'newValueAfterSubscriberDestroyed';

        // Assert that the subscriber's callback was still called
        // This indicates the memory leak (the callback is still active)
        t.ok(sharedState.subscriberCalled, 'Leaked subscriber callback should be called');

        // To prevent actual memory leaks in the test runner,
        // we manually remove the subscription here for test integrity.
        // In a real application, this step would be missing, causing the leak.
        const publisherConfigController = publisher.getConfig('myConfig');
        // This is a hack for testing private members, normally not accessible
        // We assume the cleanupFn is the only subscriber left for this specific test.
        // In a real scenario, we'd need a way to identify and remove the specific leaked callback.
        // For the purpose of demonstrating the leak, the above assertion is sufficient.
        // If we wanted to truly clean up, we'd need to iterate and find the callback or expose a way to remove it.
        // For now, we'll just destroy the publisher to clean up its config controller.
        publisher.destroy();
    });

    t.it('No memory leak scenario: destroyed subscriber with cleanup', t => {
        const sharedStateClean = { subscriberCalled: false };
        const publisherClean = Neo.create(PublisherComponent);
        let subscriberClean = Neo.create(LeakySubscriberComponent);

        subscriberClean.subscribeToPublisher(publisherClean, sharedStateClean);

        // Explicitly call cleanup before destroying
        subscriberClean.cleanupFn();
        subscriberClean.destroy();
        subscriberClean = null;

        publisherClean.myConfig = 'noLeakTrigger';

        t.notOk(sharedStateClean.subscriberCalled, 'Subscriber callback should NOT be called after cleanup');
        publisherClean.destroy(); // Clean up publisher
    });
});
