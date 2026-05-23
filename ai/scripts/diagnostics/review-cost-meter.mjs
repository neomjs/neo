import { execSync } from 'child_process';

const args = process.argv.slice(2);
const prNumber = args[0];

if (!prNumber || !/^\d+$/.test(prNumber)) {
    console.error('Usage: node ai/scripts/diagnostics/review-cost-meter.mjs <PR_NUMBER>');
    process.exit(1);
}

try {
    const rawData = execSync(`gh pr view ${prNumber} --json title,body,comments,reviews`, { encoding: 'utf-8' });
    const pr = JSON.parse(rawData);

    const titleBytes = Buffer.byteLength(pr.title || '', 'utf8');
    const bodyBytes = Buffer.byteLength(pr.body || '', 'utf8');

    let commentsBytes = 0;
    if (Array.isArray(pr.comments)) {
        for (const comment of pr.comments) {
            commentsBytes += Buffer.byteLength(comment.body || '', 'utf8');
        }
    }

    let reviewsBytes = 0;
    let reviewCount = 0;
    if (Array.isArray(pr.reviews)) {
        for (const review of pr.reviews) {
            reviewsBytes += Buffer.byteLength(review.body || '', 'utf8');
            reviewCount++;
        }
    }

    const totalDiscussionBytes = titleBytes + bodyBytes + commentsBytes + reviewsBytes;

    console.log(`=== Review-Loop Cost Meter for PR #${prNumber} ===`);
    console.log(`Title Bytes:      ${titleBytes}`);
    console.log(`Body Bytes:       ${bodyBytes}`);
    console.log(`Comments Bytes:   ${commentsBytes} (${pr.comments?.length || 0} comments)`);
    console.log(`Reviews Bytes:    ${reviewsBytes} (${reviewCount} reviews)`);
    console.log(`-----------------------------------------`);
    console.log(`Total Discussion: ${totalDiscussionBytes} bytes`);
    console.log(`Formal Reviews:   ${reviewCount}`);

    if (reviewCount >= 3 || totalDiscussionBytes > 24000) {
        console.log(`\n[WARNING] Circuit Breaker Thresholds Exceeded!`);
        console.log(`Consider invoking the Maintainer Polish Fast Path or Micro-Delta Review if remaining blockers are strictly mechanical/metadata.`);
    } else {
        console.log(`\n[OK] Cost within normal bounds.`);
    }

} catch (error) {
    console.error(`Error analyzing PR #${prNumber}:`, error.message);
    process.exit(1);
}
