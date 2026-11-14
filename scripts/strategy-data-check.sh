# Daily Strategy data check (read only). Run on the Hetzner server as root, then paste the whole output back.
# It only reads: everything runs inside a READ ONLY transaction. No secrets or personal data are printed.
# GafferBot's database (the server also runs PennantBot's, so pick by GafferBot's stack id)
DB=$(docker ps --format '{{.Names}}' | grep -E '^supabase-db-xue3q5tb1udz4bvq6oxbg1pv' | head -1)
echo "Database container: $DB" 
docker exec -i "$DB" psql -U postgres -d postgres -q -P pager=off -P footer=off << 'EOF_SQL'
\set ON_ERROR_ROLLBACK on
BEGIN READ ONLY;
SET statement_timeout = '120s';

\echo '== 1. Price history we hold (snapshots per platform)'
SELECT platform, count(*) AS refreshes, min(published_at)::date AS first, max(published_at) AS latest
FROM fut.futgg_snapshots WHERE game_year = 27 GROUP BY platform;

\echo '== 2. Logged picks and how they settled'
SELECT platform, side, coalesce(outcome, 'open') AS outcome, count(*) FROM fut.strategy_pick_log GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

\echo '== 3. Buy picks by kind of pick (settled): hit rate, how far toward target they got, price 4 days later'
SELECT features->>'discount' AS discount, features->>'bounce' AS bounce, count(*) AS n,
  round(avg((outcome = 'hit')::int) * 100) AS hit_pct,
  round(avg((best_price - price)::numeric / nullif(target - price, 0)) * 100) AS reach_pct,
  round(avg(final_price::numeric / price - 1) * 100, 1) AS final_vs_buy_pct
FROM fut.strategy_pick_log WHERE side = 'buy' AND outcome IN ('hit', 'miss') GROUP BY 1, 2 ORDER BY 1, 2;
SELECT features->>'kind' AS kind, features->>'band' AS band, count(*) AS n, round(avg((outcome = 'hit')::int) * 100) AS hit_pct,
  round(avg(final_price::numeric / price - 1) * 100, 1) AS final_vs_buy_pct, round(avg(target::numeric / price - 1) * 100, 1) AS target_rise_pct
FROM fut.strategy_pick_log WHERE side = 'buy' AND outcome IN ('hit', 'miss') GROUP BY 1, 2 ORDER BY 1, 2;
SELECT features->>'trend' AS trend_3d, count(*) AS n, round(avg((outcome = 'hit')::int) * 100) AS hit_pct, round(avg(final_price::numeric / price - 1) * 100, 1) AS final_vs_buy_pct
FROM fut.strategy_pick_log WHERE side = 'buy' AND outcome IN ('hit', 'miss') GROUP BY 1 ORDER BY 1;
\echo '-- by rank (1-10 = what the page shows first)'
SELECT CASE WHEN rank <= 10 THEN '1-10' WHEN rank <= 30 THEN '11-30' ELSE '31-80' END AS rank, count(*) AS n,
  round(avg((outcome = 'hit')::int) * 100) AS hit_pct, round(avg(final_price::numeric / price - 1) * 100, 1) AS final_vs_buy_pct
FROM fut.strategy_pick_log WHERE side = 'buy' AND outcome IN ('hit', 'miss') GROUP BY 1 ORDER BY 1;

\echo '== 4. Sell calls (settled)'
SELECT features->>'reason' AS reason, count(*) AS n, round(avg((outcome = 'good')::int) * 100) AS right_pct,
  round(avg(final_price::numeric / price - 1) * 100, 1) AS price_4d_later_pct
FROM fut.strategy_pick_log WHERE side = 'sell' AND outcome IN ('good', 'bad') GROUP BY 1;

\echo '== 5. What the model learned'
SELECT platform, model->>'ready' AS ready, model->'buys'->>'n' AS buys, model->'buys'->>'rate' AS hit_rate, model->'buys'->>'reach' AS reach,
  model->'moves'->>'n' AS moves, model->'moves'->'check' AS check, model->'moves'->>'trust' AS trust, updated_at
FROM fut.strategy_model;

\echo '== 6. The whole market: average card move per refresh (console, tracked cards)'
WITH tracked AS (SELECT DISTINCT source_card_key::bigint AS id FROM fut.player_cards
  WHERE owner_user_id IS NULL AND source_id = 'futgg_catalogue' AND market_tracked AND source_card_key ~ '^\d{1,10}$'),
p AS (SELECT ea_item_id, published_at AS t, price, lag(price) OVER (PARTITION BY ea_item_id ORDER BY published_at) AS prev
  FROM fut.futgg_prices WHERE game_year = 27 AND platform = 'console' AND price IS NOT NULL AND ea_item_id IN (SELECT id FROM tracked))
SELECT t, count(*) AS cards, round((percentile_cont(0.5) WITHIN GROUP (ORDER BY price::numeric / prev - 1) * 100)::numeric, 2) AS median_move_pct,
  round(avg((price > prev)::int) * 100) AS up_pct, round(avg((price < prev)::int) * 100) AS down_pct
FROM p WHERE prev IS NOT NULL GROUP BY t ORDER BY t;

\echo '== 7. Does buying dips pay? Every tracked console card at every refresh, by how far under its average it was'
\echo '   ret24 = price a day later; peak48 = best price within 2 days; pays = peak48 at least 6% up (beats the 5% tax)'
WITH tracked AS (SELECT DISTINCT source_card_key::bigint AS id FROM fut.player_cards
  WHERE owner_user_id IS NULL AND source_id = 'futgg_catalogue' AND market_tracked AND source_card_key ~ '^\d{1,10}$'),
p AS (SELECT ea_item_id, published_at AS t, price,
    avg(price) OVER w7 AS avg7, count(*) OVER w7 AS pts,
    lag(price) OVER w AS prev, lead(price, 2) OVER w AS p24,
    max(price) OVER (PARTITION BY ea_item_id ORDER BY published_at ROWS BETWEEN 1 FOLLOWING AND 4 FOLLOWING) AS peak48,
    lead(price, 4) OVER w AS p48
  FROM fut.futgg_prices WHERE game_year = 27 AND platform = 'console' AND price IS NOT NULL AND price >= 1000 AND ea_item_id IN (SELECT id FROM tracked)
  WINDOW w AS (PARTITION BY ea_item_id ORDER BY published_at), w7 AS (PARTITION BY ea_item_id ORDER BY published_at ROWS BETWEEN 13 PRECEDING AND CURRENT ROW)),
x AS (SELECT *, (avg7 - price) / avg7 AS disc FROM p WHERE pts >= 4 AND p24 IS NOT NULL AND p48 IS NOT NULL)
SELECT CASE WHEN disc >= 0.12 THEN 'a 12%+ under' WHEN disc >= 0.08 THEN 'b 8-12% under' WHEN disc >= 0.05 THEN 'c 5-8% under'
            WHEN disc > -0.05 THEN 'd near avg' WHEN disc > -0.15 THEN 'e 5-15% over' ELSE 'f 15%+ over' END AS spot,
  CASE WHEN price > prev THEN 'bounced' WHEN price = prev THEN 'flat' ELSE 'dipping' END AS last_move,
  count(*) AS n, round(avg(p24::numeric / price - 1) * 100, 1) AS ret24_pct, round(avg((p24 > price)::int) * 100) AS up24_pct,
  round(avg(peak48::numeric / price - 1) * 100, 1) AS peak48_pct, round(avg((peak48 >= price * 1.06)::int) * 100) AS pays_pct,
  round(avg(p48::numeric / price - 1) * 100, 1) AS ret48_pct
FROM x WHERE prev IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 2;

\echo '== 8. Same, dips only (5%+ under), by price band'
WITH tracked AS (SELECT DISTINCT source_card_key::bigint AS id FROM fut.player_cards
  WHERE owner_user_id IS NULL AND source_id = 'futgg_catalogue' AND market_tracked AND source_card_key ~ '^\d{1,10}$'),
p AS (SELECT ea_item_id, published_at AS t, price, avg(price) OVER w7 AS avg7, count(*) OVER w7 AS pts, lead(price, 2) OVER w AS p24,
    max(price) OVER (PARTITION BY ea_item_id ORDER BY published_at ROWS BETWEEN 1 FOLLOWING AND 4 FOLLOWING) AS peak48, lead(price, 4) OVER w AS p48
  FROM fut.futgg_prices WHERE game_year = 27 AND platform = 'console' AND price IS NOT NULL AND price >= 1000 AND ea_item_id IN (SELECT id FROM tracked)
  WINDOW w AS (PARTITION BY ea_item_id ORDER BY published_at), w7 AS (PARTITION BY ea_item_id ORDER BY published_at ROWS BETWEEN 13 PRECEDING AND CURRENT ROW))
SELECT CASE WHEN price < 5000 THEN 'a under 5k' WHEN price < 20000 THEN 'b 5k-20k' WHEN price < 100000 THEN 'c 20k-100k' ELSE 'd 100k+' END AS band,
  count(*) AS n, round(avg(p24::numeric / price - 1) * 100, 1) AS ret24_pct, round(avg((peak48 >= price * 1.06)::int) * 100) AS pays_pct,
  round(avg(p48::numeric / price - 1) * 100, 1) AS ret48_pct
FROM p WHERE pts >= 4 AND p48 IS NOT NULL AND (avg7 - price) / avg7 >= 0.05 GROUP BY 1 ORDER BY 1;

\echo '== 9. Saved daily plans and trades logged against picks'
SELECT platform, count(*) AS plans, min(plan_date), max(plan_date) FROM fut.strategy_plans GROUP BY 1;
SELECT count(*) AS trades, count(sold_for) AS sold FROM fut.trade_log WHERE bought_at > now() - interval '14 days';
ROLLBACK;
EOF_SQL
