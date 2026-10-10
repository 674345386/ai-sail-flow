#!/usr/bin/env python3
"""Compare the migrated empty public table and Storage policies with source catalogs."""
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent
source = json.loads((root / 'source-catalog.json.local').read_text())
details = json.loads((root / 'source-public-details.json.local').read_text())

def query(sql):
    return json.loads(subprocess.check_output([
        'ssh', 'ai-sail-flow-prod',
        'docker exec -i supabase-db psql -X -At -v ON_ERROR_STOP=1 -U postgres -d postgres'
    ], input=sql.encode()))

target = query("""
SELECT jsonb_build_object(
 'columns', (SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) ORDER BY a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped AND n.nspname='public' AND c.relname='health_check'),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('schema','public','table','health_check','name',conname,'definition',pg_get_constraintdef(oid))) FROM pg_constraint WHERE conrelid='public.health_check'::regclass),
 'indexes',(SELECT jsonb_agg(to_jsonb(i)) FROM pg_indexes i WHERE schemaname='public' AND tablename='health_check'),
 'sequence',(SELECT jsonb_agg(to_jsonb(s)) FROM pg_sequences s WHERE schemaname='public' AND sequencename='health_check_id_seq'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname) FROM pg_policies p WHERE schemaname='storage' AND tablename='objects'),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.health_check'::regclass),
 'table_rows',(SELECT count(*) FROM public.health_check),
 'client_access',(SELECT jsonb_object_agg(r,has_table_privilege(r,'public.health_check','SELECT') OR has_table_privilege(r,'public.health_check','INSERT') OR has_sequence_privilege(r,'public.health_check_id_seq','USAGE')) FROM unnest(ARRAY['anon','authenticated','service_role']) r)
);
""")
assert target['columns'] == [x for x in source['columns'] if x['schema'] == 'public']
assert target['constraints'] == [x for x in source['constraints'] if x['schema'] == 'public']
assert target['indexes'] == details['indexes']
for field in ('data_type','start_value','increment_by','min_value','max_value','cache_size','cycle'):
    assert target['sequence'][0][field] == details['sequence'][0][field], field
assert target['policies'] == source['policies'], 'Storage policy mismatch'
assert target['rls'] is False and target['table_rows'] == 0
assert not any(target['client_access'].values()), 'Source owner-only table became accessible'
report = {'public_table':'public.health_check','columns_match':True,'primary_key_and_index_match':True,'sequence_match':True,'storage_policies_match':True,'client_access_preserved':True,'rows_copied':0,'source_owner':'cloud_admin','target_owner':'postgres'}
out = root / 'schema-verification.json.local'
out.write_text(json.dumps(report,indent=2)+'\n')
out.chmod(0o600)
print(json.dumps(report,indent=2))
