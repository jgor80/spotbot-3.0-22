-- Community price pool: every signed-in Gaffer Bot user may pull pooled prices for their own cards (Jeff's choice,
-- 2026-11-02 18:31Z). Sharing your own captures stays opt-in. Still never public and never through MCP.
UPDATE fut.market_price_sources
   SET status_note = 'Prices XI Lab users recorded from their own EA Web App searches and chose to share. For each hour, the median of each person''s lowest price, outliers dropped. Available to signed-in Gaffer Bot users for their own cards; never public. Not licensed by EA.'
 WHERE id = 'community_pool';
NOTIFY pgrst, 'reload schema';
