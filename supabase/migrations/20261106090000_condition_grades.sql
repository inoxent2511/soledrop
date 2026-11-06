-- The owner's revised Condition Guide (D-069). Each grade keeps its rank; the names change.
-- Renamed best-first so no new name meets an old one: excellent → premium must happen before
-- great → excellent. Rows keep their rank, so a pair graded second-best stays second-best.
alter type public.condition_grade rename value 'excellent' to 'premium';
alter type public.condition_grade rename value 'great' to 'excellent';
alter type public.condition_grade rename value 'good' to 'very-good';
alter type public.condition_grade rename value 'minor-marks' to 'minor-issue';
