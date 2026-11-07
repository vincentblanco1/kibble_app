-- Run this once against your Supabase/Postgres database before deploying this
-- update. It adds a column to store "Vet-Safe Alternatives / Safer Swaps"
-- guidance text separately from the real Dosage threshold, which previously
-- shared (and overwrote) the same column.
ALTER TABLE dog_ingredients ADD COLUMN IF NOT EXISTS alternatives_guidance TEXT;
ALTER TABLE cat_ingredients ADD COLUMN IF NOT EXISTS alternatives_guidance TEXT;
