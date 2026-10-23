begin;

-- The community approved activating the 191 confirmed entries and omitting
-- the two ambiguous source codes. Their original input remains in the seed TSV.
-- Run only while those original pending entries exist, preserving later edits.
do $$
declare
    target record;
    pending jsonb;
    omitted integer;
begin
    select id,rules_status,validation_rules into target
    from public.deck_formats where code='DIGICREST' for update;
    if not found then return; end if;

    select count(*) filter(where value->>'code' in ('BT21-02','EX6') and value->>'points'='2'),
        coalesce(jsonb_agg(value) filter(where not (value->>'code' in ('BT21-02','EX6') and value->>'points'='2')),'[]'::jsonb)
    into omitted,pending
    from jsonb_array_elements(coalesce(target.validation_rules->'points_pending','[]'::jsonb));

    if omitted=0 then return; end if;
    update public.deck_formats set
        validation_rules=jsonb_set(target.validation_rules,'{points_pending}',pending),
        rules_status=case when jsonb_array_length(pending)=0 then 'published' else target.rules_status end,
        is_active=true,
        change_note='Ativação autorizada com as cartas confirmadas. Gomamon (BT21-02) e Tapirmon (EX6) ficam fora da pontuação inicial; cartas não cadastradas valem zero.'
    where id=target.id;
end;
$$;

commit;
