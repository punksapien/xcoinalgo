-- Add marginCurrency column to strategies table
ALTER TABLE strategies ADD COLUMN IF NOT EXISTS "marginCurrency" TEXT DEFAULT 'INR';

