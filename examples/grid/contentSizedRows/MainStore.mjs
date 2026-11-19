import Model                from './MainModel.mjs';
import Store                from '../../../src/data/Store.mjs';
import {createSeededRandom} from '../../../src/util/Random.mjs';

const
    COUNTRIES = ['Brazil', 'Canada', 'Germany', 'India', 'Japan', 'Kenya', 'Mexico', 'Norway', 'Spain', 'Vietnam'],
    NOTES     = [
        'Verified in customer account.',
        'Awaiting billing team review.',
        'Customer confirmed resolved.',
        'Escalated to tier-2 support.',
        'Pending upstream payment processor fix.',
        'Monitoring for recurrence after fix.'
    ],
    OWNERS   = ['Alex', 'Blake', 'Casey', 'Dana', 'Jordan', 'Morgan', 'Riley', 'Sam'],
    STATUSES = ['Draft', 'Review', 'Approved', 'Shipped', 'Archived'],
    TOPICS   = [
        // 1. Billing and invoices
        {
            scenarios: [
                {
                    title    : 'Annual subscription invoice shows the previous seat count',
                    summaries: [
                        // Tier 0 (~60-80 chars)
                        'The annual invoice reflects last year\'s seat count instead of the current total.',
                        // Tier 1 (~130-160 chars)
                        'The annual invoice reflects last year\'s seat count instead of the current total. Customers who added seats mid-cycle see the outdated figure on the billing summary page.',
                        // Tier 2 (~200-260 chars)
                        'The annual invoice reflects last year\'s seat count instead of the current total. Customers who added seats mid-cycle see the outdated figure on the billing summary page. The discrepancy causes confusion during annual budget reconciliation and results in support escalations.'
                    ],
                    details: [
                        // Tier 0 (~80-100 chars)
                        'Customer reports invoice total is based on 12 seats; their account currently holds 15.',
                        // Tier 1 (~170-200 chars)
                        'Steps to reproduce: add seats to an active annual plan two months before renewal. Navigate to Billing and download the upcoming invoice PDF. The seat count shown matches the original purchase rather than the current subscription state.',
                        // Tier 2 (~260-310 chars)
                        'The customer added three seats in September on an annual plan renewing in November. The invoice generated at renewal quotes the September seat count rather than November\'s active total.\n\nBilling records confirm the seat additions posted correctly to the account ledger. The invoice rendering pipeline reads the initial contract quantity rather than the current subscription record, producing the incorrect figure.'
                    ]
                },
                {
                    title    : 'Invoice PDF is missing line items for add-on features',
                    summaries: [
                        'Downloaded invoice PDFs omit line items for purchased add-on features.',
                        'Downloaded invoice PDFs omit line items for purchased add-on features. The total charge is correct, but individual add-on costs are absent from the itemised breakdown.',
                        'Downloaded invoice PDFs omit line items for purchased add-on features. The total charge is correct, but individual add-on costs are absent from the itemised breakdown. Customers cannot submit the incomplete document for internal expense approval.'
                    ],
                    details: [
                        'Invoice PDF shows only the base subscription line; storage and SSO add-ons are absent.',
                        'Steps to reproduce: subscribe to at least one add-on feature, then navigate to Billing and download the most recent invoice. The PDF contains only the base subscription line item despite the account carrying active add-ons with separate monthly charges.',
                        'The affected customer holds an active subscription with two add-ons: advanced storage and priority support. The downloaded PDF shows a single base subscription line and the correct grand total, but the individual add-on charges are not itemised.\n\nThe invoice generation service assembles line items from the base plan record and omits the add-on entitlement table. Adding the entitlement query to the invoice assembly step resolves the missing line items.'
                    ]
                }
            ]
        },
        // 2. Account sign-in and password recovery
        {
            scenarios: [
                {
                    title    : 'Password reset email arrives after the reset link has expired',
                    summaries: [
                        'Password reset emails are delivered after the embedded link has already expired.',
                        'Password reset emails are delivered after the embedded link has already expired. Customers click the link immediately on receipt and receive an invalid or expired token error.',
                        'Password reset emails are delivered after the embedded link has already expired. Customers click the link immediately on receipt and receive an invalid or expired token error. The delay appears to worsen during peak sending hours when the mail queue is under load.'
                    ],
                    details: [
                        'Customer received the reset email eleven minutes after requesting it; the token expired at ten minutes.',
                        'Steps to reproduce: request a password reset during peak business hours and monitor email delivery time. The reset token is generated and stamped with a ten-minute expiry at request time, but mail queue backlog delays delivery beyond the validity window.',
                        'The customer requested a password reset at 09:14 and received the email at 09:26. The embedded link carried a ten-minute expiry timestamped at 09:14, so it was already invalid on arrival.\n\nMail delivery logs confirm the message sat in the outbound queue for twelve minutes during a high-volume send window. Extending the token validity period to thirty minutes and adding queue-priority routing for transactional authentication emails resolves the customer impact.'
                    ]
                },
                {
                    title    : 'SSO login redirects users to a generic error page instead of the dashboard',
                    summaries: [
                        'Single sign-on login attempts redirect to an error page rather than the application dashboard.',
                        'Single sign-on login attempts redirect to an error page rather than the application dashboard. The error page carries no actionable message and the browser URL shows an unexpected callback path.',
                        'Single sign-on login attempts redirect to an error page rather than the application dashboard. The error page carries no actionable message and the browser URL shows an unexpected callback path. The issue appears only for accounts whose identity provider enforces strict audience validation.'
                    ],
                    details: [
                        'Customer\'s IdP returns a valid SAML assertion but the application callback endpoint returns HTTP 400.',
                        'Steps to reproduce: configure an enterprise account with a SAML identity provider that enforces strict audience restriction. Initiate login via the SSO entry point. The SAML assertion is accepted by the callback handler but the session is not established, and the user is redirected to the generic error route.',
                        'The enterprise customer configured their Okta tenant with a strict audience URI matching their production domain. After migrating to a custom subdomain, the application callback validates the audience against the old domain value stored in the SSO configuration record.\n\nUpdating the stored audience URI in the SSO settings panel resolves the mismatch. A migration script is needed to backfill accounts that updated their custom domain without re-saving their SSO settings.'
                    ]
                }
            ]
        },
        // 3. Data exports and downloads
        {
            scenarios: [
                {
                    title    : 'CSV export is missing records from the selected date range',
                    summaries: [
                        'Exported CSV files do not include all records falling within the customer-specified date range.',
                        'Exported CSV files do not include all records falling within the customer-specified date range. Records created at the boundary date appear in the UI list but are absent from the downloaded file.',
                        'Exported CSV files do not include all records falling within the customer-specified date range. Records created at the boundary date appear in the UI list but are absent from the downloaded file. The omission is consistent and reproducible for any export ending on the current calendar day.'
                    ],
                    details: [
                        'Export of records from 1 November to 30 November is missing 47 records created on 30 November.',
                        'Steps to reproduce: set the export date range end to today\'s date and initiate a CSV download. Compare the downloaded row count with the in-app list filtered to the same range. Records timestamped on the end date are present in the UI but absent from the export file.',
                        'The customer selected a date range ending on 30 November and expected 1,240 records. The downloaded CSV contained 1,193 rows, with all records created on 30 November absent.\n\nThe export query uses a strict less-than comparison on the end date without converting the date boundary to an end-of-day timestamp. Changing the end date filter to include times up to 23:59:59 on the selected date resolves the boundary exclusion.'
                    ]
                },
                {
                    title    : 'Export job times out for accounts with more than fifty thousand records',
                    summaries: [
                        'Full-dataset export jobs fail with a timeout error for large accounts.',
                        'Full-dataset export jobs fail with a timeout error for large accounts. The job runs for approximately two minutes before returning an error, and no partial file is delivered.',
                        'Full-dataset export jobs fail with a timeout error for large accounts. The job runs for approximately two minutes before returning an error, and no partial file is delivered. Smaller exports under ten thousand records complete successfully within the same account.'
                    ],
                    details: [
                        'Customer\'s account holds 68,000 records; every full export attempt ends with a gateway timeout.',
                        'Steps to reproduce: on an account with more than fifty thousand active records, navigate to the export panel and select all record types with no date filter. Submit the export request and observe the job status. After approximately one hundred and twenty seconds the status transitions to failed with a timeout message.',
                        'The customer\'s account contains 68,000 records across six record types. Every export attempt without a date filter times out at the two-minute mark regardless of which record types are selected.\n\nThe export worker fetches all matching records into memory before writing the CSV stream, causing excessive heap allocation. Replacing the in-memory aggregation with a streaming cursor that writes rows in batches eliminates the timeout for arbitrarily large accounts.'
                    ]
                }
            ]
        },
        // 4. Email notifications
        {
            scenarios: [
                {
                    title    : 'Notification pipeline sends emails to an address the customer already unsubscribed',
                    summaries: [
                        'The notification delivery pipeline continues sending emails to unsubscribed customer addresses.',
                        'The notification delivery pipeline continues sending emails to unsubscribed customer addresses. The unsubscribe confirmation page reports success, but messages continue arriving at the address.',
                        'The notification delivery pipeline continues sending emails to unsubscribed customer addresses. The unsubscribe confirmation page reports success, but messages continue arriving at the unsubscribed address. Affected customers have confirmed their preference centre shows all notifications disabled.'
                    ],
                    details: [
                        'Customer unsubscribed on 3 October and continued receiving weekly digest emails through 17 October.',
                        'Steps to reproduce: click the unsubscribe link in any notification email and confirm the preference update on the resulting page. Wait for the next scheduled notification send cycle and verify whether mail is still delivered to the address. The preference page reflects the unsubscribed state, but the sending pipeline does not honour it.',
                        'The customer unsubscribed on 3 October using the one-click link included in the weekly digest email. The preference centre confirmed the update immediately. However, digests continued arriving on 10 October and 17 October.\n\nThe sending pipeline caches recipient lists at job scheduling time, two days before delivery. Unsubscribe events that arrive after the list snapshot is taken are not applied to the queued job. Refreshing the recipient list at send time rather than at schedule time resolves the late-unsubscribe delivery problem.'
                    ]
                },
                {
                    title    : 'Weekly digest email pipeline formats event timestamps in the wrong timezone',
                    summaries: [
                        'The weekly digest email pipeline displays event timestamps in UTC rather than the configured timezone.',
                        'The weekly digest email pipeline displays event timestamps in UTC rather than the customer\'s configured timezone. Customers in non-UTC regions see activity listed at incorrect local times, making the digest difficult to interpret.',
                        'The weekly digest email pipeline displays event timestamps in UTC rather than the customer\'s configured timezone. Customers in non-UTC regions see activity listed at incorrect local times, making the digest difficult to interpret. The account settings panel shows the correct timezone preference, so the error originates in the email rendering path.'
                    ],
                    details: [
                        'Customer in Tokyo (UTC+9) sees digest events listed nine hours behind their actual local occurrence times.',
                        'Steps to reproduce: set the account timezone to a non-UTC region, generate activity during the week, and open the following weekly digest email. Compare the timestamps in the email against the timestamps shown in the in-app activity feed. The email renders UTC values while the app feed renders correctly localised times.',
                        'The customer\'s account timezone is set to Asia/Tokyo. Activity recorded at 10:00 JST appears as 01:00 in the digest email, confirming the email renderer uses raw UTC values.\n\nThe digest email template retrieves activity records with their UTC timestamps and passes them directly to the template engine without timezone conversion. Applying the per-account timezone preference during template rendering resolves the mismatch for all non-UTC customers.'
                    ]
                }
            ]
        },
        // 5. Team invitations and membership
        {
            scenarios: [
                {
                    title    : 'Workspace invitation email is not received by the invited address',
                    summaries: [
                        'Invitation emails sent to new workspace members are not delivered to the recipient.',
                        'Invitation emails sent to new workspace members are not delivered to the recipient. The workspace owner sees the invitation listed as sent, but the recipient finds no email in their inbox or spam folder.',
                        'Invitation emails sent to new workspace members are not delivered to the recipient. The workspace owner sees the invitation listed as sent, but the recipient finds no email in their inbox or spam folder. The issue appears exclusively for addresses on certain corporate email domains.'
                    ],
                    details: [
                        'Recipient at a company using Microsoft 365 with strict inbound filtering receives no invitation mail.',
                        'Steps to reproduce: invite a new member whose email is hosted on a Microsoft 365 tenant with enhanced threat protection enabled. The invitation is recorded as dispatched in the workspace member panel, but no email is delivered. The recipient\'s IT team confirms no message reached the inbound mail gateway.',
                        'The workspace owner invited three colleagues whose accounts are on a Microsoft 365 tenant with strict attachment and link scanning. None of the three received the invitation email. The company\'s mail gateway logs show the messages were rejected at the perimeter.\n\nThe invitation email body contains a bare authentication token in the URL that matches a pattern flagged by Microsoft\'s Safe Links scanning policy. Wrapping the token in a redirect through the application\'s own domain and signing the link resolves the deliverability issue.'
                    ]
                },
                {
                    title    : 'Invited member cannot accept the workspace invitation after twenty-four hours',
                    summaries: [
                        'Workspace invitation links expire before recipients have an opportunity to accept them.',
                        'Workspace invitation links expire before recipients have an opportunity to accept them. Recipients who open the link the day after receiving it see an error stating the invitation is no longer valid.',
                        'Workspace invitation links expire before recipients have an opportunity to accept them. Recipients who open the link the day after receiving it see an error stating the invitation is no longer valid. The workspace owner must re-send the invitation repeatedly, causing frustration on both sides.'
                    ],
                    details: [
                        'Customer received the invitation on a Friday afternoon and tried to accept it Monday morning to find it expired.',
                        'Steps to reproduce: send a workspace invitation on a Friday and ask the recipient to accept it on the following Monday. The recipient opens the link seventy-two hours after receipt and encounters an invalid invitation error. The workspace owner confirms the invitation still shows as pending in the member panel.',
                        'The recipient received the invitation at 16:00 on Friday. When they attempted to accept it at 09:00 on Monday, the link returned an expiry error after approximately sixty-five hours.\n\nWorkspace invitation tokens are currently set to a twenty-four-hour validity window. Extending the default token lifetime to seven days and surfacing the expiry date in the invitation email give recipients adequate time to onboard across weekends and public holidays.'
                    ]
                }
            ]
        },
        // 6. Subscription management
        {
            scenarios: [
                {
                    title    : 'Seat count is not updated after a subscription downgrade',
                    summaries: [
                        'The active seat count remains at the previous level after a customer reduces their subscription plan.',
                        'The active seat count remains at the previous level after a customer reduces their subscription plan. The billing portal reflects the new lower tier, but the workspace still permits the original number of active members.',
                        'The active seat count remains at the previous level after a customer reduces their subscription plan. The billing portal reflects the new lower tier, but the workspace still permits the original number of active members. The discrepancy persists until the next billing cycle resets the entitlements.'
                    ],
                    details: [
                        'Customer downgraded from a 20-seat plan to a 10-seat plan; workspace still allows 20 active members.',
                        'Steps to reproduce: on an account using more seats than the target plan allows, initiate a plan downgrade. Confirm the downgrade in the billing portal. Navigate to the workspace member list and observe the allowed seat ceiling. The portal reflects the new plan, but the enforcement limit is unchanged.',
                        'The customer downgraded from a 20-seat plan to a 10-seat plan effective immediately. After the change, the workspace member list still accepted new invitations beyond 10 seats, and 18 members remained active without any restriction.\n\nThe seat enforcement service reads the entitlement from a cached plan record refreshed only at the start of each billing cycle. Triggering a cache invalidation immediately on successful plan change events resolves the gap between billing and enforcement.'
                    ]
                },
                {
                    title    : 'Proration charge shows an incorrect amount on mid-cycle upgrades',
                    summaries: [
                        'Mid-cycle plan upgrades generate a proration charge that does not match the expected calculated amount.',
                        'Mid-cycle plan upgrades generate a proration charge that does not match the expected calculated amount. The difference is consistent across multiple upgrade attempts on the same account and billing period.',
                        'Mid-cycle plan upgrades generate a proration charge that does not match the expected calculated amount. The difference is consistent across multiple upgrade attempts on the same account and billing period. Affected customers have shared screenshots showing the billing portal estimate differing from the charge on their card statement.'
                    ],
                    details: [
                        'Customer upgraded mid-cycle and was charged $42.50 against a portal estimate of $38.75.',
                        'Steps to reproduce: on a monthly plan, perform an upgrade halfway through the billing period and note the proration estimate displayed before confirming. Complete the upgrade and compare the confirmed charge on the payment method to the displayed estimate. The charged amount is higher than the estimate by a fixed margin.',
                        'The customer upgraded from the Starter plan to the Business plan on the 15th of a 30-day billing period. The upgrade confirmation screen displayed a proration of $38.75. The card was charged $42.50.\n\nThe proration estimate uses a 30-day month denominator, while the charge calculation uses the actual days remaining in the billing period. When the current month has 31 days the two values diverge. Aligning both computations to use the actual days in the billing period eliminates the discrepancy.'
                    ]
                }
            ]
        },
        // 7. File uploads and attachments
        {
            scenarios: [
                {
                    title    : 'Profile image does not appear after the upload confirmation is shown',
                    summaries: [
                        'Uploaded profile images are confirmed by the UI but do not appear in the account or other surfaces.',
                        'Uploaded profile images are confirmed by the UI but do not appear in the account or other surfaces. The avatar placeholder remains visible everywhere the profile image should display, including comments and member lists.',
                        'Uploaded profile images are confirmed by the UI but do not appear in the account or other surfaces. The avatar placeholder remains visible everywhere the profile image should display, including comments and member lists. A hard browser refresh does not resolve the missing image.'
                    ],
                    details: [
                        'Customer sees the success toast after upload but their avatar shows a grey placeholder across all pages.',
                        'Steps to reproduce: navigate to Account Settings and upload a profile image under the allowed file size and format constraints. Observe the success confirmation message. Navigate to a workspace page where the avatar should appear, such as the comments panel. The placeholder is shown in place of the uploaded image.',
                        'The customer uploaded a 480×480 JPEG profile image within the documented 2 MB limit. The settings page displayed a success toast and briefly previewed the image. After navigating away, the avatar showed the default placeholder on all pages.\n\nThe image upload endpoint returns a success response after writing the file to temporary storage but before the background job moves it to permanent CDN storage. The CDN path is written to the user record only after the background job completes. Reading the CDN URL before the job finishes returns null, so the placeholder is served. Returning a pending state to the client and polling until the CDN path is set resolves the apparent success without delivery.'
                    ]
                },
                {
                    title    : 'Attachment download corrupts large PDF files',
                    summaries: [
                        'PDF attachments larger than ten megabytes are corrupted when downloaded through the application.',
                        'PDF attachments larger than ten megabytes are corrupted when downloaded through the application. The downloaded file cannot be opened by any PDF reader, and the file size on disk is smaller than the original upload size.',
                        'PDF attachments larger than ten megabytes are corrupted when downloaded through the application. The downloaded file cannot be opened by any PDF reader, and the file size on disk is smaller than the original upload size. The same files download correctly when accessed directly from the CDN URL.'
                    ],
                    details: [
                        'Customer\'s 15 MB contract PDF downloads as an 8 MB unreadable file from the attachment download endpoint.',
                        'Steps to reproduce: upload a PDF attachment larger than ten megabytes to a record. Navigate to the record and use the download link to retrieve the file. Attempt to open the downloaded file in a PDF reader. The reader reports the file is damaged or not a valid PDF.',
                        'The customer attached a 15 MB contract PDF to a support record. When colleagues downloaded the file using the in-app download link, they received an 8 MB file that no PDF reader could open. The file downloaded from the direct CDN URL was intact and identical to the original.\n\nThe download proxy endpoint buffers the response body in memory before writing it to the HTTP response stream. For files larger than the proxy\'s ten-megabyte response buffer, the write is truncated without error. Streaming the CDN response body directly to the client response without buffering resolves the corruption for files of arbitrary size.'
                    ]
                }
            ]
        },
        // 8. Account preferences and onboarding
        {
            scenarios: [
                {
                    title    : 'Notification preferences are not retained after saving',
                    summaries: [
                        'Notification preference changes revert to previous values after the customer saves and refreshes.',
                        'Notification preference changes revert to previous values after the customer saves and refreshes. The save action shows a success message, but a subsequent page load restores the original settings.',
                        'Notification preference changes revert to previous values after the customer saves and refreshes. The save action shows a success message, but a subsequent page load restores the original settings. The issue is reproduced consistently in all major browsers and cannot be resolved by clearing the browser cache.'
                    ],
                    details: [
                        'Customer disabled email digests and saved preferences; after refreshing, digests were re-enabled.',
                        'Steps to reproduce: navigate to Account Settings and change two or more notification preferences. Click Save and observe the success confirmation. Reload the page and inspect the notification preference toggles. The toggles have reverted to their state before the save action.',
                        'The customer disabled the weekly digest and the mention notification toggles in Account Settings. After saving, the page confirmed success. A page reload showed both toggles re-enabled, confirming the changes did not persist.\n\nThe preference save handler writes the updated values to the session store and returns a success response, but the persistent database write is deferred to a background task that fails silently when the session store expires before the task executes. Writing the preference update synchronously to the database before returning the success response guarantees persistence across page loads.'
                    ]
                },
                {
                    title    : 'Onboarding checklist resets to the beginning after the first login',
                    summaries: [
                        'New accounts complete onboarding steps during signup but find the checklist fully reset at first login.',
                        'New accounts complete onboarding steps during signup but find the checklist fully reset at first login. Progress made during the signup flow is not carried over to the authenticated session.',
                        'New accounts complete onboarding steps during signup but find the checklist fully reset at first login. Progress made during the signup flow is not carried over to the authenticated session. Customers must complete the same steps a second time, which damages first-run trust and increases support contact volume.'
                    ],
                    details: [
                        'Customer completed four of five onboarding steps during signup; after logging in, all five showed incomplete.',
                        'Steps to reproduce: create a new account and complete the onboarding checklist steps presented during signup, such as inviting a team member and setting a workspace name. Complete signup and log in with the new credentials. Navigate to the onboarding checklist. All previously completed steps show as incomplete.',
                        'A new customer completed four of the five onboarding checklist steps during the signup flow: they set a workspace name, uploaded a logo, invited one team member, and connected their calendar. After completing signup and logging into the application, the checklist showed all five steps as incomplete.\n\nThe signup flow stores onboarding progress against the pre-authentication guest session identifier. When the user authenticates, a new session is created without migrating the guest session\'s onboarding state. Transferring the guest session onboarding record to the authenticated user record immediately after account creation resolves the reset.'
                    ]
                }
            ]
        }
    ];

/**
 * @summary 10k deterministic records structured across eight fictional SaaS customer support topics: `title` and
 * `notes` in the locked bodies, `summary` in the center, and `details`, the tallest, in a center column that
 * starts past the horizontal range.
 *
 * Content is generated via a seeded pseudo-random generator where each record selects a coherent support-desk
 * scenario across three deliberate length tiers. The scenario's title, progressive multi-sentence summary,
 * and reproduction details all describe the same customer problem. Every record establishes proportional row
 * heights that wrap to distinct line counts on desktop and mobile viewports without synthetic word arrays or
 * lorem ipsum.
 * @class Neo.examples.grid.contentSizedRows.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.contentSizedRows.MainStore'
         * @protected
         */
        className: 'Neo.examples.grid.contentSizedRows.MainStore',
        /**
         * @member {Number} amountRows_=10000
         * @reactive
         */
        amountRows_: 10000,
        /**
         * @member {Boolean} autoInitRecords=false
         */
        autoInitRecords: false,
        /**
         * Inactive until the filter field sets a value
         * @member {Object[]} filters
         * @reactive
         */
        filters: [{operator: 'like', property: 'summary', value: null}],
        /**
         * @member {Neo.data.Model} model=Model
         * @reactive
         */
        model: Model
    }

    /**
     * Triggered after the amountRows config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetAmountRows(value, oldValue) {
        let me = this;

        // The unfiltered copy a first filter creates receives the items, it does not generate them
        if (me.preventDataGeneration) {
            return
        }

        me.items?.length > 0 && me.clear(false);

        // Raw items: the store creates a record when a row first needs it
        me.add(me.generateData(value), false)
    }

    /**
     * @param {Object} config
     * @returns {Neo.collection.Base}
     * @protected
     */
    createAllItems(config) {
        config.preventDataGeneration = true;
        return super.createAllItems(config)
    }

    /**
     * @param {Number} amountRows
     * @returns {Object[]}
     */
    generateData(amountRows) {
        let random  = createSeededRandom(19666),
            pick    = list => list[Math.floor(random() * list.length)],
            records = [],
            row     = 0;

        for (; row < amountRows; row++) {
            let topicIndex = Math.floor(random() * TOPICS.length),
                topic      = TOPICS[topicIndex],
                scenario   = pick(topic.scenarios),
                tier;

            // Deliberately establish 3 distinct row heights for the first three rows across both viewports
            if (row === 0) {
                tier = 0
            } else if (row === 1) {
                tier = 1
            } else if (row === 2) {
                tier = 2
            } else {
                tier = Math.floor(random() * 3)
            }

            records.push({
                country: pick(COUNTRIES),
                details: scenario.details[tier],
                id     : row + 1,
                notes  : pick(NOTES),
                owner  : pick(OWNERS),
                score  : Math.floor(random() * 100),
                status : pick(STATUSES),
                summary: scenario.summaries[tier],
                title  : scenario.title
            })
        }

        return records
    }
}

export default Neo.setupClass(MainStore);
