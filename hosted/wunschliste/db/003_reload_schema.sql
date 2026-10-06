-- 002 added a column and replaced wishlist(); make sure PostgREST (the Data API) picks both up
-- right away instead of failing with "column not found in schema cache" until its next reload.
notify pgrst, 'reload schema';
