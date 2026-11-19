-- Panneau d'administration, lot 2 (19 nov. 2026), première partie : blocages, déconnexion forcée, maintenance, et les
-- actions de l'équipe sur les joueurs, le chat, les clans et le site.
--
--   * wm.blocages : un blocage vise UN accès d'un joueur (site, chat de tous les salons ou d'un seul, paris, dépôts,
--     retraits, création de marchés, clans), pour 1 h, 24 h, 7 j, 30 j ou sans fin. On le lève, on ne l'efface pas.
--   * wm.deconnexions : une déconnexion forcée ne supprime rien (ni compte ni session) ; une session ouverte avant elle
--     est refusée par le serveur, même après un rafraîchissement du jeton.
--   * maintenance : un réglage ; le serveur refuse alors toute action d'un joueur, l'équipe passe.
--   * Les contrôles eux-mêmes (wm.garde, wm.bloque, wm.chat_regles, wm.uid_gardes) ne font rien pour un joueur non
--     concerné ; ils sont ajoutés aux fonctions existantes par la migration suivante (blocages_controles).
-- Les actions passent toutes par la porte api_equipe (rôle vérifié à chaque appel) et écrivent une entrée du journal.
-- Rien n'est supprimé.

-- ══ 1. Tables ══
create table if not exists wm.blocages (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  acces text not null check (acces in ('site', 'chat', 'paris', 'depots', 'retraits', 'creation', 'clans')),
  salon text,                                       -- chat seulement : vide = tous les salons ; « dm » = messages privés
  debut_at timestamptz not null default now(),
  fin_at timestamptz,                               -- vide : sans fin
  motif text not null,
  par uuid,
  leve_at timestamptz,                              -- rempli : levé (la ligne reste)
  leve_par uuid,
  leve_motif text
);
alter table wm.blocages enable row level security;
revoke all on wm.blocages from public, anon, authenticated;
create index if not exists idx_blocages_actifs on wm.blocages (user_id, acces) where leve_at is null;

create table if not exists wm.deconnexions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  at timestamptz not null default now(),
  par uuid,
  motif text
);
alter table wm.deconnexions enable row level security;
revoke all on wm.deconnexions from public, anon, authenticated;
create index if not exists idx_deconnexions_joueur on wm.deconnexions (user_id, at desc);

create table if not exists wm.clans_dissous (
  clan_id text primary key,                         -- un clan de joueurs (wm.clans_joueurs), qui reste en base
  at timestamptz not null default now(),
  par uuid,
  motif text
);
alter table wm.clans_dissous enable row level security;
revoke all on wm.clans_dissous from public, anon, authenticated;

-- ══ 2. Les contrôles (sans effet pour un joueur non concerné) ══
create or replace function wm.bloque(p_user uuid, p_acces text, p_salon text default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from wm.blocages b
                 where b.user_id = p_user and b.acces = p_acces and b.leve_at is null and b.debut_at <= now()
                   and (b.fin_at is null or b.fin_at > now()) and (p_acces <> 'chat' or b.salon is null or b.salon = p_salon))
$$;

-- Lève « bloque » (détail : {acces, salon, fin}, fin en millisecondes ou -1 sans fin) si un blocage actif vise cet accès.
create or replace function wm.garde(p_user uuid, p_acces text, p_salon text default null) returns void
language plpgsql stable security definer set search_path = '' as $$
declare b wm.blocages;
begin
  select * into b from wm.blocages x
  where x.user_id = p_user and x.acces = p_acces and x.leve_at is null and x.debut_at <= now()
    and (x.fin_at is null or x.fin_at > now()) and (p_acces <> 'chat' or x.salon is null or x.salon = p_salon)
  order by x.fin_at desc nulls first limit 1;
  if found then
    raise exception 'bloque' using errcode = 'P0001',
      detail = jsonb_build_object('acces', b.acces, 'salon', b.salon, 'fin', case when b.fin_at is null then -1 else wm.en_ms(b.fin_at) end)::text;
  end if;
end $$;

-- Règles des salons : fermé (« salon_ferme »), mode lent (« mode_lent », détail : secondes restantes), mots interdits
-- (« mot_interdit » ; en privé seulement si le réglage le dit). Réglages par défaut, ou membre de l'équipe : rien.
create or replace function wm.chat_regles(p_user uuid, p_salon text, p_texte text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare v_salons jsonb := wm.reglage_json('chat.salons', '{}'::jsonb); v_mots jsonb := wm.reglage_json('chat.mots_interdits', '[]'::jsonb);
  s jsonb; v_lent integer; v_der timestamptz; v_t text; m text;
begin
  if v_salons = '{}'::jsonb and v_mots = '[]'::jsonb then return; end if;
  if wm.role_equipe(p_user) is not null then return; end if;
  if coalesce(p_salon, '') <> 'dm' then
    s := v_salons -> p_salon;
    if s is not null then
      if coalesce((s ->> 'ferme')::boolean, false) then perform wm.fail('salon_ferme'); end if;
      v_lent := coalesce(wm.num(s ->> 'lent'), 0)::integer;
      if v_lent > 0 then
        select max(c.created_at) into v_der from public.chat_messages c where c.user_id = p_user and c.room_id = p_salon;
        if v_der > now() - make_interval(secs => v_lent) then
          raise exception 'mode_lent' using errcode = 'P0001',
            detail = ceil(extract(epoch from (v_der + make_interval(secs => v_lent) - now())))::text;
        end if;
      end if;
    end if;
  end if;
  if jsonb_array_length(v_mots) > 0 and coalesce(p_texte, '') <> '' and (coalesce(p_salon, '') <> 'dm' or wm.reglage_bool('chat.mots_prives', false)) then
    v_t := lower(p_texte);
    for m in select lower(x) from jsonb_array_elements_text(v_mots) x loop
      if m <> '' and position(m in v_t) > 0 then perform wm.fail('mot_interdit'); end if;
    end loop;
  end if;
end $$;

-- Ajouté à wm.uid() : déconnexion forcée (« session »), blocage du site (« suspendu », comme une suspension : l'écran sait
-- déjà l'expliquer), maintenance (« maintenance », l'équipe passe). Sans déconnexion, sans blocage, hors maintenance :
-- trois lectures par index, rien d'autre.
create or replace function wm.uid_gardes(p_user uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare v_deco timestamptz; v_sess uuid; v_iat numeric; v_cree timestamptz; b wm.blocages;
begin
  select max(d.at) into v_deco from wm.deconnexions d where d.user_id = p_user;
  if v_deco is not null then
    v_sess := wm.eq_uuid(auth.jwt() ->> 'session_id');
    v_iat := wm.num(auth.jwt() ->> 'iat');
    if v_sess is not null then                      -- le jeton d'une session : elle doit dater d'après la déconnexion forcée
      select s.created_at into v_cree from auth.sessions s where s.id = v_sess;
      if v_cree is null or v_cree < v_deco then raise exception 'session' using errcode = 'P0001'; end if;
    elsif v_iat is not null then                    -- un jeton sans session : émis après
      if to_timestamp(v_iat) < v_deco then raise exception 'session' using errcode = 'P0001'; end if;
    elsif not exists (select 1 from auth.sessions s where s.user_id = p_user and s.created_at > v_deco) then
      raise exception 'session' using errcode = 'P0001';   -- Edge Functions (wm.agir_pour) : il faut s'être reconnecté depuis
    end if;
  end if;
  select * into b from wm.blocages x
  where x.user_id = p_user and x.acces = 'site' and x.leve_at is null and x.debut_at <= now() and (x.fin_at is null or x.fin_at > now())
  order by x.fin_at desc nulls first limit 1;
  if found then
    raise exception 'suspendu' using errcode = 'P0001', detail = case when b.fin_at is null then '-1' else wm.en_ms(b.fin_at)::text end;
  end if;
  if wm.reglage_bool('site.maintenance', false) and wm.role_equipe(p_user) is null then
    raise exception 'maintenance' using errcode = 'P0001';
  end if;
end $$;

create or replace function wm.clan_dissous_garde(p_clan text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from wm.clans_dissous d where d.clan_id = p_clan) then perform wm.fail('clan_indisponible'); end if;
end $$;

-- Ce que le joueur connecté sait de ses propres blocages (l'écran peut griser un bouton ; le serveur refuse de toute façon).
create or replace function wm.mes_blocages() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('blocages', coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'acces', b.acces, 'salon', b.salon,
    'fin', case when b.fin_at is null then -1 else wm.en_ms(b.fin_at) end) order by b.id), '[]'::jsonb))
  from wm.blocages b
  where b.user_id = wm.uid() and b.leve_at is null and b.debut_at <= now() and (b.fin_at is null or b.fin_at > now())
$$;
create or replace function public.api_mes_blocages() returns jsonb
language sql security invoker set search_path = '' as $$ select wm.mes_blocages() $$;

-- ══ 3. Aides des actions ══
create or replace function wm.blocage_vue(b wm.blocages) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', b.id, 'actif', b.leve_at is null and b.debut_at <= now() and (b.fin_at is null or b.fin_at > now()),
    'acces', b.acces, 'salon', b.salon, 'fin', case when b.fin_at is null then -1 else wm.en_ms(b.fin_at) end)
$$;

-- La cible d'une action sur un joueur : il existe ; personne n'agit sur son propre compte ; un modérateur n'agit pas sur un
-- membre de l'équipe ; personne ne bloque ni ne déconnecte un administrateur (p_sensible).
create or replace function wm.eq_cible(p_admin uuid, p_user uuid, p_sensible boolean) returns void
language plpgsql stable security definer set search_path = '' as $$
declare v_cible text;
begin
  if p_user is null or not exists (select 1 from public.users u where u.id = p_user) then perform wm.fail('joueur_inconnu'); end if;
  if p_user = p_admin then perform wm.fail('interdit'); end if;
  v_cible := wm.role_equipe(p_user);
  if v_cible is not null and wm.role_equipe(p_admin) is distinct from 'administrateur' then perform wm.fail('interdit'); end if;
  if p_sensible and v_cible = 'administrateur' then perform wm.fail('interdit'); end if;
end $$;

create or replace function wm.eq_joueur_vue(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', u.id, 'n', u.username, 'email', coalesce(a.email, ''), 'bot', coalesce(u.is_demo, false), 'test', coalesce(u.is_test, false),
    'since', wm.en_ms(u.created_at), 'vu', wm.en_ms(a.last_sign_in_at), 'balance', s.balance, 'xp', s.xp,
    't', coalesce(s.rank_tier, 0), 'd', coalesce(s.rank_division, 0), 'settled', coalesce(s.bets_settled, 0), 'wins', coalesce(s.bets_won, 0),
    'deposits', coalesce(s.deposits_count, 0), 'kyc', coalesce(u.kyc_verified, false), 'kyc_at', wm.en_ms(u.kyc_at), 'role', wm.role_equipe(u.id),
    'susp', case when r.susp_until > now() then case when r.susp_until = 'infinity' then -1 else wm.en_ms(r.susp_until) end end,
    'excl', case when r.excl_until > now() then case when r.excl_until = 'infinity' then -1 else wm.en_ms(r.excl_until) end end,
    'blocages', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'acces', b.acces, 'salon', b.salon,
                            'fin', case when b.fin_at is null then -1 else wm.en_ms(b.fin_at) end) order by b.id)
                          from wm.blocages b where b.user_id = u.id and b.leve_at is null and b.debut_at <= now() and (b.fin_at is null or b.fin_at > now())), '[]'::jsonb),
    'deconnecte_at', (select wm.en_ms(max(d.at)) from wm.deconnexions d where d.user_id = u.id))
  from public.users u
  left join public.user_stats s on s.user_id = u.id
  left join auth.users a on a.id = u.id
  left join wm.rg r on r.user_id = u.id
  where u.id = p_user
$$;

-- Dire au joueur connecté de relire son état (solde, rang, KYC changés par l'équipe).
create or replace function wm.joueur_signal(p_user uuid, p_event text, p_payload jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = '' as $$
  select realtime.send(coalesce(p_payload, '{}'::jsonb), p_event, 'joueur:' || p_user::text, true)
$$;

-- ══ 4. Actions : joueurs ══
create or replace function wm.eq_joueurs_chercher(p_admin uuid, p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  with q as (select lower(btrim(coalesce(p ->> 'q', ''))) as t, wm.eq_uuid(btrim(coalesce(p ->> 'q', ''))) as id)
  select jsonb_build_object('joueurs', coalesce(jsonb_agg(wm.eq_joueur_vue(x.id) order by x.bot, x.cree desc), '[]'::jsonb))
  from (select u.id, coalesce(u.is_demo, false) as bot, u.created_at as cree
        from public.users u left join auth.users a on a.id = u.id, q
        where (q.id is not null and u.id = q.id)
           or (q.id is null and q.t = '' and not coalesce(u.is_demo, false))
           or (q.id is null and q.t <> '' and (position(q.t in lower(u.username)) > 0 or position(q.t in lower(coalesce(a.email, ''))) > 0))
        order by coalesce(u.is_demo, false), u.created_at desc limit 30) x
$$;

create or replace function wm.eq_joueur_fiche(p_admin uuid, p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := wm.eq_uuid(p ->> 'id'); v jsonb;
begin
  v := wm.eq_joueur_vue(v_user);
  if v is null then perform wm.fail('joueur_inconnu'); end if;
  return jsonb_build_object('j', v,
    'blocages', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'acces', b.acces, 'salon', b.salon, 'debut', wm.en_ms(b.debut_at),
        'fin', case when b.fin_at is null then -1 else wm.en_ms(b.fin_at) end, 'motif', b.motif,
        'par', (select u.username from public.users u where u.id = b.par), 'leve_at', wm.en_ms(b.leve_at),
        'leve_par', (select u.username from public.users u where u.id = b.leve_par), 'leve_motif', b.leve_motif,
        'actif', b.leve_at is null and b.debut_at <= now() and (b.fin_at is null or b.fin_at > now())) order by b.id desc)
      from wm.blocages b where b.user_id = v_user), '[]'::jsonb),
    'deconnexions', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'at', wm.en_ms(d.at), 'motif', d.motif,
        'par', (select u.username from public.users u where u.id = d.par)) order by d.id desc)
      from wm.deconnexions d where d.user_id = v_user), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('cree', wm.en_ms(s.created_at), 'maj', wm.en_ms(coalesce(s.refreshed_at::timestamptz, s.updated_at)),
        'appareil', left(coalesce(s.user_agent, ''), 120)) order by s.created_at desc)
      from (select * from auth.sessions x where x.user_id = v_user order by x.created_at desc limit 10) s), '[]'::jsonb),
    'journal', coalesce((select jsonb_agg(wm.journal_vue(j) order by j.id desc)
      from (select * from wm.journal x where x.cible_type = 'joueur' and x.cible = v_user::text order by x.id desc limit 20) j), '[]'::jsonb));
end $$;

-- Tout ce qu'a fait un joueur, le plus récent d'abord : connexions, argent (paris, gains, dépôts, retraits, ajustements),
-- messages (jamais les messages privés), rangs, KYC, décisions de l'équipe. Pages par date (« avant »).
create or replace function wm.eq_joueur_activite(p_admin uuid, p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := wm.eq_uuid(p ->> 'id'); v_n integer := least(greatest(coalesce(wm.num(p ->> 'n')::integer, 50), 1), 200);
  v_avant timestamptz := coalesce(wm.eq_date(p ->> 'avant'), 'infinity'::timestamptz);
  v_types text[] := case when jsonb_typeof(p -> 'types') = 'array' then array(select jsonb_array_elements_text(p -> 'types')) end;
  v jsonb; v_min timestamptz; v_nb integer;
begin
  if v_user is null or not exists (select 1 from public.users u where u.id = v_user) then perform wm.fail('joueur_inconnu'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('t', e.t, 'at', wm.en_ms(e.at), 'd', e.d) order by e.at desc), '[]'::jsonb), min(e.at), count(*)
  into v, v_min, v_nb
  from (
    select x.* from (
      select 'connexion'::text as t, s.created_at as at, jsonb_build_object('appareil', left(coalesce(s.user_agent, ''), 120)) as d
      from auth.sessions s where s.user_id = v_user
      union all
      select 'derniere_connexion', a.last_sign_in_at, '{}'::jsonb from auth.users a where a.id = v_user and a.last_sign_in_at is not null
      union all
      select 'argent', b.created_at, jsonb_build_object('k', b.kind, 'montant', b.amount, 'solde', b.balance_after, 'ref', b.ref_id)
      from public.balance_ledger b where b.user_id = v_user
      union all
      select 'depot', d.created_at, jsonb_build_object('monnaie', d.coin, 'reseau', d.network, 'montant', d.coin_amount, 'usd', d.usd_equivalent,
        'etat', d.status, 'moyen', d.method, 'frais', d.fee, 'etiquette', d.label)
      from public.deposits d where d.user_id = v_user
      union all
      select 'retrait', w.requested_at, jsonb_build_object('reseau', w.network, 'usd', w.amount_usd, 'etat', w.status, 'moyen', w.method, 'frais', w.fee)
      from public.withdrawals w where w.user_id = v_user
      union all
      select 'message', c.created_at, jsonb_build_object('id', c.id, 'salon', c.room_id, 'k', coalesce(c.message_type, 'msg'),
        'texte', left(coalesce(c.text_content, ''), 280), 'source', c.source)
      from public.chat_messages c where c.user_id = v_user and c.room_id not like 'dm:%'
      union all
      select 'rang', n.created_at, n.params from public.notifications n where n.user_id = v_user and n.code = 'rank_up'
      union all
      select 'kyc', u.kyc_at, jsonb_build_object('ok', coalesce(u.kyc_verified, false)) from public.users u where u.id = v_user and u.kyc_at is not null
      union all
      select 'equipe', j.at, wm.journal_vue(j) from wm.journal j where j.cible_type = 'joueur' and j.cible = v_user::text
    ) x
    where x.at < v_avant and (v_types is null or x.t = any (v_types))
    order by x.at desc limit v_n) e;
  return jsonb_build_object('evenements', v, 'suite', case when v_nb = v_n then wm.en_ms(v_min) end);
end $$;

-- Ajuster un solde : une opération « ajustement_admin » de plus dans le relevé, le solde bouge du montant (jamais
-- remplacé par un chiffre), jamais en dessous de zéro ; un modérateur est plafonné.
create or replace function wm.eq_joueur_solde(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := wm.eq_uuid(p ->> 'id'); v_delta numeric := round(coalesce(wm.num(p ->> 'delta'), 0), 2); v_avant numeric; v_apres numeric; v_op bigint;
begin
  perform wm.eq_cible(p_admin, v_user, false);
  if v_delta = 0 or abs(v_delta) > 10000000 then perform wm.fail('montant_invalide'); end if;
  if wm.role_equipe(p_admin) = 'moderateur' and abs(v_delta) > wm.reglage_num('equipe.moderateur_solde_max', 1000) then perform wm.fail('plafond_moderateur'); end if;
  select s.balance into v_avant from public.user_stats s where s.user_id = v_user for update;
  if not found then perform wm.fail('joueur_inconnu'); end if;
  v_apres := v_avant + v_delta;
  if v_apres < 0 then perform wm.fail('solde_negatif'); end if;
  update public.user_stats set balance = balance + v_delta where user_id = v_user;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id)
  values (v_user, v_delta, v_apres, 'ajustement_admin', left(btrim(coalesce(p ->> 'motif', '')), 120)) returning id into v_op;
  perform wm.notify(v_user, 'wallet', 'admin_solde', jsonb_build_object('delta', v_delta), '#profil');
  perform wm.joueur_signal(v_user, 'etat');
  perform wm.journal_noter(p_admin, 'joueur_solde', 'joueur', v_user::text, jsonb_build_object('solde', v_avant),
    jsonb_build_object('solde', v_apres, 'delta', v_delta, 'operation', v_op), p ->> 'motif',
    jsonb_build_object('action', 'joueur_solde', 'p', jsonb_build_object('id', v_user, 'delta', -v_delta)));
  return wm.eq_joueur_fiche(p_admin, jsonb_build_object('id', v_user));
end $$;

-- Donner un rang : même calcul que l'ancien panneau (compteurs relevés au niveau du rang, jamais baissés) ; non annulable.
create or replace function wm.eq_joueur_rang(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := wm.eq_uuid(p ->> 'id'); s public.user_stats; v_apres jsonb;
begin
  perform wm.eq_cible(p_admin, v_user, false);
  select * into s from public.user_stats x where x.user_id = v_user;
  perform wm.adm_rang(p_admin, v_user, wm.num(p ->> 't')::integer, wm.num(p ->> 'd')::integer);
  select jsonb_build_object('t', x.rank_tier, 'd', x.rank_division, 'xp', x.xp, 'regles', x.bets_settled, 'gagnes', x.bets_won) into v_apres
  from public.user_stats x where x.user_id = v_user;
  perform wm.joueur_signal(v_user, 'etat');
  perform wm.journal_noter(p_admin, 'joueur_rang', 'joueur', v_user::text,
    jsonb_build_object('t', s.rank_tier, 'd', s.rank_division, 'xp', s.xp, 'regles', s.bets_settled, 'gagnes', s.bets_won), v_apres, p ->> 'motif', null);
  return wm.eq_joueur_fiche(p_admin, jsonb_build_object('id', v_user));
end $$;

create or replace function wm.eq_joueur_kyc(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := wm.eq_uuid(p ->> 'id'); v_ok boolean := case p ->> 'ok' when 'true' then true when 'false' then false end; v_avant boolean;
begin
  perform wm.eq_cible(p_admin, v_user, false);
  if v_ok is null then perform wm.fail('requete'); end if;
  select coalesce(u.kyc_verified, false) into v_avant from public.users u where u.id = v_user for update;
  if v_avant = v_ok then perform wm.fail('kyc_inchange'); end if;
  update public.users set kyc_verified = v_ok, kyc_at = case when v_ok then now() end where id = v_user;
  if v_ok then perform wm.notify(v_user, 'shield', 'kyc_ok', '{}'::jsonb, '#depot'); end if;
  perform wm.joueur_signal(v_user, 'etat');
  perform wm.journal_noter(p_admin, 'joueur_kyc', 'joueur', v_user::text, jsonb_build_object('kyc', v_avant), jsonb_build_object('kyc', v_ok),
    p ->> 'motif', jsonb_build_object('action', 'joueur_kyc', 'p', jsonb_build_object('id', v_user, 'ok', v_avant)));
  return wm.eq_joueur_fiche(p_admin, jsonb_build_object('id', v_user));
end $$;

create or replace function wm.eq_joueur_bloquer(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := wm.eq_uuid(p ->> 'id'); v_acces text := p ->> 'acces'; v_salon text := nullif(btrim(coalesce(p ->> 'salon', '')), '');
  v_fin timestamptz; b wm.blocages;
begin
  perform wm.eq_cible(p_admin, v_user, true);
  if v_acces is null or v_acces not in ('site', 'chat', 'paris', 'depots', 'retraits', 'creation', 'clans') then perform wm.fail('acces_invalide'); end if;
  if v_salon is not null and (v_acces <> 'chat' or v_salon !~ '^(general|vip|blitz|dm|m:[a-z0-9-]{1,40}|clan:[a-z0-9]{1,20})$') then perform wm.fail('salon_invalide'); end if;
  if nullif(current_setting('wm.annule_id', true), '') is not null and p ? 'fin' then
    -- annulation d'une levée : le blocage reprend avec sa fin d'origine
    v_fin := case when wm.num(p ->> 'fin') = -1 then null else to_timestamp(wm.num(p ->> 'fin') / 1000.0) end;
    if v_fin is not null and v_fin <= now() then perform wm.fail('blocage_echu'); end if;
  else
    v_fin := case p ->> 'duree' when '1h' then now() + interval '1 hour' when '24h' then now() + interval '24 hours' when '7j' then now() + interval '7 days'
                                when '30j' then now() + interval '30 days' when 'permanent' then null else '-infinity'::timestamptz end;
    if v_fin = '-infinity'::timestamptz then perform wm.fail('duree_invalide'); end if;
  end if;
  insert into wm.blocages (user_id, acces, salon, fin_at, motif, par) values (v_user, v_acces, v_salon, v_fin, left(btrim(coalesce(p ->> 'motif', '')), 500), p_admin)
  returning * into b;
  perform wm.journal_noter(p_admin, 'joueur_bloquer', 'joueur', v_user::text, jsonb_build_object('id', b.id, 'actif', false), wm.blocage_vue(b),
    p ->> 'motif', jsonb_build_object('action', 'joueur_debloquer', 'p', jsonb_build_object('id', b.id)));
  return wm.eq_joueur_fiche(p_admin, jsonb_build_object('id', v_user)) || jsonb_build_object('blocage', b.id);
end $$;

create or replace function wm.eq_joueur_debloquer(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b wm.blocages; v_avant jsonb;
begin
  select * into b from wm.blocages x where x.id = wm.num(p ->> 'id')::bigint for update;
  if not found then perform wm.fail('blocage_inconnu'); end if;
  if b.leve_at is not null then perform wm.fail('deja_leve'); end if;
  perform wm.eq_cible(p_admin, b.user_id, false);
  v_avant := wm.blocage_vue(b);
  update wm.blocages set leve_at = now(), leve_par = p_admin, leve_motif = left(btrim(coalesce(p ->> 'motif', '')), 500) where id = b.id returning * into b;
  perform wm.journal_noter(p_admin, 'joueur_debloquer', 'joueur', b.user_id::text, v_avant, wm.blocage_vue(b), p ->> 'motif',
    case when b.fin_at is null or b.fin_at > now() then jsonb_build_object('action', 'joueur_bloquer', 'p', jsonb_build_object('id', b.user_id,
      'acces', b.acces, 'salon', b.salon, 'fin', case when b.fin_at is null then -1 else wm.en_ms(b.fin_at) end)) end);
  return wm.eq_joueur_fiche(p_admin, jsonb_build_object('id', b.user_id)) || jsonb_build_object('blocage', b.id);
end $$;

create or replace function wm.eq_joueur_deconnecter(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := wm.eq_uuid(p ->> 'id'); d wm.deconnexions;
begin
  perform wm.eq_cible(p_admin, v_user, true);
  insert into wm.deconnexions (user_id, par, motif) values (v_user, p_admin, nullif(left(btrim(coalesce(p ->> 'motif', '')), 500), '')) returning * into d;
  perform wm.journal_noter(p_admin, 'joueur_deconnecter', 'joueur', v_user::text, null, jsonb_build_object('deconnexion', d.id, 'at', wm.en_ms(d.at)), p ->> 'motif', null);
  return wm.eq_joueur_fiche(p_admin, jsonb_build_object('id', v_user));
end $$;

-- ══ 5. Actions : chat et communauté ══
create or replace function wm.eq_chat_messages(p_admin uuid, p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('msgs', coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'room', c.room_id, 'u', c.user_id, 'n', u.username,
    'text', coalesce(c.text_content, ''), 'k', coalesce(c.message_type, 'msg'), 'bet', c.bet_ref, 'source', c.source, 'at', wm.en_ms(c.created_at))
    order by c.id desc), '[]'::jsonb))
  from (select * from public.chat_messages x
        where x.source in ('joueur', 'masque') and x.room_id not like 'dm:%'
          and (coalesce(p ->> 'salon', '') = '' or x.room_id = p ->> 'salon')
          and (wm.eq_uuid(p ->> 'joueur') is null or x.user_id = wm.eq_uuid(p ->> 'joueur'))
          and (wm.num(p ->> 'avant') is null or x.id < wm.num(p ->> 'avant'))
        order by x.id desc limit least(greatest(coalesce(wm.num(p ->> 'n')::integer, 80), 1), 200)) c
  join public.users u on u.id = c.user_id
$$;

-- Masquer un message : il quitte les écrans (événement « del »), la ligne reste ; un modérateur ne masque pas l'équipe.
create or replace function wm.eq_chat_supprimer(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.chat_messages;
begin
  select * into m from public.chat_messages c where c.id = wm.num(p ->> 'id')::bigint for update;
  if not found or m.room_id like 'dm:%' or m.source not in ('joueur', 'masque') then perform wm.fail('message_inconnu'); end if;
  if m.source = 'masque' then perform wm.fail('deja_masque'); end if;
  if wm.role_equipe(m.user_id) is not null and m.user_id <> p_admin and wm.role_equipe(p_admin) is distinct from 'administrateur' then perform wm.fail('interdit'); end if;
  update public.chat_messages set source = 'masque' where id = m.id;
  perform wm.chat_diffuser(m.room_id, 'del', jsonb_build_object('id', m.id));
  perform wm.journal_noter(p_admin, 'chat_supprimer', 'joueur', m.user_id::text, jsonb_build_object('id', m.id, 'source', 'joueur'),
    jsonb_build_object('id', m.id, 'source', 'masque', 'salon', m.room_id, 'texte', left(coalesce(m.text_content, ''), 280)), p ->> 'motif',
    jsonb_build_object('action', 'chat_restaurer', 'p', jsonb_build_object('id', m.id)));
  return jsonb_build_object('message', jsonb_build_object('id', m.id, 'room', m.room_id, 'source', 'masque'));
end $$;

create or replace function wm.eq_chat_restaurer(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.chat_messages;
begin
  select * into m from public.chat_messages c where c.id = wm.num(p ->> 'id')::bigint for update;
  if not found or m.room_id like 'dm:%' or m.source <> 'masque' then perform wm.fail('message_inconnu'); end if;
  update public.chat_messages set source = 'joueur' where id = m.id returning * into m;
  perform wm.chat_diffuser(m.room_id, 'msg', wm.chat_json(m) || jsonb_build_object('f', wm.fiche(m.user_id)));
  perform wm.journal_noter(p_admin, 'chat_restaurer', 'joueur', m.user_id::text, jsonb_build_object('id', m.id, 'source', 'masque'),
    jsonb_build_object('id', m.id, 'source', 'joueur', 'salon', m.room_id), p ->> 'motif',
    jsonb_build_object('action', 'chat_supprimer', 'p', jsonb_build_object('id', m.id)));
  return jsonb_build_object('message', jsonb_build_object('id', m.id, 'room', m.room_id, 'source', 'joueur'));
end $$;

-- Mode lent (0 à 300 secondes) et fermeture d'un salon ; un salon revenu à zéro et ouvert quitte la liste.
create or replace function wm.eq_salon_regler(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_salon text := btrim(coalesce(p ->> 'salon', '')); v_lent numeric := coalesce(wm.num(p ->> 'lent'), 0);
  v_ferme boolean := coalesce(case p ->> 'ferme' when 'true' then true when 'false' then false end, false);
  v_avant jsonb := wm.reglage_json('chat.salons', '{}'::jsonb); v_apres jsonb; v_old jsonb;
begin
  if v_salon !~ '^(general|vip|blitz|m:[a-z0-9-]{1,40}|clan:[a-z0-9]{1,20})$' then perform wm.fail('salon_invalide'); end if;
  if v_lent <> trunc(v_lent) or v_lent < 0 or v_lent > 300 then perform wm.fail('lent_invalide'); end if;
  v_old := v_avant -> v_salon;
  v_apres := case when v_lent = 0 and not v_ferme then v_avant - v_salon
                  else v_avant || jsonb_build_object(v_salon, jsonb_build_object('lent', v_lent, 'ferme', v_ferme)) end;
  if v_apres = v_avant then perform wm.fail('reglage_inchange'); end if;
  perform wm.reglage_ecrire('chat.salons', v_apres, p_admin);
  perform wm.journal_noter(p_admin, 'salon_regler', 'reglage', 'chat.salons', jsonb_build_object('valeur', v_avant), jsonb_build_object('valeur', v_apres),
    p ->> 'motif', jsonb_build_object('action', 'salon_regler', 'p', jsonb_build_object('salon', v_salon,
      'lent', coalesce(wm.num(v_old ->> 'lent'), 0), 'ferme', coalesce((v_old ->> 'ferme')::boolean, false))));
  return jsonb_build_object('salons', v_apres);
end $$;

-- Mots interdits : une liste (en minuscules, sans doublon) ; « prives » : la liste vaut aussi dans les messages privés.
create or replace function wm.eq_mots_interdits(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_mots jsonb; v_prives boolean;
  v_avant jsonb := jsonb_build_object('valeur', wm.reglage_json('chat.mots_interdits', '[]'::jsonb), 'prives', wm.reglage_bool('chat.mots_prives', false));
begin
  if jsonb_typeof(p -> 'mots') is distinct from 'array' or jsonb_array_length(p -> 'mots') > 500 then perform wm.fail('mots_invalides'); end if;
  if exists (select 1 from jsonb_array_elements(p -> 'mots') x where jsonb_typeof(x) <> 'string') then perform wm.fail('mots_invalides'); end if;
  select coalesce(jsonb_agg(distinct y.m order by y.m), '[]'::jsonb) into v_mots
  from (select lower(btrim(x)) as m from jsonb_array_elements_text(p -> 'mots') x) y where y.m <> '';
  if exists (select 1 from jsonb_array_elements_text(v_mots) m where char_length(m) < 2 or char_length(m) > 40) then perform wm.fail('mots_invalides'); end if;
  v_prives := coalesce(case p ->> 'prives' when 'true' then true when 'false' then false end, (v_avant ->> 'prives')::boolean);
  if v_mots = v_avant -> 'valeur' and v_prives = (v_avant ->> 'prives')::boolean then perform wm.fail('reglage_inchange'); end if;
  perform wm.reglage_ecrire('chat.mots_interdits', v_mots, p_admin);
  perform wm.reglage_ecrire('chat.mots_prives', to_jsonb(v_prives), p_admin);
  perform wm.journal_noter(p_admin, 'mots_interdits', 'reglage', 'chat.mots_interdits', v_avant, jsonb_build_object('valeur', v_mots, 'prives', v_prives),
    p ->> 'motif', jsonb_build_object('action', 'mots_interdits', 'p', jsonb_build_object('mots', v_avant -> 'valeur', 'prives', v_avant -> 'prives')));
  return jsonb_build_object('mots', v_mots, 'prives', v_prives);
end $$;

create or replace function wm.eq_clan_renommer(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c wm.clans_joueurs; v_nom text := wm.texte_propre(p ->> 'nom');
begin
  select * into c from wm.clans_joueurs j where j.id = p ->> 'id' for update;
  if not found then perform wm.fail('clan_inconnu'); end if;
  if exists (select 1 from wm.clans_dissous d where d.clan_id = c.id) then perform wm.fail('clan_indisponible'); end if;
  if wm.texte_refuse(v_nom) or char_length(v_nom) < 3 or char_length(v_nom) > 28 then perform wm.fail('clan_nom_invalide'); end if;
  if v_nom = c.nom then perform wm.fail('reglage_inchange'); end if;
  update wm.clans_joueurs set nom = v_nom where id = c.id;
  perform wm.journal_noter(p_admin, 'clan_renommer', 'clan', c.id, jsonb_build_object('nom', c.nom), jsonb_build_object('nom', v_nom), p ->> 'motif',
    jsonb_build_object('action', 'clan_renommer', 'p', jsonb_build_object('id', c.id, 'nom', c.nom)));
  return jsonb_build_object('clan', jsonb_build_object('id', c.id, 'nom', v_nom, 'tag', c.tag));
end $$;

-- Dissoudre un clan de joueurs : ses membres en sortent, les candidatures en attente sont annulées, son salon est fermé,
-- plus personne n'y entre ; le clan et son historique restent en base. Refusé pendant une guerre (sa mise est engagée).
create or replace function wm.eq_clan_dissoudre(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c wm.clans_joueurs; v_n integer;
begin
  select * into c from wm.clans_joueurs j where j.id = p ->> 'id' for update;
  if not found then perform wm.fail('clan_inconnu'); end if;
  if exists (select 1 from wm.clans_dissous d where d.clan_id = c.id) then perform wm.fail('deja_dissous'); end if;
  if exists (select 1 from wm.clan_guerres g where g.clan_id = c.id and g.etat = 'live') then perform wm.fail('guerre_en_cours'); end if;
  insert into wm.clans_dissous (clan_id, par, motif) values (c.id, p_admin, left(btrim(coalesce(p ->> 'motif', '')), 500));
  update wm.clan_membres set parti_at = now() where clan_id = c.id and parti_at is null;
  get diagnostics v_n = row_count;
  update wm.clan_candidatures set etat = 'annulee', fin_at = now() where clan_id = c.id and etat = 'attente';
  perform wm.reglage_ecrire('chat.salons', wm.reglage_json('chat.salons', '{}'::jsonb)
    || jsonb_build_object('clan:' || c.id, jsonb_build_object('lent', 0, 'ferme', true)), p_admin);
  perform wm.journal_noter(p_admin, 'clan_dissoudre', 'clan', c.id, jsonb_build_object('dissous', false, 'membres', v_n),
    jsonb_build_object('dissous', true, 'membres_sortis', v_n), p ->> 'motif', null);
  return jsonb_build_object('clan', jsonb_build_object('id', c.id, 'nom', c.nom, 'tag', c.tag, 'dissous', true, 'membres_sortis', v_n));
end $$;

-- ══ 6. Actions : site ══
create or replace function wm.eq_textes(p_t jsonb, p_obligatoire boolean) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare k text;
begin
  if p_t is null or jsonb_typeof(p_t) = 'null' then
    if p_obligatoire then perform wm.fail('annonce_invalide'); end if;
    return null;
  end if;
  if jsonb_typeof(p_t) <> 'object' or char_length(btrim(coalesce(p_t ->> 'fr', ''))) < 3 then perform wm.fail('annonce_invalide'); end if;
  foreach k in array array['fr', 'en', 'he'] loop
    if p_t ? k and (jsonb_typeof(p_t -> k) <> 'string' or char_length(p_t ->> k) > 280 or wm.texte_refuse(p_t ->> k)) then perform wm.fail('annonce_invalide'); end if;
  end loop;
  return jsonb_strip_nulls(jsonb_build_object('fr', btrim(p_t ->> 'fr'), 'en', nullif(btrim(coalesce(p_t ->> 'en', '')), ''), 'he', nullif(btrim(coalesce(p_t ->> 'he', '')), '')));
end $$;

create or replace function wm.eq_annonce_publier(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_t jsonb := wm.eq_textes(p -> 'textes', true); v_ton text := coalesce(nullif(p ->> 'ton', ''), 'info'); v_fin numeric := wm.num(p ->> 'fin');
  v_avant jsonb := wm.reglage_json('site.annonce', 'null'::jsonb); v_ann jsonb;
begin
  if v_ton not in ('info', 'alerte', 'succes') then perform wm.fail('annonce_invalide'); end if;
  if v_fin is not null and v_fin <= extract(epoch from now()) * 1000 then perform wm.fail('date_invalide'); end if;
  v_ann := jsonb_build_object('id', coalesce((select r.rev from wm.revisions r where r.nom = 'reglages'), 0) + 1, 't', v_t, 'ton', v_ton,
                              'fin', v_fin, 'at', wm.en_ms(now()));
  perform wm.reglage_ecrire('site.annonce', v_ann, p_admin);
  perform wm.journal_noter(p_admin, 'annonce_publier', 'reglage', 'site.annonce', jsonb_build_object('valeur', v_avant), jsonb_build_object('valeur', v_ann),
    p ->> 'motif', case when v_avant = 'null'::jsonb then jsonb_build_object('action', 'annonce_retirer', 'p', '{}'::jsonb)
                        else jsonb_build_object('action', 'annonce_publier', 'p', jsonb_build_object('textes', v_avant -> 't', 'ton', v_avant -> 'ton', 'fin', v_avant -> 'fin')) end);
  return jsonb_build_object('annonce', v_ann);
end $$;

create or replace function wm.eq_annonce_retirer(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_avant jsonb := wm.reglage_json('site.annonce', 'null'::jsonb);
begin
  if v_avant = 'null'::jsonb then perform wm.fail('annonce_absente'); end if;
  perform wm.reglage_ecrire('site.annonce', 'null'::jsonb, p_admin);
  perform wm.journal_noter(p_admin, 'annonce_retirer', 'reglage', 'site.annonce', jsonb_build_object('valeur', v_avant), jsonb_build_object('valeur', null),
    p ->> 'motif', jsonb_build_object('action', 'annonce_publier', 'p', jsonb_build_object('textes', v_avant -> 't', 'ton', v_avant -> 'ton', 'fin', v_avant -> 'fin')));
  return jsonb_build_object('annonce', null);
end $$;

create or replace function wm.eq_maintenance(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actif boolean := case p ->> 'actif' when 'true' then true when 'false' then false end; v_msg jsonb;
  v_avant jsonb := jsonb_build_object('valeur', wm.reglage_bool('site.maintenance', false), 'message', wm.reglage_json('site.maintenance_message', 'null'::jsonb));
begin
  if v_actif is null then perform wm.fail('requete'); end if;
  v_msg := case when p ? 'message' then coalesce(wm.eq_textes(p -> 'message', false), 'null'::jsonb) else v_avant -> 'message' end;
  if v_actif = (v_avant ->> 'valeur')::boolean and v_msg = v_avant -> 'message' then perform wm.fail('reglage_inchange'); end if;
  perform wm.reglage_ecrire('site.maintenance', to_jsonb(v_actif), p_admin);
  perform wm.reglage_ecrire('site.maintenance_message', v_msg, p_admin);
  perform wm.journal_noter(p_admin, 'maintenance', 'reglage', 'site.maintenance', v_avant, jsonb_build_object('valeur', v_actif, 'message', v_msg),
    p ->> 'motif', jsonb_build_object('action', 'maintenance', 'p', jsonb_build_object('actif', v_avant -> 'valeur', 'message', v_avant -> 'message')));
  return jsonb_build_object('maintenance', jsonb_build_object('actif', v_actif, 'message', v_msg));
end $$;

-- Activité simulée : la même ligne que l'ancien panneau (wm.config, clé « bots »), que wm.bots_tick lit déjà.
create or replace function wm.eq_activite_simulee(p_admin uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb := coalesce((select c.value from wm.config c where c.key = 'bots'), '{}'::jsonb); v_avant jsonb; n numeric;
begin
  v_avant := v;
  if nullif(current_setting('wm.annule_id', true), '') is not null and jsonb_typeof(p -> 'remplacer') = 'object' then
    v := p -> 'remplacer';                          -- annulation : la ligne d'avant, telle quelle
  else
    if p ? 'actif' then v := v || jsonb_build_object('actif', coalesce(case p ->> 'actif' when 'true' then true when 'false' then false end, true)); end if;
    if p ? 'intensite' then n := wm.num(p ->> 'intensite'); if n is null or n < 0 or n > 3 then perform wm.fail('montant_invalide'); end if; v := v || jsonb_build_object('intensite', n); end if;
    if p ? 'chat' then n := wm.num(p ->> 'chat'); if n is null or n < 0 or n > 3 then perform wm.fail('montant_invalide'); end if; v := v || jsonb_build_object('chat', n); end if;
    if p ? 'rappel' then n := wm.num(p ->> 'rappel'); if n is null or n < 0 or n > 0.2 then perform wm.fail('montant_invalide'); end if; v := v || jsonb_build_object('rappel', n); end if;
  end if;
  if v = v_avant then perform wm.fail('reglage_inchange'); end if;
  insert into wm.config (key, value, updated_at) values ('bots', v, now()) on conflict (key) do update set value = excluded.value, updated_at = now();
  perform wm.journal_noter(p_admin, 'activite_simulee', 'bots', 'bots', jsonb_build_object('bots', v_avant), jsonb_build_object('bots', v), p ->> 'motif',
    jsonb_build_object('action', 'activite_simulee', 'p', jsonb_build_object('remplacer', v_avant)));
  return jsonb_build_object('bots', v);
end $$;

create or replace function wm.eq_tableau(p_admin uuid, p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select wm.adm_chiffres() || jsonb_build_object(
    'equipe', (select count(*) from (select m.user_id from wm.equipe_membres m where m.retire_at is null
                                     union select a.user_id from public.admin_users a where not exists (select 1 from wm.equipe_membres m where m.user_id = a.user_id)) x),
    'blocages_actifs', (select count(*) from wm.blocages b where b.leve_at is null and b.debut_at <= now() and (b.fin_at is null or b.fin_at > now())),
    'maintenance', wm.reglage_bool('site.maintenance', false),
    'annonce', wm.reglage_json('site.annonce', 'null'::jsonb),
    'journal', jsonb_build_object('n', (select count(*) from wm.journal), 'tete', (select encode(j.empreinte, 'hex') from wm.journal j order by j.id desc limit 1)))
$$;

-- ══ 7. L'état d'une cible, pour l'annulation (même forme que la colonne « après » de son entrée) ══
create or replace function wm.eq_etat(e wm.journal) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if e.action = 'mots_interdits' then
    return jsonb_build_object('valeur', wm.reglage_json('chat.mots_interdits', '[]'::jsonb), 'prives', wm.reglage_bool('chat.mots_prives', false));
  end if;
  if e.action = 'maintenance' then
    return jsonb_build_object('valeur', wm.reglage_bool('site.maintenance', false), 'message', wm.reglage_json('site.maintenance_message', 'null'::jsonb));
  end if;
  if e.cible_type = 'reglage' then return (select jsonb_build_object('valeur', r.valeur) from wm.reglages r where r.cle = e.cible); end if;
  if e.cible_type = 'membre' then return jsonb_build_object('role', wm.role_equipe(wm.eq_uuid(e.cible))); end if;
  if e.action = 'joueur_kyc' then
    return (select jsonb_build_object('kyc', coalesce(u.kyc_verified, false)) from public.users u where u.id = wm.eq_uuid(e.cible));
  end if;
  if e.action in ('joueur_bloquer', 'joueur_debloquer') then
    return (select wm.blocage_vue(b) from wm.blocages b where b.id = wm.num(e.apres ->> 'id')::bigint);
  end if;
  if e.action in ('chat_supprimer', 'chat_restaurer') then
    return (select e.apres || jsonb_build_object('source', c.source) from public.chat_messages c where c.id = wm.num(e.apres ->> 'id')::bigint);
  end if;
  if e.action = 'clan_renommer' then return (select jsonb_build_object('nom', c.nom) from wm.clans_joueurs c where c.id = e.cible); end if;
  if e.action = 'activite_simulee' then return jsonb_build_object('bots', coalesce((select c.value from wm.config c where c.key = 'bots'), '{}'::jsonb)); end if;
  return null;                                      -- pas de contrôle d'état (solde : l'inverse est un nouvel ajustement)
end $$;

-- ══ 8. Le registre ══
insert into wm.equipe_actions (action, fonction, famille, roles, ecrit, motif, annulable, description) values
  ('tableau', 'wm.eq_tableau', 'tableau', '{administrateur}', false, false, false, 'Chiffres du site, équipe, blocages, maintenance, tête du journal.'),
  ('joueurs_chercher', 'wm.eq_joueurs_chercher', 'joueurs', '{administrateur,moderateur}', false, false, false, 'Chercher un joueur par pseudo, e-mail ou identifiant.'),
  ('joueur_fiche', 'wm.eq_joueur_fiche', 'joueurs', '{administrateur,moderateur}', false, false, false, 'Fiche d''un joueur : compte, KYC, solde, rang, blocages, sessions, décisions.'),
  ('joueur_activite', 'wm.eq_joueur_activite', 'joueurs', '{administrateur,moderateur}', false, false, false, 'Tout ce qu''a fait un joueur, le plus récent d''abord.'),
  ('joueur_solde', 'wm.eq_joueur_solde', 'joueurs', '{administrateur,moderateur}', true, true, true, 'Ajuster un solde (opération « ajustement_admin »).'),
  ('joueur_rang', 'wm.eq_joueur_rang', 'joueurs', '{administrateur,moderateur}', true, true, false, 'Donner un rang (compteurs relevés, jamais baissés).'),
  ('joueur_kyc', 'wm.eq_joueur_kyc', 'joueurs', '{administrateur,moderateur}', true, false, true, 'Valider ou refuser le KYC d''un joueur.'),
  ('joueur_bloquer', 'wm.eq_joueur_bloquer', 'joueurs', '{administrateur,moderateur}', true, true, true, 'Bloquer un accès d''un joueur pour 1 h, 24 h, 7 j, 30 j ou sans fin.'),
  ('joueur_debloquer', 'wm.eq_joueur_debloquer', 'joueurs', '{administrateur,moderateur}', true, true, true, 'Lever un blocage.'),
  ('joueur_deconnecter', 'wm.eq_joueur_deconnecter', 'joueurs', '{administrateur,moderateur}', true, false, false, 'Déconnecter un joueur de partout, sans rien effacer.'),
  ('chat_messages', 'wm.eq_chat_messages', 'chat', '{administrateur,moderateur}', false, false, false, 'Lire les messages des salons (jamais les messages privés).'),
  ('chat_supprimer', 'wm.eq_chat_supprimer', 'chat', '{administrateur,moderateur}', true, false, true, 'Masquer un message (il quitte les écrans, la ligne reste).'),
  ('chat_restaurer', 'wm.eq_chat_restaurer', 'chat', '{administrateur,moderateur}', true, false, true, 'Rendre un message masqué.'),
  ('salon_regler', 'wm.eq_salon_regler', 'chat', '{administrateur,moderateur}', true, false, true, 'Mode lent et fermeture d''un salon.'),
  ('mots_interdits', 'wm.eq_mots_interdits', 'chat', '{administrateur,moderateur}', true, false, true, 'Liste des mots interdits dans le chat.'),
  ('clan_renommer', 'wm.eq_clan_renommer', 'chat', '{administrateur,moderateur}', true, false, true, 'Renommer un clan de joueurs.'),
  ('clan_dissoudre', 'wm.eq_clan_dissoudre', 'chat', '{administrateur,moderateur}', true, true, false, 'Dissoudre un clan de joueurs (ses membres en sortent).'),
  ('annonce_publier', 'wm.eq_annonce_publier', 'site', '{administrateur}', true, false, true, 'Publier une annonce montrée à tous.'),
  ('annonce_retirer', 'wm.eq_annonce_retirer', 'site', '{administrateur}', true, false, true, 'Retirer l''annonce.'),
  ('maintenance', 'wm.eq_maintenance', 'site', '{administrateur}', true, false, true, 'Mettre le site en maintenance, ou l''en sortir.'),
  ('activite_simulee', 'wm.eq_activite_simulee', 'site', '{administrateur}', true, false, true, 'Activité simulée (bots) : marche, intensité, bavardage, rappel.')
on conflict (action) do update set fonction = excluded.fonction, famille = excluded.famille, roles = excluded.roles, ecrit = excluded.ecrit,
  motif = excluded.motif, annulable = excluded.annulable, description = excluded.description;

select wm.droits();
