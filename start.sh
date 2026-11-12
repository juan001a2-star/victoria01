#!/bin/sh
# Start script for Railway deployment

echo "=== Lottery Pro Starting ==="

# Push database schema
echo "Syncing database schema..."
npx drizzle-kit push --force 2>/dev/null || echo "Schema sync skipped (may already exist)"

# Seed initial data if needed
echo "Seeding initial data..."
npx tsx db/sync-and-seed.ts 2>/dev/null || echo "Seed skipped"

# Start the server
echo "Starting server..."
exec node dist/boot.js
