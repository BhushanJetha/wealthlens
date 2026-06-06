-- Add is_manual flag to budgets so auto-smart-budget skips user-defined caps
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT false;
