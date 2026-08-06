-- Already applied live via MCP. Recorded here for reproducibility.
-- Books: deterministic Open Library cover from the ISBN-10 in the /dp/ ASIN
-- (?default=false → a missing cover 404s so the UI falls back to a placeholder).
UPDATE media_picks
SET image_url = 'https://covers.openlibrary.org/b/isbn/'
  || substring(url FROM '/dp/([0-9Xx]+)') || '-L.jpg?default=false'
WHERE kind = 'book' AND url ~ '/dp/[0-9Xx]+';

-- Podcasts: multi-platform links (Apple id also powers artwork via iTunes Lookup).
UPDATE media_picks SET links = '{"official":"https://howtobbqright.com/howtobbqright-podcast/","apple":"https://podcasts.apple.com/us/podcast/howtobbqright/id1372347504","spotify":"https://open.spotify.com/show/0NC8qIuuQfnPb8KPKe0hvp","youtube":"https://www.youtube.com/@howtobbqright"}'::jsonb
  WHERE kind='podcast' AND name='HowToBBQRight Podcast';
UPDATE media_picks SET links = '{"official":"https://thebbqcentralshow.com/","apple":"https://podcasts.apple.com/us/podcast/the-bbq-central-show/id1412947410","spotify":"https://open.spotify.com/show/6ilvJS8JcNorp23HXs9D7B"}'::jsonb
  WHERE kind='podcast' AND name='The BBQ Central Show';
UPDATE media_picks SET links = '{"official":"https://heathrilesbbq.com/","apple":"https://podcasts.apple.com/us/podcast/shootin-the-que-podcast-with-heath-riles/id1678366426","spotify":"https://open.spotify.com/show/2SuhKprHgc7k2hErB9pArR"}'::jsonb
  WHERE kind='podcast' AND name='Shootin'' The Que';
UPDATE media_picks SET links = '{"apple":"https://podcasts.apple.com/us/podcast/bbq-nation/id807350584","spotify":"https://open.spotify.com/show/6eY2WbpXRSkNRqMEuQd8ga"}'::jsonb
  WHERE kind='podcast' AND name='BBQ Nation';
