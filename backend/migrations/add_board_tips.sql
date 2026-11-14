-- Add board_tips column to questions table
-- Stores ICSE examiner tips: common mistakes, marking scheme, detail expectations
ALTER TABLE questions ADD COLUMN IF NOT EXISTS board_tips TEXT;
