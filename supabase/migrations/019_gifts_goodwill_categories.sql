-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet / Fedika — Migration 019
--  Add "Gifts" and "Goodwill" as system expense categories (they were tracked
--  separately in the old spending sheet and had no home in the app).
--  Users can further add/rename their own categories from Settings.
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO transaction_categories (id, name, classification, icon, is_system, sort_order) VALUES
    ('00000000-0021-0000-0000-000000000000', 'Gifts',    'want', '🎁', true, 19),
    ('00000000-0022-0000-0000-000000000000', 'Goodwill', 'want', '🤝', true, 20)
ON CONFLICT (id) DO UPDATE
    SET name           = EXCLUDED.name,
        classification = EXCLUDED.classification,
        icon           = EXCLUDED.icon,
        sort_order     = EXCLUDED.sort_order;
