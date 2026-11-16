-- Guerres de clans, en mode Compte.
--
-- Règles du mode Démo (js/clans.js), tenues par le serveur :
--  · le chef déclare la guerre : un clan adverse de sa division est tiré au sort, la guerre dure 48 heures, le buy-in est
--    de 20 $ par participant ; les dix participants adverses et leur buy-in sont dans la cagnotte dès le départ ;
--  · chaque membre peut participer en payant son buy-in ; ses points valent sa contribution au clan divisée par dix ;
--  · à la fin, on additionne les dix meilleurs de chaque camp : le clan vainqueur se partage la cagnotte moins 4 %, à parts
--    égales entre ses participants, et chaque vrai participant gagne 50 XP ; à égalité, les buy-in sont rendus.
-- Précisions du mode Compte :
--  · le clan adverse est un clan de démonstration ; ses dix participants sont simulés : leurs points partent de 200 à
--    1 100 et montent d'au plus moitié pendant la guerre, selon une trajectoire semée par la guerre ;
--  · dans le clan du joueur, les membres simulés (bots invités) participent d'office, avec des points simulés de la même
--    façon (150 à 950 au départ) : leur buy-in entre dans la cagnotte, et leur part du gain ne va à personne ;
--  · le règlement se fait au premier passage d'un vrai membre du clan après les 48 heures ; les points des vrais
--    participants sont alors lus à ce moment-là.
-- Rien n'est supprimé.

create table if not exists wm.clan_guerres (
  id bigint generated always as identity primary key,
  clan_id text not null,
  ennemi text not null,                                  -- un clan de démonstration
  par uuid references public.users(id) on delete set null,
  buyin numeric(12,2) not null default 20,
  bots integer not null default 0,                       -- membres simulés de notre clan, participants d'office
  debut timestamptz not null default now(),
  fin timestamptz not null,
  etat text not null default 'live' check (etat in ('live', 'won', 'lost', 'draw')),
  score_nous integer, score_eux integer, cagnotte numeric(14,2),
  regle_at timestamptz
);
create unique index if not exists clan_guerres_live on wm.clan_guerres (clan_id) where etat = 'live';
create index if not exists clan_guerres_clan on wm.clan_guerres (clan_id, id desc);
create table if not exists wm.clan_guerre_joueurs (
  guerre_id bigint not null references wm.clan_guerres(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  paye numeric(12,2) not null,
  points integer,                                        -- figés au règlement
  gain numeric(14,2),
  at timestamptz not null default now(),
  primary key (guerre_id, user_id)
);
alter table wm.clan_guerres enable row level security;
alter table wm.clan_guerre_joueurs enable row level security;
revoke all on wm.clan_guerres, wm.clan_guerre_joueurs from public, anon, authenticated;

-- Points d'un participant simulé : un départ semé (p_min à p_max), puis une montée d'au plus moitié sur la durée de la guerre.
create or replace function wm.guerre_points(p_guerre bigint, p_camp text, p_i integer, p_min integer, p_max integer, p_part float8) returns integer
language sql immutable set search_path = '' as $$
  select (b.base + floor(b.base * 0.5 * greatest(0, least(1, p_part)) * b.elan))::integer
  from (select p_min + (abs(hashtext(p_guerre::text || p_camp || p_i::text)::bigint) % (p_max - p_min + 1))::integer as base,
               (abs(hashtext(p_guerre::text || p_camp || p_i::text || 'e')::bigint) % 1001) / 1000.0 as elan) b
$$;

-- Une guerre vue par un membre : les deux camps, leurs points à cet instant, la cagnotte.
create or replace function wm.guerre_json(g wm.clan_guerres) returns jsonb
language sql stable security definer set search_path = '' as $$
  with t as (select greatest(0, least(1, extract(epoch from least(now(), g.fin) - g.debut) / nullif(extract(epoch from g.fin - g.debut), 0)))::float8 as part),
  eux as (select i, wm.guerre_points(g.id, 'e', i, 200, 1100, t.part) as pts from generate_series(1, 10) i, t),
  nos_bots as (select row_number() over (order by m.depuis, m.id)::integer as i, m.user_id as u from wm.clan_membres m join public.users u on u.id = m.user_id and u.is_demo
               where m.clan_id = g.clan_id and m.parti_at is null and m.depuis <= g.debut order by m.depuis, m.id limit g.bots),
  nous as (select b.u, wm.guerre_points(g.id, 'n', b.i, 150, 950, t.part) as pts from nos_bots b, t
           union all
           select j.user_id, coalesce(j.points, round(coalesce((select m.xp from wm.clan_membres m where m.user_id = j.user_id and m.clan_id = g.clan_id and m.parti_at is null), 0) / 10)::integer)
           from wm.clan_guerre_joueurs j where j.guerre_id = g.id)
  select jsonb_build_object('id', g.id, 'foe', g.ennemi, 'at', (extract(epoch from g.debut) * 1000)::bigint, 'endAt', (extract(epoch from g.fin) * 1000)::bigint,
    'status', g.etat, 'buyin', g.buyin,
    'pot', coalesce(g.cagnotte, g.buyin * (10 + g.bots + (select count(*) from wm.clan_guerre_joueurs j where j.guerre_id = g.id))),
    'mine', coalesce((select jsonb_agg(jsonb_build_object('u', n.u, 'pts', n.pts) order by n.pts desc) from nous n), '[]'::jsonb),
    'theirs', coalesce((select jsonb_agg(jsonb_build_object('i', e.i, 'pts', e.pts) order by e.pts desc) from eux e), '[]'::jsonb),
    'a', g.score_nous, 'b', g.score_eux)
$$;

-- Au passage d'un membre : la guerre de son clan arrivée à son terme est réglée (une seule fois, pour tous ses participants).
create or replace function wm.clan_guerres_avancer(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare g wm.clan_guerres; v jsonb; v_a integer; v_b integer; v_n integer; v_pot numeric; v_part numeric; j record; v_solde numeric; v_etat text;
begin
  select x.* into g from wm.clan_guerres x join wm.clan_membres m on m.clan_id = x.clan_id and m.user_id = p_user and m.parti_at is null
  where x.etat = 'live' and x.fin <= now() for update of x skip locked;
  if not found then return 0; end if;
  v := wm.guerre_json(g);
  select coalesce(sum(p), 0) into v_a from (select (e ->> 'pts')::integer as p from jsonb_array_elements(v -> 'mine') e order by 1 desc limit 10) s;
  select coalesce(sum(p), 0) into v_b from (select (e ->> 'pts')::integer as p from jsonb_array_elements(v -> 'theirs') e order by 1 desc limit 10) s;
  v_n := g.bots + (select count(*) from wm.clan_guerre_joueurs x where x.guerre_id = g.id);
  v_pot := g.buyin * (10 + v_n);
  v_etat := case when v_a > v_b then 'won' when v_a < v_b then 'lost' else 'draw' end;
  v_part := case when v_etat = 'won' and v_n > 0 then round(v_pot * 0.96 / v_n, 2) else 0 end;
  update wm.clan_guerres set etat = v_etat, score_nous = v_a, score_eux = v_b, cagnotte = v_pot, regle_at = now() where id = g.id;
  for j in select x.user_id, x.paye, (select (e ->> 'pts')::integer from jsonb_array_elements(v -> 'mine') e where e ->> 'u' = x.user_id::text limit 1) as pts
           from wm.clan_guerre_joueurs x where x.guerre_id = g.id order by x.user_id loop
    update wm.clan_guerre_joueurs set points = j.pts, gain = case v_etat when 'won' then v_part when 'draw' then j.paye else 0 end where guerre_id = g.id and user_id = j.user_id;
    if v_etat = 'won' then
      update public.user_stats set balance = balance + v_part, profit_realized = coalesce(profit_realized, 0) + v_part - j.paye where user_id = j.user_id returning balance into v_solde;
      insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (j.user_id, v_part, v_solde, 'guerre_gain', g.id::text);
      perform wm.xp_add(j.user_id, 50, 'guerre');
      perform wm.rank_refresh(j.user_id); perform wm.badges_check(j.user_id);
    elsif v_etat = 'draw' then
      update public.user_stats set balance = balance + j.paye where user_id = j.user_id returning balance into v_solde;
      insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (j.user_id, j.paye, v_solde, 'guerre_rendu', g.id::text);
    else
      update public.user_stats set profit_realized = coalesce(profit_realized, 0) - j.paye where user_id = j.user_id;
    end if;
    if j.user_id = p_user then
      perform wm.notify(j.user_id, 'shield', 'guerre_' || v_etat, jsonb_build_object('id', g.clan_id, 'foe', g.ennemi, 'gain', v_part - j.paye, 'pot', v_pot, 'a', v_a, 'b', v_b), '#clan-' || g.clan_id);
    else
      perform wm.notify_direct(j.user_id, 'shield', 'guerre_' || v_etat, jsonb_build_object('id', g.clan_id, 'foe', g.ennemi, 'gain', v_part - j.paye, 'pot', v_pot, 'a', v_a, 'b', v_b), '#clan-' || g.clan_id);
    end if;
  end loop;
  return 1;
end $$;

-- ── Déclarer la guerre (le chef) ──
create or replace function wm.clan_war() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); moi record; g wm.clan_guerres; v_ennemi text; v_bots integer; m public.chat_messages;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  select * into moi from wm.clan_moi(v_uid);
  if moi.role <> 'chef' or not moi.joueurs then perform wm.fail('role_insuffisant'); end if;
  perform 1 from wm.clans_joueurs j where j.id = moi.clan for update;
  perform wm.clan_guerres_avancer(v_uid);
  if exists (select 1 from wm.clan_guerres x where x.clan_id = moi.clan and x.etat = 'live') then perform wm.fail('guerre_en_cours'); end if;
  select d.id into v_ennemi from wm.clans_demo d where d.division = 'bronze' order by random() limit 1;   -- un clan de sa division (un clan de joueurs débute en bronze)
  if v_ennemi is null then perform wm.fail('clan_inconnu'); end if;
  select count(*)::integer into v_bots from wm.clan_membres x join public.users u on u.id = x.user_id and u.is_demo where x.clan_id = moi.clan and x.parti_at is null;
  insert into wm.clan_guerres (clan_id, ennemi, par, bots, fin) values (moi.clan, v_ennemi, v_uid, least(v_bots, 7), now() + interval '48 hours') returning * into g;
  perform wm.clan_fil_poser(moi.clan, v_uid, 'guerre', jsonb_build_object('foe', v_ennemi, 'k', g.buyin));
  perform wm.chat_salon_creer('clan:' || moi.clan);
  insert into public.chat_messages (room_id, user_id, message_type, text_content, bet_ref, source)
  values ('clan:' || moi.clan, v_uid, 'evt', '', jsonb_build_object('code', 'guerre', 'foe', v_ennemi, 'k', g.buyin), 'joueur') returning * into m;
  perform wm.chat_diffuser(m.room_id, 'msg', wm.chat_json(m) || jsonb_build_object('f', wm.fiche(v_uid)));
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid)));
end $$;

-- ── Participer à la guerre de son clan : le buy-in entre dans la cagnotte ──
create or replace function wm.clan_war_join() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); moi record; g wm.clan_guerres; s public.user_stats; v_solde numeric;
begin
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select * into moi from wm.clan_moi(v_uid);
  select * into g from wm.clan_guerres x where x.clan_id = moi.clan and x.etat = 'live' and x.fin > now() for update;
  if not found then perform wm.fail('guerre_absente'); end if;
  if exists (select 1 from wm.clan_guerre_joueurs j where j.guerre_id = g.id and j.user_id = v_uid) then perform wm.fail('guerre_deja'); end if;
  perform wm.rg_garde(v_uid);
  if s.balance < g.buyin then perform wm.fail('solde_insuffisant'); end if;
  v_solde := s.balance - g.buyin;
  update public.user_stats set balance = v_solde where user_id = v_uid;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -g.buyin, v_solde, 'guerre', g.id::text);
  insert into wm.clan_guerre_joueurs (guerre_id, user_id, paye) values (g.id, v_uid, g.buyin);
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid)));
end $$;

create or replace function public.api_clan_war() returns jsonb language sql security invoker set search_path = '' as $$ select wm.clan_war() $$;
create or replace function public.api_clan_war_join() returns jsonb language sql security invoker set search_path = '' as $$ select wm.clan_war_join() $$;

insert into wm.etat_blocs (cle, fonction, ordre, avant) values ('clan_guerres', 'wm.clan_guerres_avancer', 43, true)
on conflict (cle) do update set fonction = excluded.fonction, ordre = excluded.ordre, avant = excluded.avant;

-- ── Ce que le joueur voit : son clan, avec sa guerre en cours et ses guerres passées ──
create or replace function wm.clan_etat(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with mien as (select m.* from wm.clan_membres m where m.user_id = p_user and m.parti_at is null),
  fil as (select f.* from wm.clan_fil f, mien where f.clan_id = mien.clan_id order by f.id desc limit 30),
  appels as (select a.* from wm.clan_appels a, mien where a.clan_id = mien.clan_id order by a.id desc limit 6),
  passees as (select g.* from wm.clan_guerres g, mien where g.clan_id = mien.clan_id and g.etat <> 'live' order by g.id desc limit 10)
  select jsonb_build_object(
    'mine', (select jsonb_build_object('id', m.clan_id, 'role', m.role, 'since', (extract(epoch from m.depuis) * 1000)::bigint, 'xp', m.xp,
               'jour', case when m.jour = current_date then m.vol_jour else 0 end, 'ecartes', m.ecartes) from mien m),
    'leftAt', (select (extract(epoch from max(m.parti_at)) * 1000)::bigint from wm.clan_membres m where m.user_id = p_user and m.parti_at is not null),
    'apps', coalesce((select jsonb_object_agg(c.clan_id, (extract(epoch from c.at) * 1000)::bigint) from wm.clan_candidatures c where c.user_id = p_user and c.etat = 'attente'), '{}'::jsonb),
    'clans', coalesce((select jsonb_agg(wm.clan_joueur_json(j, p_user) order by j.cree_at) from (select * from wm.clans_joueurs x order by x.cree_at desc limit 200) j), '[]'::jsonb),
    'feed', coalesce((select jsonb_agg(jsonb_build_object('u', f.user_id, 'code', f.code, 'p', f.params, 'at', (extract(epoch from f.at) * 1000)::bigint) order by f.id desc) from fil f), '[]'::jsonb),
    'calls', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'm', a.market_id, 's', a.side, 'by', a.par, 'at', (extract(epoch from a.at) * 1000)::bigint, 'n', coalesce(a.suivis, 0)) order by a.id desc) from appels a), '[]'::jsonb),
    'war', (select wm.guerre_json(g) from wm.clan_guerres g, mien where g.clan_id = mien.clan_id and g.etat = 'live' limit 1),
    'wars', coalesce((select jsonb_agg(jsonb_build_object('foe', g.ennemi, 'at', (extract(epoch from g.regle_at) * 1000)::bigint, 'status', g.etat, 'a', g.score_nous, 'b', g.score_eux, 'pot', g.cagnotte) order by g.id desc) from passees g), '[]'::jsonb),
    'users', coalesce((select jsonb_object_agg(x.u::text, wm.fiche(x.u)) from (
                select distinct m.user_id as u from wm.clan_membres m join wm.clans_joueurs j on j.id = m.clan_id where m.parti_at is null and m.user_id <> p_user
                union select f.user_id from fil f where f.user_id is not null and f.user_id <> p_user
                union select (f.params ->> 'u')::uuid from fil f where f.params ? 'u'
                union select (f.params ->> 'par')::uuid from fil f where f.params ? 'par'
                union select a.par from appels a where a.par <> p_user
                limit 400) x where x.u is not null), '{}'::jsonb))
$$;

create or replace function wm.clan() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid();
begin
  perform wm.clan_candidatures_avancer(v_uid);
  perform wm.clan_appels_avancer(v_uid);
  perform wm.clan_guerres_avancer(v_uid);
  return wm.reponse(v_uid, jsonb_build_object('clan', wm.clan_etat(v_uid)));
end $$;

select wm.droits();
