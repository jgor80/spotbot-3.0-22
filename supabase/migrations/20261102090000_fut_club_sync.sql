-- XI Lab club sync: a user's synced cards are keyed by EA's item id (source_card_key), so a later sync updates
-- them and Market Lab price captures find them. Two users can own the same card version, so user cards get a
-- per-owner key; catalogue cards keep the per-source key.
DROP INDEX IF EXISTS fut.fut_player_cards_source_key;
CREATE UNIQUE INDEX fut_player_cards_source_key ON fut.player_cards(source_id, source_card_key)
  WHERE source_card_key IS NOT NULL AND owner_user_id IS NULL;
CREATE UNIQUE INDEX fut_player_cards_owner_key ON fut.player_cards(owner_user_id, source_card_key)
  WHERE source_card_key IS NOT NULL AND owner_user_id IS NOT NULL;
