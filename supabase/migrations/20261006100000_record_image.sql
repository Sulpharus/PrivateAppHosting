-- A small picture on events and sport sessions, so the Kalender can show it in the list, the day
-- and the map (ADR 0002). The picture travels inside the record as a tiny inline image (the app
-- that owns the big one makes it about 80 px wide), so no app needs access to another app's files.
update platform.record_types
set schema = jsonb_set(
      schema,
      '{properties,image}',
      '{"type": "string", "maxLength": 16000,
        "pattern": "^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$"}'::jsonb
    ),
    version = version + 1
where type in ('event', 'activity');
