-- Round-2 Watch/Read/Listen data (already applied live via MCP; recorded here).
-- A3: Deezer platform links where verified.
UPDATE media_picks SET links = links || '{"deezer":"https://www.deezer.com/en/show/3708387"}'::jsonb WHERE kind='podcast' AND name='HowToBBQRight Podcast';
UPDATE media_picks SET links = links || '{"deezer":"https://www.deezer.com/us/show/545472"}'::jsonb WHERE kind='podcast' AND name='The BBQ Central Show';

-- A5: two more YouTube channels.
INSERT INTO media_picks (kind, name, creator, url, blurb, sort_order, is_published)
VALUES
('youtube', 'Eater', NULL, 'https://www.youtube.com/@eater', 'Eater sends its cameras where the food actually lives — pitmasters at work, regional traditions, the culture around the fire — with the polish of a proper food-media outfit. Less how-to, more why it matters.', 90, true),
('youtube', 'Ant''s BBQ Cookout', 'Anthony Conley', 'https://www.youtube.com/@AntsBBQCookout', 'Anthony Conley cooks the way most of us actually do — backyard, on a budget, huge enthusiasm, zero snobbery. Upbeat and genuinely encouraging for anyone starting out.', 100, true)
ON CONFLICT DO NOTHING;

-- A6: drop the unreliable Open Library covers (they mismapped Franklin Smoke and
-- missed Project Fire). image_url is now resolved at render via Google Books
-- (title-validated), with a placeholder for any that don't resolve.
UPDATE media_picks SET image_url = NULL WHERE kind='book' AND image_url LIKE '%covers.openlibrary.org%';
