-- Bottom carousel (below category grid on homepage). Separate from top hero carousel.
CREATE TABLE IF NOT EXISTS home_carousel_bottom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Optional: RLS if you use it (adjust policy as needed)
-- ALTER TABLE home_carousel_bottom ENABLE ROW LEVEL SECURITY;
