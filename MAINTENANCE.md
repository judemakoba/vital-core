# Maintenance & Operations Guide heath

## Database Management
- **Generate Client**: `npx prisma generate`
- **Sync Schema**: `npx prisma db push`
- **Studio Interface**: `npx prisma studio`

## Backups & Data Portability
1. Log in as an **ADMIN**.
2. Navigate to **Systems Settings**.
3. Click **Download Backup**.
4. Data is exported in a standard JSON format for easy archival or migration.

## Environment Configuration
Important keys in `.env`:
- `AT_SENDER_ID`: Used for Africa's Talking SMS notifications.
- `NEXTAUTH_SECRET`: Critical for session encryption.

## Performance Tuning
- The system uses `force-dynamic` on API routes to ensure real-time data accuracy.
- Service Workers (`sw.js`) cache static assets automatically.
