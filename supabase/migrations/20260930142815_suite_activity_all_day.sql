-- Sport sessions without a time ("Jederzeit" in the Sportplaner) are all-day in the Kalender,
-- like events: the activity schema gains `all_day`.
update platform.record_types
set schema = jsonb_set(schema, '{properties,all_day}', '{"type": "boolean"}')
where type = 'activity';
