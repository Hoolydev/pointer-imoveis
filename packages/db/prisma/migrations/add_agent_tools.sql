-- Migration: add enabledTools and campaignFiles to Campaign
-- Run this against your PostgreSQL database when DATABASE_URL is available.
-- Command: psql $DATABASE_URL -f packages/db/prisma/migrations/add_agent_tools.sql

ALTER TABLE "Campaign"
  ADD COLUMN IF NOT EXISTS "enabledTools" JSONB,
  ADD COLUMN IF NOT EXISTS "campaignFiles" JSONB;
