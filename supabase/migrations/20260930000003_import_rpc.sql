-- Atomic import of a parsed upload.
-- Samples dedupe on (org_id, dedupe_key); when a duplicate arrives, its results only fill gaps
-- (e.g. a comparison sheet adds formulated values to lab results already on file).
-- security invoker: RLS applies, so callers can only import into orgs they belong to.

create or replace function public.import_feed_upload(
  p_org uuid,
  p_upload jsonb,
  p_samples jsonb,
  p_formulations jsonb default '[]'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_upload uuid;
  v_sample jsonb;
  v_sample_id uuid;
  v_inserted boolean;
  v_new int := 0;
  v_merged int := 0;
begin
  insert into public.uploads (org_id, file_name, storage_path, sheets)
  values (p_org, p_upload ->> 'file_name', p_upload ->> 'storage_path', coalesce(p_upload -> 'sheets', '[]'))
  returning id into v_upload;

  for v_sample in select * from jsonb_array_elements(p_samples) loop
    insert into public.samples as s (
      org_id, location_id, upload_id, farm_label, external_id, sample_no, diet_code, diet_key, phase,
      sampled_on, source, lab_or_instrument, dm, source_sheet, source_ref, dedupe_key
    ) values (
      p_org,
      (v_sample ->> 'location_id')::uuid,
      v_upload,
      v_sample ->> 'farm_label',
      v_sample ->> 'external_id',
      v_sample ->> 'sample_no',
      v_sample ->> 'diet_code',
      v_sample ->> 'diet_key',
      v_sample ->> 'phase',
      (v_sample ->> 'sampled_on')::date,
      v_sample ->> 'source',
      v_sample ->> 'lab_or_instrument',
      (v_sample ->> 'dm')::numeric,
      v_sample ->> 'source_sheet',
      v_sample ->> 'source_ref',
      v_sample ->> 'dedupe_key'
    )
    on conflict (org_id, dedupe_key) do update
      set farm_label = coalesce(s.farm_label, excluded.farm_label),
          dm = coalesce(s.dm, excluded.dm)
    returning id, (xmax = 0) into v_sample_id, v_inserted;

    if v_inserted then v_new := v_new + 1; else v_merged := v_merged + 1; end if;

    insert into public.sample_results as r (sample_id, nutrient, basis, analyzed, intended, intended_offset, sheet_pct)
    select v_sample_id, x.nutrient, coalesce(x.basis, 'as_received'), x.analyzed, x.intended, x.intended_offset, x.sheet_pct
    from jsonb_to_recordset(v_sample -> 'results')
      as x (nutrient text, basis text, analyzed numeric, intended numeric, intended_offset numeric, sheet_pct numeric)
    on conflict (sample_id, nutrient, basis) do update
      set analyzed = coalesce(r.analyzed, excluded.analyzed),
          intended = coalesce(r.intended, excluded.intended),
          intended_offset = coalesce(r.intended_offset, excluded.intended_offset),
          sheet_pct = coalesce(r.sheet_pct, excluded.sheet_pct);
  end loop;

  insert into public.diet_formulations (org_id, diet_key, effective_from, nutrient, intended)
  select p_org, f.diet_key, f.effective_from, f.nutrient, f.intended
  from jsonb_to_recordset(p_formulations) as f (diet_key text, effective_from date, nutrient text, intended numeric)
  on conflict (org_id, diet_key, effective_from, nutrient) do update set intended = excluded.intended;

  update public.uploads set inserted_count = v_new, merged_count = v_merged where id = v_upload;

  return jsonb_build_object('upload_id', v_upload, 'inserted', v_new, 'merged', v_merged);
end;
$$;

grant execute on function public.import_feed_upload(uuid, jsonb, jsonb, jsonb) to authenticated;
