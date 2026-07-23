-- ============================================================================
-- 012 · Restore Burnt Ends' Michelin-star reference. It genuinely holds a
-- Michelin star — a factual award, not brand emulation — so migration 011's
-- over-broad strip is reversed for this venue. (The "Michelin Guide for
-- Barbecue" tagline stays removed in code; only factual venue awards are kept.)
-- ============================================================================
UPDATE public.restaurants
SET description = 'Michelin-starred modern BBQ with smoked quail, brisket, and open-kitchen theatre.'
WHERE name = 'Burnt Ends'
  AND description = 'Acclaimed modern BBQ with smoked quail, brisket, and open-kitchen theatre.';
