-- Propositions de marché en mode Compte.
--
-- Règles du mode Démo, tenues par le serveur : à partir du rang Or, un joueur propose un pari (question Oui / Non,
-- catégorie, clôture, source, règles, cote de départ). La proposition part au vote : 25 votes favorables la mettent en
-- ligne, avec son propre chat. La communauté (les bots) vote au rythme de la démo, un vote favorable toutes les
-- 1,5 seconde ; les autres joueurs peuvent voter aussi. +10 XP à l'envoi, +2 XP par vote, +50 XP à la mise en ligne.
-- Les votes de la communauté ne sont pas écrits un par un : ils se déduisent du temps écoulé, sans tâche de fond. La mise
-- en ligne se fait au premier passage d'un joueur (chargement, lecture des propositions, vote).
-- Les trois propositions « à voter » de la démo existent ici comme contenu de démonstration : on peut voter, elles ne
-- passent jamais en ligne.

create table if not exists wm.propositions (
  id bigint generated always as identity primary key,
  user_id uuid references public.users(id) on delete cascade,
  code text unique,                                   -- contenu de démonstration : 'pp-psg', 'pp-jeu', 'pp-sol'
  q text not null,
  cat text not null,
  date_fin date,
  heure time,
  src text not null default '',
  regles text not null default '',
  p0 smallint not null default 50 check (p0 between 5 and 95),
  pour integer not null default 0,                    -- votes des joueurs
  contre integer not null default 0,
  base_pour integer not null default 1,               -- départ : la voix de l'auteur
  base_contre integer not null default 0,
  besoin integer not null default 25,
  etat text not null default 'vote' check (etat in ('vote', 'live')),
  market_id text,
  cree_at timestamptz not null default now(),
  fin_at timestamptz
);
create table if not exists wm.propositions_votes (
  proposition bigint not null references wm.propositions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  vote text not null check (vote in ('for', 'against')),
  at timestamptz not null default now(),
  primary key (proposition, user_id)
);
alter table wm.propositions enable row level security;
alter table wm.propositions_votes enable row level security;
revoke all on wm.propositions, wm.propositions_votes from public, anon, authenticated;
create index if not exists propositions_joueur on wm.propositions (user_id, id desc);
create index if not exists propositions_vote on wm.propositions (id) where etat = 'vote';

-- Contenu de démonstration (les mêmes trois propositions que l'écran « À voter » du mode Démo), portées par trois bots.
insert into wm.propositions (user_id, code, q, cat, base_pour, base_contre, besoin)
select (select u.id from public.users u where coalesce(u.is_demo, false) order by u.username offset x.n limit 1), x.code, x.q, x.cat, x.pour, x.contre, 50
from (values (0, 'pp-psg', 'Le PSG sera-t-il champion de France 2027 ?', 'Football', 38, 9),
             (1, 'pp-jeu', 'Un jeu vidéo dépassera-t-il 50 millions de ventes en 2027 ?', 'Culture', 21, 6),
             (2, 'pp-sol', 'Le Solana dépassera-t-il 300 $ avant juin 2027 ?', 'Crypto', 44, 12)) as x(n, code, q, cat, pour, contre)
on conflict (code) do nothing;

-- ── Texte écrit par un joueur et montré à tous : une seule ligne, apostrophes typographiques, et aucun caractère qu'un
--    navigateur pourrait lire comme du code (chevrons, guillemets droits, accent grave, barre oblique inverse, contrôle) ──
create or replace function wm.texte_propre(p text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(replace(coalesce(p, ''), '''', '’'), '\s+', ' ', 'g'))
$$;
create or replace function wm.texte_refuse(p text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p, '') ~ '[<>"`\\]' or coalesce(p, '') ~ '[[:cntrl:]]'
$$;

-- ── Outils de texte : identifiant de marché et titre court, comme slugify et shortOf de l'écran ──
create or replace function wm.slug(p text) returns text
language sql immutable set search_path = '' as $$
  select left(btrim(regexp_replace(translate(lower(coalesce(p, '')), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'), '[^a-z0-9]+', '-', 'g'), '-'), 24)
$$;
create or replace function wm.titre_court(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare s text := regexp_replace(coalesce(p, ''), '\s*\?$', ''); i integer;
begin
  if length(s) <= 34 then return s; end if;
  s := left(s, 34);
  i := length(s) - position(' ' in reverse(s));                                 -- dernier espace
  return case when i > 0 and i < length(s) then left(s, i) else s end || '…';
end $$;

-- ── Votes comptés : ceux des joueurs, plus ceux de la communauté, déduits du temps écoulé ──
create or replace function wm.prop_votes(p wm.propositions, out pour integer, out contre integer)
language plpgsql stable set search_path = '' as $$
declare v_ticks integer := greatest(0, floor(extract(epoch from clock_timestamp() - p.cree_at) / 1.5))::integer;
begin
  if p.etat = 'live' then pour := p.besoin; contre := p.base_contre + p.contre;
  elsif p.code is not null then pour := least(p.besoin - 1, p.base_pour + p.pour); contre := p.base_contre + p.contre;     -- démonstration : jamais validée
  else
    v_ticks := least(v_ticks, greatest(0, p.besoin - p.base_pour - p.pour));     -- la communauté s'arrête quand le compte y est
    pour := least(p.besoin, p.base_pour + p.pour + v_ticks);
    contre := p.base_contre + p.contre + floor(v_ticks * 0.18)::integer;
  end if;
end $$;

create or replace function wm.prop_json(p wm.propositions, p_moi uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', p.id, 'code', p.code, 'q', p.q, 'cat', p.cat, 'date', p.date_fin, 'time', to_char(p.heure, 'HH24:MI'), 'src', p.src, 'rules', p.regles,
    'p0', p.p0, 'status', p.etat, 'for', v.pour, 'against', v.contre, 'need', p.besoin, 'at', (extract(epoch from p.cree_at) * 1000)::bigint, 'mid', p.market_id,
    'by', p.user_id, 'voted', (select x.vote from wm.propositions_votes x where x.proposition = p.id and x.user_id = p_moi))
  from wm.prop_votes(p) v
$$;

-- Les propositions du joueur (20 dernières) ; celles des autres encore en vote ; les fiches de leurs auteurs.
create or replace function wm.props_etat(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with mine as (select * from wm.propositions p where p.user_id = p_user and p.code is null order by p.id desc limit 20),
       vote as (select * from wm.propositions p where p.etat = 'vote' and p.user_id is distinct from p_user order by (p.code is null) desc, p.id desc limit 30)
  select jsonb_build_object(
    'mine', coalesce((select jsonb_agg(wm.prop_json(m, p_user) order by m.id desc) from mine m), '[]'::jsonb),
    'vote', coalesce((select jsonb_agg(wm.prop_json(v, p_user) order by (v.code is null) desc, v.id desc) from vote v), '[]'::jsonb),
    'users', coalesce((select jsonb_object_agg(x.id::text, wm.fiche(x.id)) from (select distinct v.user_id as id from vote v where v.user_id is not null) x), '{}'::jsonb))
$$;

-- ── Mise en ligne d'une proposition validée : le marché, son carnet, son chat ──
create or replace function wm.prop_promouvoir(p_id bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare p wm.propositions; v record; v_id text; v_court text;
begin
  select * into p from wm.propositions x where x.id = p_id and x.etat = 'vote' and x.code is null for update skip locked;
  if not found then return null; end if;
  select * into v from wm.prop_votes(p);
  if v.pour < p.besoin then return null; end if;
  v_id := 'perso-' || coalesce(nullif(wm.slug(p.q), ''), 'pari') || '-' || p.id;
  v_court := wm.titre_court(p.q);
  insert into public.markets (id, category, question, short_question, creator_user_id, current_probability, initial_probability, anchor_probability,
                              heat_level, close_date, close_time, resolution_source, resolution_rules, status)
  values (v_id, p.cat, p.q, v_court, p.user_id, p.p0, p.p0, p.p0, 1.6, p.date_fin, p.heure, p.src, p.regles || ' Source : ' || p.src || '.', 'open');
  insert into public.market_live_state (market_id, current_probability, anchor_probability, volume_total, participants_count, liquidity_depth, d0)
  values (v_id, p.p0, p.p0, 250, 12, 400, p.p0);
  insert into public.chat_rooms (id, name, kind, market_id) values ('m:' || v_id, '#' || v_id, 'market', v_id) on conflict (id) do nothing;
  update wm.propositions set etat = 'live', market_id = v_id, base_contre = v.contre - contre, fin_at = now() where id = p.id;
  perform wm.xp_add(p.user_id, 50, 'proposition');
  perform wm.notify(p.user_id, 'check', 'prop_live', jsonb_build_object('id', p.id, 'q', v_court, 'm', v_id), '#marche-' || v_id);
  perform realtime.send(jsonb_build_object('id', v_id, 'st', 'open'), 'etat', 'marches', false);
  return v_id;
end $$;

-- Met en ligne tout ce qui a atteint ses votes. Appelée au passage d'un joueur ; n'attend jamais une proposition occupée.
create or replace function wm.props_avancer() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in select x.id from wm.propositions x where x.etat = 'vote' and x.code is null
             and x.base_pour + x.pour + floor(extract(epoch from clock_timestamp() - x.cree_at) / 1.5) >= x.besoin order by x.id loop
    if wm.prop_promouvoir(r.id) is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;
create or replace function wm.props_avant(p_user uuid) returns integer
language sql security definer set search_path = '' as $$ select wm.props_avancer() $$;

-- ── Proposer : p = { q, cat, date, time, src, rules, p0 } ──
create or replace function wm.proposal_create(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid(); v_q text := wm.texte_propre(p ->> 'q'); v_cat text := btrim(coalesce(p ->> 'cat', ''));
  v_src text := wm.texte_propre(p ->> 'src'); v_regles text := wm.texte_propre(p ->> 'rules');
  v_date date := wm.jour(p ->> 'date'); v_heure time; v_p0 numeric := wm.num(p ->> 'p0'); v_tier integer;
  s public.user_stats; x wm.propositions;
begin
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select r.t into v_tier from wm.rank_of(s.xp, s.bets_settled, s.bets_won, s.deposits_count, s.flash_wins, s.followed_bets_count, s.seasonal_position) r;
  if coalesce(v_tier, 0) < 3 then perform wm.fail('rang_insuffisant'); end if;                 -- rang Or
  if wm.texte_refuse(v_q) or wm.texte_refuse(v_src) or wm.texte_refuse(v_regles) then perform wm.fail('texte_refuse'); end if;
  if length(v_q) < 15 or length(v_q) > 120 or v_q !~ '\?$' then perform wm.fail('question_invalide'); end if;
  if v_cat not in ('Crypto', 'Football', 'Politique', 'Tech et IA', 'Économie', 'Culture', 'Météo', 'Sport') then perform wm.fail('categorie_invalide'); end if;
  begin v_heure := coalesce(nullif(btrim(coalesce(p ->> 'time', '')), ''), '21:00')::time; exception when others then perform wm.fail('date_invalide'); end;
  if v_date is null or v_date < current_date or v_date > current_date + 730 then perform wm.fail('date_invalide'); end if;
  if length(v_src) < 3 or length(v_src) > 120 then perform wm.fail('source_invalide'); end if;
  if length(v_regles) < 30 or length(v_regles) > 600 then perform wm.fail('regles_invalides'); end if;
  if v_p0 is null or v_p0 <> trunc(v_p0) or v_p0 < 5 or v_p0 > 95 then perform wm.fail('montant_invalide'); end if;
  if exists (select 1 from wm.propositions y where y.user_id = v_uid and y.etat = 'vote' and lower(y.q) = lower(v_q)) then perform wm.fail('proposition_en_double'); end if;
  if (select count(*) from wm.propositions y where y.user_id = v_uid and y.cree_at > now() - interval '24 hours') >= 5 then perform wm.fail('trop_de_propositions'); end if;   -- borne technique

  insert into wm.propositions (user_id, q, cat, date_fin, heure, src, regles, p0) values (v_uid, v_q, v_cat, v_date, v_heure, v_src, v_regles, v_p0) returning * into x;
  perform wm.xp_add(v_uid, 10, 'proposition');
  perform wm.notify(v_uid, 'plus', 'prop_vote', jsonb_build_object('id', x.id, 'q', wm.titre_court(v_q)), '#creer');
  return wm.reponse(v_uid, jsonb_build_object('prop', wm.prop_json(x, v_uid), 'props', wm.props_etat(v_uid)));
end $$;

-- ── Voter pour ou contre la proposition d'un autre joueur : une fois, +2 XP ──
create or replace function wm.proposal_vote(p_id bigint, p_vote text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); x wm.propositions;
begin
  if p_vote is null or p_vote not in ('for', 'against') then perform wm.fail('vote_invalide'); end if;
  perform 1 from public.user_stats where user_id = v_uid for update;
  select * into x from wm.propositions y where y.id = p_id and y.etat = 'vote' for update;
  if not found or x.user_id = v_uid then perform wm.fail('proposition_indisponible'); end if;
  insert into wm.propositions_votes (proposition, user_id, vote) values (p_id, v_uid, p_vote) on conflict do nothing;
  if not found then perform wm.fail('deja_vote'); end if;
  update wm.propositions set pour = pour + case when p_vote = 'for' then 1 else 0 end, contre = contre + case when p_vote = 'against' then 1 else 0 end where id = p_id;
  perform wm.xp_add(v_uid, 2, 'vote');
  perform wm.props_avancer();
  return wm.reponse(v_uid, jsonb_build_object('props', wm.props_etat(v_uid)));
end $$;

-- ── Lire ses propositions (l'écran suit ainsi le vote, et met en ligne ce qui est validé) ──
create or replace function wm.proposals() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid();
begin
  perform wm.props_avancer();
  return wm.reponse(v_uid, jsonb_build_object('props', wm.props_etat(v_uid)));
end $$;

create or replace function public.api_proposal_create(p jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select wm.proposal_create(p) $$;
create or replace function public.api_proposal_vote(p_id bigint, p_vote text) returns jsonb language sql security invoker set search_path = '' as $$ select wm.proposal_vote(p_id, p_vote) $$;
create or replace function public.api_proposals() returns jsonb language sql security invoker set search_path = '' as $$ select wm.proposals() $$;

-- ── Le lot enregistre ses blocs (voir …_etat_blocs.sql) ──
insert into wm.etat_blocs (cle, fonction, ordre, avant) values ('props_avancer', 'wm.props_avant', 30, true), ('props', 'wm.props_etat', 80, false)
on conflict (cle) do update set fonction = excluded.fonction, ordre = excluded.ordre, avant = excluded.avant;

select wm.droits();
