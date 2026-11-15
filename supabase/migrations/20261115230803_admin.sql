-- Panel d'administration (phase 6).
--
-- Une seule porte : api_admin(action, paramètres). Le serveur vérifie à chaque appel que l'appelant figure dans
-- public.admin_users ; sinon « interdit ». Aucune clé de service dans le navigateur. Chaque action qui modifie quelque
-- chose est écrite dans wm.admin_journal (qui, quoi, sur qui, détail).
--   joueurs  : recherche (pseudo ou e-mail), fiche, solde (motif obligatoire, jamais négatif), XP, rang, KYC fictif,
--              suspension (wm.uid refuse alors toute action du joueur : « suspendu »).
--   marchés  : création, modification, fermeture / réouverture des mises, résolution. À la résolution, chaque part
--              gagnante vaut 1 $ ; les positions sont réglées, l'historique et les statistiques mis à jour, chaque
--              joueur prévenu. Dans un marché à plusieurs issues, résoudre une issue par « oui » résout les autres par « non ».
--   chat     : derniers messages des joueurs, masquage d'un message (il n'est plus servi ; rien n'est supprimé).
--   bots     : marche / arrêt, intensité, bavardage.
--   chiffres : inscrits, actifs, volume, soldes, taille de la base.
-- Les marchés créés ici sont décrits à l'écran par api_markets (champ « def ») : le site les ajoute à son catalogue.

create table if not exists wm.admin_journal (
  id bigint generated always as identity primary key,
  admin_id uuid not null,
  action text not null,
  cible text,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
alter table wm.admin_journal enable row level security;
revoke all on wm.admin_journal from public, anon, authenticated;
create index if not exists idx_admin_journal_at on wm.admin_journal (at desc);

alter table wm.rg add column if not exists susp_until timestamptz, add column if not exists susp_motif text;

create or replace function wm.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
$$;

create or replace function wm.adm_note(p_admin uuid, p_action text, p_cible text, p_detail jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into wm.admin_journal (admin_id, action, cible, detail) values (p_admin, p_action, p_cible, coalesce(p_detail, '{}'::jsonb))
$$;

-- Identité de l'appelant : refuse un compte suspendu (par un administrateur) ou auto-exclu (par lui-même).
create or replace function wm.uid() returns uuid
language plpgsql stable set search_path = '' as $$
declare v uuid := auth.uid(); v_excl timestamptz; v_susp timestamptz;
begin
  if v is null then raise exception 'session' using errcode = 'P0001'; end if;
  select r.excl_until, r.susp_until into v_excl, v_susp from wm.rg r where r.user_id = v;
  if v_susp is not null and v_susp > now() then
    raise exception 'suspendu' using errcode = 'P0001',
      detail = case when v_susp = 'infinity' then '-1' else ((extract(epoch from v_susp) * 1000)::bigint)::text end;
  end if;
  if v_excl is not null and v_excl > now() then
    raise exception 'exclu' using errcode = 'P0001',
      detail = case when v_excl = 'infinity' then '-1' else ((extract(epoch from v_excl) * 1000)::bigint)::text end;
  end if;
  return v;
end $$;

-- ── Chiffres ──
create or replace function wm.adm_chiffres() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'inscrits', (select count(*) from auth.users),
    'inscrits_7j', (select count(*) from auth.users a where a.created_at > now() - interval '7 days'),
    'actifs_24h', (select count(*) from auth.users a where a.last_sign_in_at > now() - interval '24 hours'),
    'actifs_7j', (select count(*) from auth.users a where a.last_sign_in_at > now() - interval '7 days'),
    'bots', (select count(*) from public.users u where u.is_demo),
    'marches_ouverts', (select count(*) from public.markets m where coalesce(m.status, 'open') in ('open', 'closing_soon')),
    'volume_total', (select coalesce(round(sum(l.volume_total)), 0) from public.market_live_state l),
    'mises_24h', (select coalesce(round(sum(abs(b.amount)), 2), 0) from public.balance_ledger b where b.kind = 'bet' and b.created_at > now() - interval '24 hours'),
    'positions', (select count(*) from public.positions p where p.shares > 0),
    'messages_24h', (select count(*) from public.chat_messages c where c.source = 'joueur' and c.created_at > now() - interval '24 hours'),
    'soldes', (select coalesce(round(sum(s.balance), 2), 0) from public.user_stats s join auth.users a on a.id = s.user_id),
    'base_mo', round(pg_database_size(current_database()) / 1048576.0),
    'bots_cfg', coalesce((select c.value from wm.config c where c.key = 'bots'), '{}'::jsonb),
    'present', coalesce((select c.updated_at > now() - interval '6 minutes' from wm.config c where c.key = 'presence'), false))
$$;

-- ── Joueurs ──
create or replace function wm.adm_joueur_json(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', u.id, 'n', u.username, 'email', coalesce(a.email, ''), 'bot', coalesce(u.is_demo, false),
    'since', (extract(epoch from u.created_at) * 1000)::bigint, 'vu', (extract(epoch from a.last_sign_in_at) * 1000)::bigint,
    'balance', s.balance, 'xp', s.xp, 't', coalesce(s.rank_tier, 0), 'd', coalesce(s.rank_division, 0),
    'settled', coalesce(s.bets_settled, 0), 'wins', coalesce(s.bets_won, 0), 'deposits', coalesce(s.deposits_count, 0),
    'kyc', coalesce(u.kyc_verified, false),
    'susp', case when r.susp_until > now() then case when r.susp_until = 'infinity' then -1 else (extract(epoch from r.susp_until) * 1000)::bigint end end,
    'suspMotif', case when r.susp_until > now() then r.susp_motif end,
    'excl', case when r.excl_until > now() then case when r.excl_until = 'infinity' then -1 else (extract(epoch from r.excl_until) * 1000)::bigint end end,
    'admin', exists (select 1 from public.admin_users x where x.user_id = u.id))
  from public.users u
  join public.user_stats s on s.user_id = u.id
  left join auth.users a on a.id = u.id
  left join wm.rg r on r.user_id = u.id
  where u.id = p_user
$$;

create or replace function wm.adm_joueurs(p_q text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with q as (select lower(btrim(coalesce(p_q, ''))) as t)
  select jsonb_build_object('joueurs', coalesce(jsonb_agg(wm.adm_joueur_json(x.id) order by x.bot, x.cree desc), '[]'::jsonb))
  from (select u.id, coalesce(u.is_demo, false) as bot, u.created_at as cree
        from public.users u left join auth.users a on a.id = u.id, q
        where (q.t = '' and not coalesce(u.is_demo, false))
           or (q.t <> '' and (position(q.t in lower(u.username)) > 0 or position(q.t in lower(coalesce(a.email, ''))) > 0))
        order by coalesce(u.is_demo, false), u.created_at desc limit 30) x
$$;

create or replace function wm.adm_joueur(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb := wm.adm_joueur_json(p_user);
begin
  if v is null then perform wm.fail('joueur_inconnu'); end if;
  return jsonb_build_object('j', v,
    'ops', coalesce((select jsonb_agg(jsonb_build_object('k', b.kind, 'amt', b.amount, 'solde', b.balance_after, 'ref', b.ref_id, 'at', (extract(epoch from b.created_at) * 1000)::bigint) order by b.created_at desc, b.id desc)
                     from (select * from public.balance_ledger l where l.user_id = p_user order by l.created_at desc, l.id desc limit 15) b), '[]'::jsonb),
    'journal', coalesce((select jsonb_agg(jsonb_build_object('a', j.action, 'd', j.detail, 'at', (extract(epoch from j.at) * 1000)::bigint) order by j.id desc)
                         from (select * from wm.admin_journal x where x.cible = p_user::text order by x.id desc limit 10) j), '[]'::jsonb));
end $$;

create or replace function wm.adm_solde(p_admin uuid, p_user uuid, p_delta numeric, p_motif text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_avant numeric; v_apres numeric; v_delta numeric := round(coalesce(p_delta, 0), 2); v_motif text := btrim(coalesce(p_motif, ''));
begin
  if length(v_motif) < 3 then perform wm.fail('motif_requis'); end if;
  if v_delta = 0 or abs(v_delta) > 10000000 then perform wm.fail('montant_invalide'); end if;
  select s.balance into v_avant from public.user_stats s where s.user_id = p_user for update;
  if not found then perform wm.fail('joueur_inconnu'); end if;
  v_apres := v_avant + v_delta;
  if v_apres < 0 then perform wm.fail('solde_negatif'); end if;
  update public.user_stats set balance = v_apres where user_id = p_user;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (p_user, v_delta, v_apres, 'admin', left(v_motif, 120));
  perform wm.adm_note(p_admin, 'solde', p_user::text, jsonb_build_object('delta', v_delta, 'avant', v_avant, 'apres', v_apres, 'motif', left(v_motif, 200)));
  perform wm.notify(p_user, 'wallet', 'admin_solde', jsonb_build_object('delta', v_delta), '#profil');
  return wm.adm_joueur(p_user);
end $$;

create or replace function wm.adm_xp(p_admin uuid, p_user uuid, p_delta integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_avant integer; v_apres integer;
begin
  if coalesce(p_delta, 0) = 0 or abs(p_delta) > 100000 then perform wm.fail('montant_invalide'); end if;
  select s.xp into v_avant from public.user_stats s where s.user_id = p_user for update;
  if not found then perform wm.fail('joueur_inconnu'); end if;
  v_apres := greatest(0, coalesce(v_avant, 0) + p_delta);
  update public.user_stats set xp = v_apres where user_id = p_user;
  perform wm.rank_refresh(p_user);
  perform wm.adm_note(p_admin, 'xp', p_user::text, jsonb_build_object('delta', p_delta, 'avant', v_avant, 'apres', v_apres));
  return wm.adm_joueur(p_user);
end $$;

-- Donner un rang : le rang se déduit de l'XP et des conditions (paris réglés, précision…). On relève donc ces compteurs
-- au niveau exigé par le rang demandé ; on ne les baisse jamais. L'écran, qui fait le même calcul, affiche le même rang.
create or replace function wm.adm_rang(p_admin uuid, p_user uuid, p_t integer, p_d integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  seuils integer[] := array[0,100,200, 300,450,600, 800,1000,1200, 1450,1700,1950, 2250,2550,2850, 3200,3600,4000, 4500,5000,5500, 6100,6700,7300, 8000,8000,8000];
  regles integer[] := array[0, 3, 10, 25, 60, 120, 200, 320, 320];
  precis integer[] := array[0, 0, 0, 50, 55, 57, 58, 60, 60];
  suivis integer[] := array[0, 0, 0, 0, 0, 25, 100, 300, 300];
  v_t integer := coalesce(p_t, -1); v_d integer := coalesce(p_d, 0); v_regles integer;
begin
  if v_t < 0 or v_t > 8 or v_d < 0 or v_d > 2 then perform wm.fail('rang_invalide'); end if;
  if v_t = 8 then v_d := 0; end if;
  perform 1 from public.user_stats s where s.user_id = p_user for update;
  if not found then perform wm.fail('joueur_inconnu'); end if;
  select greatest(coalesce(s.bets_settled, 0), regles[v_t + 1]) into v_regles from public.user_stats s where s.user_id = p_user;
  update public.user_stats s set
    xp = greatest(coalesce(s.xp, 0), seuils[v_t * 3 + v_d + 1]),
    bets_settled = v_regles,
    bets_won = greatest(coalesce(s.bets_won, 0), ceil(v_regles * precis[v_t + 1] / 100.0)::integer),
    deposits_count = greatest(coalesce(s.deposits_count, 0), case when v_t >= 2 then 1 else 0 end),
    flash_wins = greatest(coalesce(s.flash_wins, 0), case when v_t >= 4 then 3 else 0 end),
    followed_bets_count = greatest(coalesce(s.followed_bets_count, 0), suivis[v_t + 1]),
    seasonal_position = case when v_t = 8 then least(coalesce(s.seasonal_position, 100), 100) else s.seasonal_position end
  where s.user_id = p_user;
  perform wm.rank_refresh(p_user);
  perform wm.adm_note(p_admin, 'rang', p_user::text, jsonb_build_object('t', v_t, 'd', v_d));
  return wm.adm_joueur(p_user);
end $$;

create or replace function wm.adm_kyc(p_admin uuid, p_user uuid, p_ok boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update public.users set kyc_verified = coalesce(p_ok, false), kyc_at = case when coalesce(p_ok, false) then now() end where id = p_user;
  if not found then perform wm.fail('joueur_inconnu'); end if;
  if coalesce(p_ok, false) then perform wm.notify(p_user, 'shield', 'kyc_ok', '{}'::jsonb, '#depot'); end if;
  perform wm.adm_note(p_admin, 'kyc', p_user::text, jsonb_build_object('ok', coalesce(p_ok, false)));
  return wm.adm_joueur(p_user);
end $$;

-- p_jours : nombre de jours ; -1 = sans limite ; 0 ou null = lever la suspension.
create or replace function wm.adm_suspendre(p_admin uuid, p_user uuid, p_jours integer, p_motif text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_fin timestamptz; v_motif text := btrim(coalesce(p_motif, ''));
begin
  if not exists (select 1 from public.users u where u.id = p_user) then perform wm.fail('joueur_inconnu'); end if;
  if coalesce(p_jours, 0) <> 0 then
    if p_user = p_admin or exists (select 1 from public.admin_users a where a.user_id = p_user) then perform wm.fail('interdit'); end if;
    if length(v_motif) < 3 then perform wm.fail('motif_requis'); end if;
    if p_jours < -1 or p_jours > 3650 then perform wm.fail('montant_invalide'); end if;
    v_fin := case when p_jours = -1 then 'infinity'::timestamptz else now() + make_interval(days => p_jours) end;
  end if;
  insert into wm.rg (user_id, susp_until, susp_motif) values (p_user, v_fin, case when v_fin is not null then left(v_motif, 200) end)
  on conflict (user_id) do update set susp_until = excluded.susp_until, susp_motif = excluded.susp_motif, updated_at = now();
  perform wm.adm_note(p_admin, case when v_fin is null then 'suspension_levee' else 'suspension' end, p_user::text,
    jsonb_build_object('jours', coalesce(p_jours, 0), 'motif', left(v_motif, 200)));
  return wm.adm_joueur(p_user);
end $$;

-- ── Marchés ──
create or replace function wm.adm_marches() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('marches', coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'q', m.question, 'short', coalesce(m.short_question, ''), 'cat', m.category, 'st', coalesce(m.status, 'open'),
    'issue', case m.resolution_outcome when 'yes' then 'oui' when 'no' then 'non' else m.resolution_outcome end, 'p', round(l.current_probability, 2), 'ref', m.current_probability, 'vol', round(l.volume_total),
    'date', m.close_date, 'time', to_char(m.close_time, 'HH24:MI'), 'heat', m.heat_level, 'rules', coalesce(m.resolution_rules, ''),
    'parent', m.group_parent_id, 'cree', m.creator_user_id is not null,
    'positions', (select count(*) from public.positions p where p.market_id = m.id and p.shares > 0))
    order by case coalesce(m.status, 'open') when 'resolved' then 2 when 'closed' then 1 else 0 end, m.id), '[]'::jsonb))
  from public.markets m left join public.market_live_state l on l.market_id = m.id
$$;

create or replace function wm.adm_marche_enregistrer(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id text := lower(btrim(coalesce(p ->> 'id', ''))); v_q text := btrim(coalesce(p ->> 'q', '')); v_cat text := btrim(coalesce(p ->> 'cat', ''));
  v_short text := btrim(coalesce(p ->> 'short', '')); v_rules text := btrim(coalesce(p ->> 'rules', ''));
  v_date date := wm.jour(p ->> 'date'); v_time time; v_p numeric := coalesce(wm.num(p ->> 'p'), 50); v_heat numeric := coalesce(wm.num(p ->> 'heat'), 1.5);
  mk public.markets;
begin
  if v_id !~ '^[a-z0-9][a-z0-9-]{2,39}$' then perform wm.fail('identifiant_invalide'); end if;
  if length(v_q) < 8 or length(v_q) > 200 then perform wm.fail('question_invalide'); end if;
  if v_cat not in ('Crypto', 'Football', 'Politique', 'Tech et IA', 'Économie', 'Culture', 'Météo', 'Sport') then perform wm.fail('categorie_invalide'); end if;
  if v_date is null then perform wm.fail('date_invalide'); end if;
  if v_p < 3 or v_p > 97 or v_heat < 0.5 or v_heat > 4 or length(v_rules) > 600 or length(v_short) > 60 then perform wm.fail('montant_invalide'); end if;
  begin v_time := coalesce(nullif(btrim(coalesce(p ->> 'time', '')), ''), '23:59')::time; exception when others then perform wm.fail('date_invalide'); end;
  if v_short = '' then v_short := left(v_q, 40); end if;

  select * into mk from public.markets m where m.id = v_id for update;
  if found then
    if mk.status = 'resolved' then perform wm.fail('deja_resolu'); end if;
    update public.markets set question = v_q, short_question = v_short, category = v_cat, close_date = v_date, close_time = v_time,
      resolution_rules = v_rules, heat_level = v_heat, current_probability = v_p, updated_at = now() where id = v_id;
    perform wm.adm_note(p_admin, 'marche_modifie', v_id, p - 'id');
  else
    if v_date < current_date then perform wm.fail('date_invalide'); end if;
    insert into public.markets (id, category, question, short_question, creator_user_id, current_probability, initial_probability, anchor_probability,
                                heat_level, close_date, close_time, resolution_rules, status)
    values (v_id, v_cat, v_q, v_short, p_admin, v_p, v_p, v_p, v_heat, v_date, v_time, v_rules, 'open');
    insert into public.market_live_state (market_id, current_probability, anchor_probability, volume_total, participants_count, liquidity_depth, d0)
    values (v_id, v_p, v_p, 0, 0, 6000, v_p);
    insert into public.chat_rooms (id, name, kind, market_id) values ('m:' || v_id, '#' || v_id, 'market', v_id) on conflict (id) do nothing;
    perform wm.adm_note(p_admin, 'marche_cree', v_id, p - 'id');
  end if;
  perform realtime.send(jsonb_build_object('id', v_id, 'st', 'open'), 'etat', 'marches', false);
  return wm.adm_marches();
end $$;

-- Fermer (plus de mises, en attendant le résultat) ou rouvrir.
create or replace function wm.adm_marche_etat(p_admin uuid, p_market text, p_etat text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare mk public.markets;
begin
  if p_etat is null or p_etat not in ('open', 'closed') then perform wm.fail('etat_invalide'); end if;
  select * into mk from public.markets m where m.id = p_market for update;
  if not found then perform wm.fail('marche_inconnu'); end if;
  if mk.status = 'resolved' then perform wm.fail('deja_resolu'); end if;
  update public.markets set status = p_etat, updated_at = now() where id = p_market;
  perform wm.adm_note(p_admin, case when p_etat = 'closed' then 'marche_ferme' else 'marche_rouvert' end, p_market, '{}'::jsonb);
  perform realtime.send(jsonb_build_object('id', p_market, 'st', p_etat), 'etat', 'marches', false);
  return wm.adm_marches();
end $$;

-- Règle un marché : chaque part du côté gagnant vaut 1 $, les autres 0. Renvoie {joueurs, verse}.
create or replace function wm.marche_regler(p_market text, p_issue text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pos public.positions; v_gain numeric; v_cout numeric; v_solde numeric; v_n integer := 0; v_total numeric := 0;
begin
  update public.markets set status = 'resolved', resolution_outcome = case when p_issue = 'oui' then 'yes' else 'no' end,   -- valeurs imposées par la table
    resolved_at = now(), updated_at = now() where id = p_market;
  for pos in select * from public.positions p where p.market_id = p_market and p.shares > 0 order by p.user_id, p.side for update loop
    v_gain := case when pos.side = p_issue then trunc(pos.shares, 2) else 0 end;
    v_cout := round(pos.shares * pos.average_price / 100, 2);
    update public.user_stats s set balance = s.balance + v_gain, profit_realized = coalesce(s.profit_realized, 0) + v_gain - v_cout,
      bets_settled = coalesce(s.bets_settled, 0) + 1, bets_won = coalesce(s.bets_won, 0) + case when v_gain > 0 then 1 else 0 end
    where s.user_id = pos.user_id returning s.balance into v_solde;
    if v_gain > 0 then
      insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (pos.user_id, v_gain, v_solde, 'res', p_market || ':' || pos.side);
    end if;
    insert into public.position_history (user_id, kind, market_id, side, was_winner, pnl) values (pos.user_id, 'res', p_market, pos.side, v_gain > 0, v_gain - v_cout);
    update public.positions set shares = 0, updated_at = now() where id = pos.id;
    perform wm.rank_refresh(pos.user_id);
    perform wm.notify(pos.user_id, case when v_gain > 0 then 'trophy' else 'info' end, 'marche_resolu',
      jsonb_build_object('m', p_market, 's', pos.side, 'o', p_issue, 'pay', v_gain, 'pnl', v_gain - v_cout), '#profil');
    v_n := v_n + 1; v_total := v_total + v_gain;
  end loop;
  update public.market_live_state set open_yes = 0, open_no = 0, current_probability = case when p_issue = 'oui' then 99 else 1 end, seq = seq + 1, updated_at = now()
  where market_id = p_market;
  perform realtime.send(jsonb_build_object('id', p_market, 'st', 'resolved', 'o', p_issue), 'etat', 'marches', false);
  return jsonb_build_object('joueurs', v_n, 'verse', v_total);
end $$;

create or replace function wm.adm_marche_resoudre(p_admin uuid, p_market text, p_issue text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare mk public.markets; v_res jsonb; v_autres jsonb := '{}'::jsonb; f record;
begin
  if p_issue is null or p_issue not in ('oui', 'non') then perform wm.fail('issue_invalide'); end if;
  select * into mk from public.markets m where m.id = p_market for update;
  if not found then perform wm.fail('marche_inconnu'); end if;
  if mk.status = 'resolved' then perform wm.fail('deja_resolu'); end if;
  v_res := wm.marche_regler(p_market, p_issue);
  if mk.group_parent_id is not null and p_issue = 'oui' then          -- une seule issue peut gagner : les autres se résolvent par « non »
    for f in select m.id from public.markets m where m.group_parent_id = mk.group_parent_id and m.id <> p_market and coalesce(m.status, 'open') <> 'resolved' order by m.id for update loop
      v_autres := v_autres || jsonb_build_object(f.id, wm.marche_regler(f.id, 'non'));
    end loop;
    update public.market_groups set status = 'resolved' where id = mk.group_parent_id;
  end if;
  perform wm.adm_note(p_admin, 'marche_resolu', p_market, v_res || jsonb_build_object('issue', p_issue, 'autres', v_autres));
  return wm.adm_marches() || jsonb_build_object('reglement', v_res, 'autres', v_autres);
end $$;

-- ── Chat ──
create or replace function wm.adm_chat() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('msgs', coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'room', c.room_id, 'u', c.user_id, 'n', u.username,
    'text', coalesce(c.text_content, ''), 'at', (extract(epoch from c.created_at) * 1000)::bigint) order by c.created_at desc, c.id desc), '[]'::jsonb))
  from (select * from public.chat_messages x where x.source = 'joueur' and (x.room_id = 'general' or x.room_id like 'm:%') order by x.created_at desc, x.id desc limit 80) c
  join public.users u on u.id = c.user_id
$$;

create or replace function wm.adm_chat_masquer(p_admin uuid, p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.chat_messages;
begin
  update public.chat_messages c set source = 'masque' where c.id = p_id and c.source = 'joueur' and (c.room_id = 'general' or c.room_id like 'm:%') returning * into m;
  if not found then perform wm.fail('message_inconnu'); end if;
  perform wm.adm_note(p_admin, 'message_masque', m.user_id::text, jsonb_build_object('id', m.id, 'room', m.room_id, 'text', left(coalesce(m.text_content, ''), 280)));
  perform realtime.send(jsonb_build_object('id', m.id), 'del', 'salon:' || m.room_id, false);
  return wm.adm_chat();
end $$;

-- ── Bots ──
create or replace function wm.adm_bots(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb := coalesce((select c.value from wm.config c where c.key = 'bots'), '{}'::jsonb); n numeric;
begin
  if p ? 'actif' then v := v || jsonb_build_object('actif', coalesce((p ->> 'actif')::boolean, true)); end if;
  if p ? 'intensite' then n := wm.num(p ->> 'intensite'); if n is null or n < 0 or n > 3 then perform wm.fail('montant_invalide'); end if; v := v || jsonb_build_object('intensite', n); end if;
  if p ? 'chat' then n := wm.num(p ->> 'chat'); if n is null or n < 0 or n > 3 then perform wm.fail('montant_invalide'); end if; v := v || jsonb_build_object('chat', n); end if;
  insert into wm.config (key, value, updated_at) values ('bots', v, now()) on conflict (key) do update set value = excluded.value, updated_at = now();
  perform wm.adm_note(p_admin, 'bots', null, v);
  return wm.adm_chiffres();
end $$;

create or replace function wm.adm_journal() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('journal', coalesce(jsonb_agg(jsonb_build_object('a', j.action, 'cible', j.cible, 'd', j.detail, 'par', u.username,
    'at', (extract(epoch from j.at) * 1000)::bigint) order by j.id desc), '[]'::jsonb))
  from (select * from wm.admin_journal x order by x.id desc limit 60) j left join public.users u on u.id = j.admin_id
$$;

-- ── La porte ──
create or replace function wm.admin(p_action text, p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := wm.uid(); v_res jsonb;
begin
  if p_action = 'moi' then return jsonb_build_object('admin', wm.is_admin()); end if;
  if not wm.is_admin() then perform wm.fail('interdit'); end if;
  p := coalesce(p, '{}'::jsonb);
  case p_action
    when 'chiffres' then v_res := wm.adm_chiffres();
    when 'joueurs' then v_res := wm.adm_joueurs(p ->> 'q');
    when 'joueur' then v_res := wm.adm_joueur((p ->> 'id')::uuid);
    when 'solde' then v_res := wm.adm_solde(v_admin, (p ->> 'id')::uuid, wm.num(p ->> 'delta'), p ->> 'motif');
    when 'xp' then v_res := wm.adm_xp(v_admin, (p ->> 'id')::uuid, wm.num(p ->> 'delta')::integer);
    when 'rang' then v_res := wm.adm_rang(v_admin, (p ->> 'id')::uuid, wm.num(p ->> 't')::integer, wm.num(p ->> 'd')::integer);
    when 'kyc' then v_res := wm.adm_kyc(v_admin, (p ->> 'id')::uuid, (p ->> 'ok')::boolean);
    when 'suspendre' then v_res := wm.adm_suspendre(v_admin, (p ->> 'id')::uuid, wm.num(p ->> 'jours')::integer, p ->> 'motif');
    when 'marches' then v_res := wm.adm_marches();
    when 'marche' then v_res := wm.adm_marche_enregistrer(v_admin, p);
    when 'marche_etat' then v_res := wm.adm_marche_etat(v_admin, p ->> 'id', p ->> 'etat');
    when 'resoudre' then v_res := wm.adm_marche_resoudre(v_admin, p ->> 'id', p ->> 'issue');
    when 'chat' then v_res := wm.adm_chat();
    when 'masquer' then v_res := wm.adm_chat_masquer(v_admin, wm.num(p ->> 'id')::bigint);
    when 'bots' then v_res := wm.adm_bots(v_admin, p);
    when 'journal' then v_res := wm.adm_journal();
    else perform wm.fail('action_inconnue');
  end case;
  return v_res;
end $$;
create or replace function public.api_admin(p_action text, p jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.admin(p_action, p) $$;

-- ── Ce que le site apprend des marchés : leur état, et la description de ceux créés depuis le panel ──
create or replace function wm.markets() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform wm.present();
  return (
    select jsonb_build_object(
      'now', (extract(epoch from clock_timestamp()) * 1000)::bigint,
      'm', coalesce(jsonb_object_agg(l.market_id, jsonb_strip_nulls(jsonb_build_object(
        'p', trim_scale(l.current_probability), 'd0', coalesce(l.d0, m.initial_probability, round(l.current_probability, 2)), 'vol', round(l.volume_total),
        'people', l.participants_count, 'liq', l.liquidity_depth, 'st', coalesce(m.status, 'open'),
        'hot', case when l.hot_until > now() then (extract(epoch from l.hot_until) * 1000)::bigint end,
        'ph', case when coalesce(m.status, 'open') = 'resolved' then null else coalesce(l.price_history, '[]'::jsonb) end,
        'def', case when m.creator_user_id is not null and coalesce(m.status, 'open') <> 'resolved' then jsonb_build_object(
          'q', m.question, 'short', coalesce(m.short_question, left(m.question, 40)), 'cat', m.category, 'date', m.close_date,
          'time', to_char(coalesce(m.close_time, '23:59'::time), 'HH24:MI'), 'rules', coalesce(m.resolution_rules, ''), 'heat', coalesce(m.heat_level, 1.5)) end))), '{}'::jsonb))
    from public.market_live_state l join public.markets m on m.id = l.market_id);
end $$;

select wm.droits();
