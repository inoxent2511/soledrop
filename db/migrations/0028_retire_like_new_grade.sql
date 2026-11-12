-- Existing active products move to the closest remaining grade. Keep their
-- condition notes and historical order-line snapshots unchanged.
UPDATE products
SET condition_grade = 'premium', updated_at = CURRENT_TIMESTAMP(3)
WHERE condition_grade = 'like-new';

-- Refresh only the shipped FAQ answers; merchant-edited answers stay intact.
UPDATE faqs
SET answer = 'No. Premium is still a Pre-Loved grade. Brand New is a separate category for unused footwear.'
WHERE question = 'Are Pre-Loved shoes new?'
  AND answer = 'No. Even a Like New pair belongs to our Pre-Loved collection. Brand New is a separate category for unused footwear.';

UPDATE faqs
SET answer = 'Check the actual product photos, condition grade, description, size information, and flaw notes. Our four Pre-Loved grades are Premium, Excellent, Very Good, and Minor Issue.'
WHERE question = 'How do I know the condition of a Pre-Loved pair?'
  AND answer = 'Check the actual product photos, condition grade, description, size information, and flaw notes. Our five Pre-Loved grades are Like New, Premium, Excellent, Very Good, and Minor Issue.';

-- Reject the retired grade on future product writes, including direct imports.
ALTER TABLE products
  DROP CONSTRAINT products_condition_grade_enum,
  ADD CONSTRAINT products_condition_grade_current CHECK (condition_grade IN ('premium', 'excellent', 'very-good', 'minor-issue'));

-- A migration bypasses the catalogue repository's normal cache invalidation.
UPDATE catalogue_read_revisions SET revision = revision + 1;
