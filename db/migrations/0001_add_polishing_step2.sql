-- Migration: Add second polishing step columns to orders table
-- weightIn2 and weightOut2 are nullable - they are only set when an item
-- goes through a second polishing pass. Loss is cumulative (step1 + step2).
ALTER TABLE `orders` ADD `weight_in_2` text;
ALTER TABLE `orders` ADD `weight_out_2` text;
