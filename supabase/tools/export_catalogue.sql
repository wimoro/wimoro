-- Export du catalogue Postgres (schéma public + objets liés) en un seul document JSON.
-- Lecture seule. À exécuter avec un rôle ayant accès aux catalogues (postgres).
-- Le résultat (colonne "doc") est ensuite transformé en SQL par build_baseline.mjs.
select json_build_object(
 'generated_at', now(),
 'server_version', current_setting('server_version'),
 'db_bytes', pg_database_size(current_database()),
 'extensions', (select json_agg(json_build_object('name', e.extname, 'schema', n.nspname, 'version', e.extversion) order by e.extname) from pg_extension e join pg_namespace n on n.oid = e.extnamespace),
 'schema_public_acl', (select json_agg(json_build_object('grantee', coalesce(r.rolname,'PUBLIC'), 'priv', a.privilege_type) order by r.rolname, a.privilege_type) from pg_namespace ns cross join lateral aclexplode(ns.nspacl) a left join pg_roles r on r.oid = a.grantee where ns.nspname = 'public'),
 'default_acl', (select json_agg(json_build_object('role', pg_get_userbyid(d.defaclrole), 'schema', (select nspname from pg_namespace where oid = d.defaclnamespace), 'objtype', d.defaclobjtype, 'acl', d.defaclacl::text)) from pg_default_acl d),
 'enums', (select json_agg(json_build_object('name', t.typname, 'labels', (select json_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid)) order by t.typname) from pg_type t where t.typnamespace = 'public'::regnamespace and t.typtype = 'e'),
 'domains', (select json_agg(json_build_object('name', t.typname, 'base', format_type(t.typbasetype, t.typtypmod), 'notnull', t.typnotnull, 'default', t.typdefault) order by t.typname) from pg_type t where t.typnamespace = 'public'::regnamespace and t.typtype = 'd'),
 'composites', (select json_agg(json_build_object('name', c.relname, 'attrs', (select json_agg(json_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod)) order by a.attnum) from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)) order by c.relname) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'c'),
 'sequences', (select json_agg(json_build_object('name', s.sequencename, 'type', s.data_type::text, 'start', s.start_value, 'min', s.min_value, 'max', s.max_value, 'inc', s.increment_by, 'cycle', s.cycle, 'last', s.last_value) order by s.sequencename) from pg_sequences s where s.schemaname = 'public'),
 'tables', (select json_agg(json_build_object(
   'name', c.relname,
   'kind', c.relkind,
   'rls', c.relrowsecurity,
   'force_rls', c.relforcerowsecurity,
   'owner', pg_get_userbyid(c.relowner),
   'replica_identity', c.relreplident,
   'comment', obj_description(c.oid, 'pg_class'),
   'est_rows', (select s.n_live_tup from pg_stat_user_tables s where s.relid = c.oid),
   'dead_rows', (select s.n_dead_tup from pg_stat_user_tables s where s.relid = c.oid),
   'total_bytes', pg_total_relation_size(c.oid),
   'grants', (select json_agg(json_build_object('grantee', coalesce(r.rolname,'PUBLIC'), 'priv', a.privilege_type) order by r.rolname, a.privilege_type) from aclexplode(c.relacl) a left join pg_roles r on r.oid = a.grantee),
   'columns', (select json_agg(json_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'notnull', a.attnotnull, 'default', pg_get_expr(d.adbin, d.adrelid), 'identity', a.attidentity, 'generated', a.attgenerated) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
   'constraints', (select json_agg(json_build_object('name', k.conname, 'type', k.contype, 'def', pg_get_constraintdef(k.oid)) order by k.contype, k.conname) from pg_constraint k where k.conrelid = c.oid),
   'indexes', (select json_agg(json_build_object('name', ic.relname, 'def', pg_get_indexdef(i.indexrelid), 'constraint', exists(select 1 from pg_constraint k where k.conindid = i.indexrelid), 'scans', (select s.idx_scan from pg_stat_user_indexes s where s.indexrelid = i.indexrelid)) order by ic.relname) from pg_index i join pg_class ic on ic.oid = i.indexrelid where i.indrelid = c.oid),
   'triggers', (select json_agg(json_build_object('name', t.tgname, 'enabled', t.tgenabled, 'def', pg_get_triggerdef(t.oid)) order by t.tgname) from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal),
   'policies', (select json_agg(json_build_object('name', p.polname, 'cmd', p.polcmd, 'permissive', p.polpermissive, 'roles', (select json_agg(case when x = 0 then 'public' else (select rolname from pg_roles where oid = x) end) from unnest(p.polroles) x), 'using', pg_get_expr(p.polqual, p.polrelid), 'check', pg_get_expr(p.polwithcheck, p.polrelid)) order by p.polname) from pg_policy p where p.polrelid = c.oid)
  ) order by c.relname) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')),
 'views', (select json_agg(json_build_object('name', c.relname, 'kind', c.relkind, 'options', c.reloptions, 'def', pg_get_viewdef(c.oid, true), 'grants', (select json_agg(json_build_object('grantee', coalesce(r.rolname,'PUBLIC'), 'priv', a.privilege_type) order by r.rolname, a.privilege_type) from aclexplode(c.relacl) a left join pg_roles r on r.oid = a.grantee)) order by c.relname) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v','m')),
 'functions', (select json_agg(json_build_object(
    'sig', p.oid::regprocedure::text,
    'name', p.proname,
    'args', pg_get_function_arguments(p.oid),
    'identity_args', pg_get_function_identity_arguments(p.oid),
    'result', pg_get_function_result(p.oid),
    'kind', p.prokind,
    'lang', l.lanname,
    'secdef', p.prosecdef,
    'volatile', p.provolatile,
    'config', p.proconfig,
    'owner', pg_get_userbyid(p.proowner),
    'acl_null', p.proacl is null,
    'grants', (select json_agg(coalesce(r.rolname,'PUBLIC') order by r.rolname) from aclexplode(p.proacl) a left join pg_roles r on r.oid = a.grantee where a.privilege_type = 'EXECUTE'),
    'comment', obj_description(p.oid, 'pg_proc'),
    'def', case when p.prokind in ('f','p') then pg_get_functiondef(p.oid) end
  ) order by p.proname, pg_get_function_identity_arguments(p.oid))
  from pg_proc p join pg_language l on l.oid = p.prolang
  where p.pronamespace = 'public'::regnamespace
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
 'foreign_triggers', (select json_agg(json_build_object('table', t.tgrelid::regclass::text, 'name', t.tgname, 'enabled', t.tgenabled, 'def', pg_get_triggerdef(t.oid)) order by t.tgname) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace join pg_proc f on f.oid = t.tgfoid where not t.tgisinternal and n.nspname <> 'public' and f.pronamespace = 'public'::regnamespace),
 'foreign_policies', (select json_agg(json_build_object('table', schemaname || '.' || tablename, 'name', policyname, 'cmd', cmd, 'permissive', permissive, 'roles', roles, 'using', qual, 'check', with_check) order by schemaname, tablename, policyname) from pg_policies where schemaname in ('storage','realtime')),
 'publications', (select json_agg(json_build_object('name', p.pubname, 'all_tables', p.puballtables, 'insert', p.pubinsert, 'update', p.pubupdate, 'delete', p.pubdelete, 'truncate', p.pubtruncate, 'tables', (select json_agg(pt.schemaname || '.' || pt.tablename order by pt.schemaname, pt.tablename) from pg_publication_tables pt where pt.pubname = p.pubname)) order by p.pubname) from pg_publication p),
 'cron_jobs', (select json_agg(json_build_object('jobid', j.jobid, 'jobname', j.jobname, 'schedule', j.schedule, 'command', j.command, 'database', j.database, 'username', j.username, 'active', j.active) order by j.jobid) from cron.job j),
 'cron_stats', (select json_agg(x) from (select d.jobid, count(*) as runs, count(*) filter (where d.status <> 'succeeded') as not_succeeded, round(avg(extract(epoch from (d.end_time - d.start_time)))::numeric, 3) as avg_s, round(max(extract(epoch from (d.end_time - d.start_time)))::numeric, 3) as max_s, min(d.start_time) as first_run, max(d.start_time) as last_run from cron.job_run_details d group by d.jobid order by d.jobid) x),
 'cron_details_bytes', pg_total_relation_size('cron.job_run_details'),
 'storage_buckets', (select json_agg(json_build_object('id', b.id, 'name', b.name, 'public', b.public, 'file_size_limit', b.file_size_limit, 'allowed_mime_types', b.allowed_mime_types)) from storage.buckets b),
 'storage_objects', (select count(*) from storage.objects),
 'auth_counts', (select json_build_object('users', count(*), 'confirmed', count(*) filter (where email_confirmed_at is not null), 'anonymous', count(*) filter (where is_anonymous), 'signed_in_7d', count(*) filter (where last_sign_in_at > now() - interval '7 days')) from auth.users)
) as doc;
