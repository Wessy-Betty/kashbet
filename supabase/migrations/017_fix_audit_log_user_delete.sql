-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet / Fedika — Migration 017
--  Make write_audit_log() resilient to user deletion.
--
--  Deleting a user cascades from user_profiles into every user-scoped table. The
--  AFTER INSERT/UPDATE/DELETE audit trigger then fired on each deleted child row
--  and tried to INSERT an audit_log row referencing the user_profiles row that
--  the same cascade had already removed, violating audit_log_user_id_fkey and
--  aborting the entire delete.
--
--  Fix: skip the audit write when the owning user no longer exists (i.e. mid
--  cascade of a user deletion). Normal single-row edits are unaffected — the
--  user still exists then, so they log as before.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION write_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    uid uuid;
BEGIN
    uid := COALESCE(NEW.user_id, OLD.user_id);

    -- Owning user already gone (user deletion in progress) — skip logging,
    -- otherwise the FK to user_profiles fails and the delete aborts.
    IF uid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = uid) THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    INSERT INTO audit_log (user_id, table_name, record_id, action, old_data, new_data)
    VALUES (
        uid,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        CASE WHEN TG_OP != 'INSERT' THEN row_to_json(OLD)::jsonb ELSE NULL END,
        CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW)::jsonb ELSE NULL END
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- After this runs, deleting a user is just:
--   DELETE FROM auth.users WHERE id = '<uuid>';
-- No need to disable triggers.
