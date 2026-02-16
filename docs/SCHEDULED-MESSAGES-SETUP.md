# Scheduled Messages Setup Guide

## Overview

Scheduled messages allow you to send messages at a specific date and time in the future. The system uses a cron job to check for due messages every minute and send them automatically.

## How It Works

1. User schedules a message via the UI
2. Message is saved to Firestore `scheduledMessages` collection with `status: "pending"`
3. Cron job runs every minute and checks for messages where `scheduledAt <= now`
4. Due messages are processed and sent
5. Status is updated to "sent" or "failed"

## Setup Options

### Option 1: Vercel Cron Jobs (Recommended if on Pro Plan)

**Requirements:**
- Vercel Pro plan or higher (Cron Jobs are not available on Free/Hobby plans)
- `vercel.json` is already configured

**Steps:**
1. Deploy to Vercel
2. Go to your Vercel project settings
3. Navigate to "Cron Jobs" section
4. Verify the cron job is enabled (should show `/api/messages/process-scheduled` running every minute)
5. If not enabled, you may need to upgrade to Pro plan

**Note:** Vercel Cron Jobs automatically send a special header, so no `CRON_SECRET` is required.

### Option 2: External Cron Service (Free Alternative)

If you're not on Vercel Pro, use an external cron service:

**Recommended Services:**
- [cron-job.org](https://cron-job.org) (free)
- [EasyCron](https://www.easycron.com) (free tier available)
- [Cronitor](https://cronitor.io) (free tier available)

**Setup Steps:**

1. **Set CRON_SECRET in environment variables:**
   ```bash
   # In Vercel dashboard or .env.local
   CRON_SECRET=your-random-secret-key-here
   ```

2. **Create a cron job:**
   - URL: `https://your-domain.com/api/messages/process-scheduled`
   - Schedule: Every minute (`* * * * *`)
   - Method: GET
   - Headers: `Authorization: Bearer your-random-secret-key-here`

3. **Test the endpoint:**
   ```bash
   curl -H "Authorization: Bearer your-random-secret-key-here" \
     https://your-domain.com/api/messages/process-scheduled
   ```

### Option 3: Manual Testing (Development)

For local development or testing, you can manually trigger the endpoint:

```bash
# Without CRON_SECRET (if not set)
curl http://localhost:3000/api/messages/process-scheduled

# With CRON_SECRET
curl -H "Authorization: Bearer your-secret" \
  http://localhost:3000/api/messages/process-scheduled
```

## Troubleshooting

### Messages Not Sending

1. **Check if cron job is running:**
   - Check Vercel logs for cron job executions
   - Or check your external cron service logs

2. **Check Firestore:**
   - Go to Firebase Console → Firestore
   - Check `scheduledMessages` collection
   - Verify message exists with `status: "pending"`
   - Check `scheduledAt` timestamp is in the past

3. **Check logs:**
   - Look for `[Process Scheduled]` log entries in Vercel logs
   - Should show "Found X pending messages" and processing details

4. **Verify message data:**
   - Ensure `templateId` exists
   - Ensure `channels` array is not empty
   - Ensure `scheduledAt` is a valid timestamp

### Common Issues

**Issue: "Unauthorized" error**
- Solution: Set `CRON_SECRET` environment variable and include it in Authorization header

**Issue: Messages stuck in "pending"**
- Solution: Cron job might not be running. Check Vercel Cron Jobs or external cron service

**Issue: Messages marked as "failed"**
- Solution: Check error field in Firestore document. Common causes:
  - Template not found
  - No recipients found
  - Email/SMS not configured
  - Invalid audience selection

## Monitoring

To monitor scheduled messages:

1. **Check Firestore:**
   - Query `scheduledMessages` collection
   - Filter by `status` to see pending/sent/failed

2. **Check API endpoint:**
   - Call `GET /api/messages/schedule?status=pending` to see pending messages
   - Call `GET /api/messages/schedule?status=sent` to see sent messages

3. **Check logs:**
   - Vercel logs will show `[Process Scheduled]` entries
   - Each run logs how many messages were processed

## Firestore Index

The query uses:
- `where("status", "==", "pending")`
- `where("scheduledAt", "<=", now)`

If you get an index error, create a composite index in Firestore:
- Collection: `scheduledMessages`
- Fields: `status` (Ascending), `scheduledAt` (Ascending)

However, the current implementation avoids `orderBy` to prevent needing this index.
