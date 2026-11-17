# Daily Strategy backtest (changes nothing). Run on the Hetzner server as root, then paste the whole output back.
# It reads prices and saved picks, builds one TEMPORARY scratch table that vanishes when it finishes, and rolls back.
# No secrets or personal data are printed. It also saves the price history the plan uses to /root/strategy-series.json.gz
# (public FUT.GG prices only) in case a full replay of the real engine is wanted later.
DB=$(docker ps --format '{{.Names}}' | grep -E '^supabase-db-xue3q5tb1udz4bvq6oxbg1pv' | head -1)
echo "Database container: $DB"
docker exec -i "$DB" psql -U postgres -d postgres -q -P pager=off -P footer=off << 'EOF_SQL'
\set ON_ERROR_ROLLBACK on
BEGIN;
SET LOCAL statement_timeout = '300s';

-- One price per card per 12-hour refresh slot (06:00 / 18:00 UTC), tracked gold+ console cards of 1,000+.
CREATE TEMP TABLE bt ON COMMIT DROP AS
WITH cards AS (
  SELECT DISTINCT ON (source_card_key::bigint) source_card_key::bigint AS id, overall, coalesce(version, '') AS version, is_icon, is_hero
  FROM fut.player_cards WHERE owner_user_id IS NULL AND source_id = 'futgg_catalogue' AND market_tracked AND source_card_key ~ '^\d{1,10}$'
  ORDER BY source_card_key::bigint, id),
raw AS (
  SELECT DISTINCT ON (p.ea_item_id, floor((extract(epoch FROM p.published_at) - 21600) / 43200))
    p.ea_item_id AS id, floor((extract(epoch FROM p.published_at) - 21600) / 43200)::int AS b, p.published_at AS t, p.price
  FROM fut.futgg_prices p JOIN cards c ON c.id = p.ea_item_id
  WHERE p.game_year = 27 AND p.platform = 'console' AND p.price IS NOT NULL AND c.overall >= 75
  ORDER BY p.ea_item_id, floor((extract(epoch FROM p.published_at) - 21600) / 43200), p.published_at DESC),
w AS (
  SELECT r.*, c.overall,
    CASE WHEN c.is_icon THEN 'icon' WHEN c.is_hero THEN 'hero'
         WHEN lower(c.version) ~ '(^|\s)(rare|common|non-rare|base|gold)$' OR c.version = '' THEN CASE WHEN c.overall BETWEEN 83 AND 88 THEN 'fodder' ELSE 'gold' END
         ELSE 'promo' END AS kind,
    avg(price) OVER w14 AS avg7, min(price) OVER w14 AS min7, max(price) OVER w14 AS max7, count(*) OVER w14 AS pts,
    lag(price, 1) OVER w AS l1, lag(price, 2) OVER w AS l2, lag(price, 6) OVER w AS l6, lag(b, 2) OVER w AS lb2, lag(b, 6) OVER w AS lb6,
    lead(price, 2) OVER w AS f24, lead(price, 4) OVER w AS f48, lead(price, 8) OVER w AS f96, lead(b, 4) OVER w AS fb4, lead(b, 8) OVER w AS fb8,
    max(price) OVER (PARTITION BY id ORDER BY b ROWS BETWEEN 1 FOLLOWING AND 4 FOLLOWING) AS peak48
  FROM raw r JOIN cards c USING (id)
  WINDOW w AS (PARTITION BY id ORDER BY b), w14 AS (PARTITION BY id ORDER BY b ROWS BETWEEN 13 PRECEDING AND CURRENT ROW))
SELECT *, (avg7 - price) / avg7 AS disc,
  CASE WHEN lb2 = b - 2 THEN price::numeric / l2 - 1 END AS chg24,
  CASE WHEN lb6 = b - 6 THEN price::numeric / l6 - 1 END AS chg72,
  CASE WHEN fb4 = b + 4 THEN f48::numeric / price - 1 END AS ret48,
  CASE WHEN fb8 = b + 8 THEN f96::numeric / price - 1 END AS ret96,
  CASE WHEN fb4 = b + 4 THEN peak48::numeric / price - 1 END AS pk48
FROM w WHERE price >= 1000 AND pts >= 6;
-- Market-wide middle move from each slot, to tell a bad pick from a falling market.
CREATE TEMP TABLE mk ON COMMIT DROP AS
SELECT b, percentile_cont(0.5) WITHIN GROUP (ORDER BY ret48)::numeric AS m48, percentile_cont(0.5) WITHIN GROUP (ORDER BY chg72)::numeric AS m72, count(*) AS n
FROM bt WHERE ret48 IS NOT NULL GROUP BY b;

\echo '== 1. The whole market: middle 2-day move of every tracked gold+ card, by refresh'
SELECT to_timestamp(b * 43200 + 21600) AS refresh, n AS cards, round(m48 * 100, 1) AS next_2_days_pct, round(m72 * 100, 1) AS past_3_days_pct FROM mk ORDER BY b;

\echo '== 2. What the cards that went up had in common (every card at every refresh; up = 6%+ peak within 2 days, beats the tax)'
\echo '-- by their move over the 3 days before'
SELECT CASE WHEN chg72 < -0.15 THEN 'a down 15%+' WHEN chg72 < -0.05 THEN 'b down 5-15%' WHEN chg72 < -0.01 THEN 'c down 1-5%' WHEN chg72 <= 0.01 THEN 'd flat'
            WHEN chg72 <= 0.05 THEN 'e up 1-5%' WHEN chg72 <= 0.15 THEN 'f up 5-15%' ELSE 'g up 15%+' END AS past_3d,
  count(*) AS n, round(avg(ret48) * 100, 1) AS ret48_pct, round(avg((ret48 - m48)) * 100, 1) AS vs_market_pct, round(avg((pk48 >= 0.06)::int) * 100) AS pays_pct,
  round(avg((ret48 <= -0.10)::int) * 100) AS fell10_pct, round(avg(ret96) * 100, 1) AS ret96_pct
FROM bt JOIN mk USING (b) WHERE chg72 IS NOT NULL AND ret48 IS NOT NULL GROUP BY 1 ORDER BY 1;
\echo '-- by where it sits vs its week average x its last day'
SELECT CASE WHEN disc >= 0.12 THEN 'a 12%+ under' WHEN disc >= 0.05 THEN 'b 5-12% under' WHEN disc > -0.05 THEN 'c near avg' ELSE 'd 5%+ over' END AS vs_week,
  CASE WHEN chg24 < -0.03 THEN 'falling' WHEN chg24 <= 0.03 THEN 'steady' ELSE 'rising' END AS last_day,
  count(*) AS n, round(avg(ret48) * 100, 1) AS ret48_pct, round(avg(ret48 - m48) * 100, 1) AS vs_market_pct, round(avg((pk48 >= 0.06)::int) * 100) AS pays_pct, round(avg((ret48 <= -0.10)::int) * 100) AS fell10_pct
FROM bt JOIN mk USING (b) WHERE chg24 IS NOT NULL AND ret48 IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 2;
\echo '-- by kind and price'
SELECT kind, CASE WHEN price < 5000 THEN 'a <5k' WHEN price < 20000 THEN 'b 5-20k' WHEN price < 100000 THEN 'c 20-100k' ELSE 'd 100k+' END AS band,
  count(*) AS n, round(avg(ret48) * 100, 1) AS ret48_pct, round(avg(ret48 - m48) * 100, 1) AS vs_market_pct, round(avg((pk48 >= 0.06)::int) * 100) AS pays_pct
FROM bt JOIN mk USING (b) WHERE ret48 IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 2;

\echo '== 3. Rules compared on every past refresh (top 10 per refresh, like the page). net = 2-day price after the 5% tax'
WITH r AS (
  SELECT 'A current: dip under week' AS rule, bt.*, disc AS score FROM bt
   WHERE disc BETWEEN 0.05 AND 0.45 AND (l1 IS NULL OR price <= l1 * 1.25) AND (max7 - min7) / avg7 <= 1
     AND NOT (price <= min7 AND l1 > price AND l2 > l1)
  UNION ALL SELECT 'B dip but stopped falling 24h', bt.*, disc FROM bt
   WHERE disc BETWEEN 0.05 AND 0.35 AND chg24 >= 0 AND chg72 > -0.15 AND (max7 - min7) / avg7 <= 0.6
  UNION ALL SELECT 'C rising: up 3 days and 1 day', bt.*, chg72 FROM bt
   WHERE chg72 BETWEEN 0.03 AND 0.30 AND chg24 >= 0 AND price <= max7 * 0.98 AND (max7 - min7) / avg7 <= 0.6
  UNION ALL SELECT 'D steady: flat 3 days, near low', bt.*, -abs(chg72) FROM bt
   WHERE abs(chg72) <= 0.03 AND chg24 BETWEEN -0.01 AND 0.03 AND price <= avg7 AND (max7 - min7) / avg7 <= 0.25
  UNION ALL SELECT 'E beat market 3 days, not falling', bt.*, chg72 - mk72.m72 FROM bt JOIN (SELECT b, m72 FROM mk) mk72 USING (b)
   WHERE chg72 - mk72.m72 >= 0.05 AND chg24 >= 0 AND price <= max7 * 0.98 AND (max7 - min7) / avg7 <= 0.6),
top AS (SELECT *, row_number() OVER (PARTITION BY rule, b ORDER BY score DESC) AS rk FROM r WHERE ret48 IS NOT NULL)
SELECT rule, which, count(*) AS n, count(DISTINCT b) AS refreshes,
  round(avg(ret48) * 100, 1) AS ret48_pct, round(avg(0.95 * (1 + ret48) - 1) * 100, 1) AS net48_pct, round(avg(ret48 - m48) * 100, 1) AS vs_market_pct,
  round(avg((pk48 >= 0.06)::int) * 100) AS pays_pct, round(avg((ret48 > 0)::int) * 100) AS up48_pct, round(avg((ret48 <= -0.10)::int) * 100) AS fell10_pct,
  round(avg(ret96) * 100, 1) AS ret96_pct
FROM (SELECT *, 'all' AS which FROM top UNION ALL SELECT *, 'top 10' FROM top WHERE rk <= 10) t JOIN mk USING (b) GROUP BY 1, 2 ORDER BY 1, 2;

\echo '== 4. The picks we actually logged (top 10 per refresh), real prices after'
SELECT date_trunc('day', l.picked_at)::date AS day, count(*) AS n, round(avg(bt.ret48) * 100, 1) AS ret48_pct, round(avg(bt.ret48 - mk.m48) * 100, 1) AS vs_market_pct,
  round(avg((bt.pk48 >= 0.06)::int) * 100) AS pays_pct, round(avg((bt.ret48 <= -0.10)::int) * 100) AS fell10_pct
FROM fut.strategy_pick_log l
JOIN bt ON bt.id = l.ea_item_id AND bt.b = floor((extract(epoch FROM l.picked_at) - 21600) / 43200)::int
JOIN mk ON mk.b = bt.b
WHERE l.platform = 'console' AND l.side = 'buy' AND l.rank <= 10 GROUP BY 1 ORDER BY 1;
\echo '-- same picks by their 3-day trend when picked'
SELECT l.features->>'trend' AS trend, l.features->>'bounce' AS bounce, count(*) AS n, round(avg(bt.ret48) * 100, 1) AS ret48_pct, round(avg(bt.ret48 - mk.m48) * 100, 1) AS vs_market_pct,
  round(avg((bt.pk48 >= 0.06)::int) * 100) AS pays_pct, round(avg((bt.ret48 <= -0.10)::int) * 100) AS fell10_pct
FROM fut.strategy_pick_log l
JOIN bt ON bt.id = l.ea_item_id AND bt.b = floor((extract(epoch FROM l.picked_at) - 21600) / 43200)::int
JOIN mk ON mk.b = bt.b
WHERE l.platform = 'console' AND l.side = 'buy' GROUP BY 1, 2 ORDER BY 1, 2;

\echo '== 5. Buys shown on saved daily plans: price now vs the buy price'
WITH b AS (
  SELECT p.plan_date, (x->>'ea_item_id')::bigint AS id, (x->>'buy_at')::int AS buy_at, (x->>'sell_at')::int AS sell_at
  FROM fut.strategy_plans p, jsonb_array_elements(coalesce(p.plan->'buys', '[]')) x WHERE p.platform = 'console'),
now AS (SELECT DISTINCT ON (ea_item_id) ea_item_id AS id, price FROM fut.futgg_prices WHERE game_year = 27 AND platform = 'console' AND price IS NOT NULL
  AND ea_item_id IN (SELECT id FROM b) ORDER BY ea_item_id, published_at DESC)
SELECT plan_date, count(*) AS picks, round(avg(now.price::numeric / buy_at - 1) * 100, 1) AS now_vs_buy_pct,
  round(avg((now.price >= sell_at)::int) * 100) AS at_target_now_pct, round(avg((now.price < buy_at * 0.9)::int) * 100) AS down10_pct
FROM b JOIN now USING (id) GROUP BY 1 ORDER BY 1;
ROLLBACK;
EOF_SQL
# Price history the plan reads (public FUT.GG prices only), for a later full replay. Nothing is uploaded.
docker exec -i "$DB" psql -U postgres -d postgres -At -c "SELECT fut.strategy_price_series('console', NULL, 30)::text" | gzip > /root/strategy-series.json.gz
ls -la /root/strategy-series.json.gz
