import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import Base           from '../../../../src/core/Base.mjs';

class PublisherComponent extends Base {
    static config = {
        className: 'PublisherComponent',
        myConfig_: 'initialValue'
    }
}

class LeakySubscriberComponent extends Base {
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

/**
 * @summary Tests for memory leak scenarios with Neo.core.Base#observeConfig
 * This suite checks that observeConfig subscriptions are properly cleaned up when a subscriber component is destroyed.
 */
test.describe('Neo.core.Base#configs-memory-leak', () => {
    test('Memory leak scenario: destroyed subscriber without cleanup', () => {
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
        expect(sharedState.subscriberCalled).toBe(false);

        // The observeConfig method now handles automatic cleanup, so no manual cleanup is needed here.
        publisher.destroy();
    });

    test('No memory leak scenario: destroyed subscriber with cleanup', () => {
        const sharedStateClean = { subscriberCalled: false };
        const publisherClean = Neo.create(PublisherComponent);
        let subscriberClean = Neo.create(LeakySubscriberComponent);

        subscriberClean.subscribeToPublisher(publisherClean, sharedStateClean);

        // Explicitly call cleanup before destroying
        subscriberClean.destroy();
        subscriberClean = null;

        publisherClean.myConfig = 'noLeakTrigger';

        expect(sharedStateClean.subscriberCalled).toBe(false);
        publisherClean.destroy(); // Clean up publisher
    });

    test('Manual unsubscribe before destruction', () => {
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
        expect(sharedStateManual.subscriberCalled).toBe(false);

        // Destroy instances to ensure full cleanup
        subscriberManual.destroy();
        publisherManual.destroy();
    });
});
