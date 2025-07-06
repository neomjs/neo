import Neo       from '../../../../src/Neo.mjs';
import * as core from '../../../../src/core/_export.mjs';

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
        this.cleanupFn = this.observeConfig(publisherInstance, 'myConfig', (newValue, oldValue) => {
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

        // Assert that the subscriber's callback was NOT called due to automatic cleanup
        t.notOk(sharedState.subscriberCalled, 'Leaked subscriber callback should NOT be called due to automatic cleanup');

        // The observeConfig method now handles automatic cleanup, so no manual cleanup is needed here.
        publisher.destroy();
    });

    t.it('No memory leak scenario: destroyed subscriber with cleanup', t => {
        const sharedStateClean = { subscriberCalled: false };
        const publisherClean = Neo.create(PublisherComponent);
        let subscriberClean = Neo.create(LeakySubscriberComponent);

        subscriberClean.subscribeToPublisher(publisherClean, sharedStateClean);

        // Explicitly call cleanup before destroying
        subscriberClean.destroy();
        subscriberClean = null;

        publisherClean.myConfig = 'noLeakTrigger';

        t.notOk(sharedStateClean.subscriberCalled, 'Subscriber callback should NOT be called after cleanup');
        publisherClean.destroy(); // Clean up publisher
    });

    t.it('Manual unsubscribe before destruction', t => {
        const sharedStateManual = { subscriberCalled: false };
        const publisherManual = Neo.create(PublisherComponent);
        let subscriberManual = Neo.create(LeakySubscriberComponent);

        const cleanupManual = subscriberManual.observeConfig(publisherManual, 'myConfig', (newValue, oldValue) => {
            sharedStateManual.subscriberCalled = true;
        });

        // Manually unsubscribe
        cleanupManual();

        // Change the publisher's config value
        publisherManual.myConfig = 'valueAfterManualUnsubscribe';

        // Assert that the subscriber's callback was NOT called
        t.notOk(sharedStateManual.subscriberCalled, 'Subscriber callback should NOT be called after manual unsubscribe');

        // Destroy instances to ensure full cleanup
        subscriberManual.destroy();
        publisherManual.destroy();
    });
});
