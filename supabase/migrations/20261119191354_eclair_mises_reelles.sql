-- Partie D (19 nov. 2026) : les mises éclair du nouveau front, jouées sur les vrais cours et réglées sur les fixations,
-- sans allumer l'interrupteur global.
--
-- L'interrupteur eclair.cours_reels reste éteint : la base fige toutes les manches « simulées » et le site en ligne
-- (l'ancien front) joue tous les jeux en simulation, exactement comme avant. Le nouveau front joue, lui, les jeux à vraie
-- source sur les fixations, PAR CLIENT : une manche r est réelle pour lui quand la fixation r − 2 de son actif est « ok »
-- et était écrite au début de la manche r (règle du module pur js/moteur-reel.js, copie conforme dans l'Edge Function
-- « eclair »). Le résultat ne vient que des fixations (moteur v2, reglerReel) : le même pour tous.
--
-- Pour un vrai compte, une mise du nouveau front arrive avec la marque « reel: true ». L'Edge Function vérifie la règle,
-- calcule la mise avec le moteur v2, et la passe par srv_eclair_miser_reelle : la mise elle-même par srv_eclair_miser
-- (inchangée : heure, pause, blocage, solde, une mise par manche, frais), puis la marque, dans la même transaction. Au
-- règlement, les mises marquées se règlent sur les fixations ; une manche annulée (fixation absente après le délai de
-- grâce, sources communes insuffisantes) rend la mise, comme srv_eclair_rembourser le fait pour une manche réelle.
-- Une mise SANS marque (ancien front) passe et se règle exactement comme avant : aucune fonction existante n'est modifiée.
--
-- Ajouts seulement : une table (wm.eclair_mises_reelles), une aide de lecture (wm.eclair_reel_un) et trois fonctions de
-- service (clé de service seulement). Rien n'est supprimé ni réécrit.

-- ══ 0. Sauvegarde : les tables où ces fonctions écrivent (une table déjà sauvée ne l'est pas deux fois) ══
select backup_20261119.sauver_table('wm.eclair_mises');
select backup_20261119.sauver_table('wm.eclair_remboursements');

-- ══ 1. Les mises marquées « reel » (nouveau front) ══
-- Une ligne par mise : sa présence suffit (la mise elle-même reste dans wm.eclair_mises). Effacée avec la mise.
create table if not exists wm.eclair_mises_reelles (
  mise_id bigint primary key references wm.eclair_mises (id) on delete cascade,
  user_id uuid not null,
  jeu text not null,
  manche bigint not null,
  cree_at timestamptz not null default now()
);
alter table wm.eclair_mises_reelles enable row level security;
revoke all on wm.eclair_mises_reelles from public, anon, authenticated;

-- ══ 2. Le contexte d'une manche pour le nouveau front ══
-- Celui de la base (wm.eclair_contexte_un : mode figé, raison, paramètres), plus la configuration du jeu et les fixations
-- r − 2 à r + 1 de son actif (« Fc »), quel que soit le mode figé (interrupteur éteint : la manche est figée « simulée »,
-- mais ses fixations existent).
create or replace function wm.eclair_reel_un(p_jeu text, p_m bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare j wm.eclair_jeux; v_f jsonb := '{}'::jsonb; k bigint; v_fix jsonb;
begin
  select * into j from wm.eclair_jeux x where x.jeu = p_jeu;
  if found and j.actif is not null then
    for k in p_m - 2 .. p_m + 1 loop
      v_fix := wm.eclair_fixation(j.actif, k);
      if v_fix is not null then v_f := v_f || jsonb_build_object(k::text, v_fix); end if;
    end loop;
  end if;
  return wm.eclair_contexte_un(p_jeu, p_m) || jsonb_build_object('config', j.config, 'Fc', v_f);
end $$;

-- ══ 3. Ce que l'Edge Function « eclair » appelle (clé de service seulement) ══
-- p = { items: [{jeu, manche}] } (une mise) : les contextes, après avoir figé les modes de la manche en cours et des deux
--     suivantes, comme srv_eclair_contexte ;
-- p = { ids: [mise, …] } (un règlement) : parmi ces mises, celles du joueur, ouvertes et marquées, avec leur contexte.
create or replace function public.srv_eclair_reelles(p_user uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.agir_pour(p_user); v_r bigint := wm.eclair_manche(); x jsonb; v_m bigint;
  v_items jsonb := '[]'::jsonb; v_mises jsonb := '[]'::jsonb; m record;
begin
  if jsonb_typeof(p -> 'items') = 'array' then
    perform wm.eclair_figer(v_r, v_r + 2);
    for x in select e from jsonb_array_elements(p -> 'items') e limit 60 loop
      v_m := wm.num(x ->> 'manche')::bigint;
      continue when v_m is null or v_m > v_r + 2 or not exists (select 1 from wm.eclair_jeux j where j.jeu = x ->> 'jeu');
      v_items := v_items || jsonb_build_array(wm.eclair_reel_un(x ->> 'jeu', v_m));
    end loop;
  end if;
  if jsonb_typeof(p -> 'ids') = 'array' then
    for m in select e.id, e.jeu, e.manche from wm.eclair_mises e join wm.eclair_mises_reelles k on k.mise_id = e.id
             where e.user_id = v_uid and e.etat = 'ouverte'
               and e.id in (select wm.num(z #>> '{}')::bigint from jsonb_array_elements(p -> 'ids') z where jsonb_typeof(z) in ('number', 'string'))
             order by e.manche, e.id limit 60 loop
      v_mises := v_mises || jsonb_build_array(wm.eclair_reel_un(m.jeu, m.manche) || jsonb_build_object('id', m.id));
    end loop;
  end if;
  return jsonb_build_object('t', wm.en_ms(clock_timestamp()), 'r', v_r, 'grace_s', wm.reglage_num('eclair.grace_s', 120),
    'items', v_items, 'mises', v_mises);
end $$;

-- Miser pour le nouveau front : la mise passe par srv_eclair_miser, inchangée (tous ses contrôles), puis la marque est
-- posée dans la même transaction. Une clé déjà vue rend la réponse d'origine, sans rien marquer de plus.
create or replace function public.srv_eclair_miser_reelle(p_user uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_res jsonb; v_id bigint;
begin
  v_res := public.srv_eclair_miser(p_user, p);
  v_id := wm.num(v_res -> 'mise' ->> 'id')::bigint;
  if v_id is not null and not coalesce((v_res ->> 'rejoue')::boolean, false) then
    insert into wm.eclair_mises_reelles (mise_id, user_id, jeu, manche)
    select e.id, e.user_id, e.jeu, e.manche from wm.eclair_mises e where e.id = v_id and e.user_id = p_user
    on conflict (mise_id) do nothing;
  end if;
  return v_res || jsonb_build_object('reel', true);
end $$;

-- Rendre une mise marquée d'une manche annulée : p_res = [{ id, motif }] (calculé par le moteur v2). Mêmes écritures que
-- srv_eclair_rembourser (wm.eclair_remboursements, écriture « flash_rembourse » du journal d'argent, notification
-- « flash_rembourse », mise close « perdue » avec un gain égal à la mise ; ni XP, ni série, ni pari réglé), pour les mises
-- marquées seulement. Une fixation manquante n'annule la manche qu'après le délai de grâce.
create or replace function public.srv_eclair_rembourser_reelles(p_user uuid, p_res jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.agir_pour(p_user); v_maintenant bigint := wm.eclair_manche(); x jsonb; m wm.eclair_mises; v_solde numeric;
  v_motif text; v_out jsonb := '[]'::jsonb; v_id uuid; v_at timestamptz; v_p jsonb; v_texte text; v_actif text;
  v_grace integer := wm.reglage_num('eclair.grace_s', 120)::integer;
begin
  perform 1 from public.user_stats where user_id = v_uid for update;
  for x in select e from jsonb_array_elements(case when jsonb_typeof(p_res) = 'array' then p_res else '[]'::jsonb end) e limit 60 loop
    select * into m from wm.eclair_mises e where e.id = wm.num(x ->> 'id')::bigint and e.user_id = v_uid and e.etat = 'ouverte' and e.manche < v_maintenant for update;
    continue when not found;
    continue when not exists (select 1 from wm.eclair_mises_reelles k where k.mise_id = m.id);                 -- une mise marquée seulement
    select j.actif into v_actif from wm.eclair_jeux j where j.jeu = m.jeu;
    continue when (wm.eclair_fixation(v_actif, m.manche) is null or wm.eclair_fixation(v_actif, m.manche + 1) is null)
              and clock_timestamp() < wm.eclair_t0(m.manche + 1) + make_interval(secs => v_grace);               -- la fin peut encore arriver
    v_motif := case when x ->> 'motif' in ('fixation_absente', 'sources_insuffisantes', 'egalite_sans_break_even') then x ->> 'motif' else 'manche_annulee' end;
    insert into wm.eclair_remboursements (mise_id, user_id, jeu, manche, montant, motif) values (m.id, v_uid, m.jeu, m.manche, m.amt, v_motif);
    update public.user_stats set balance = balance + m.amt where user_id = v_uid returning balance into v_solde;
    insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, m.amt, v_solde, 'flash_rembourse', m.jeu || ':' || m.manche);
    update wm.eclair_mises set etat = 'perdue', gain = m.amt, settled_at = now() where id = m.id;
    v_p := jsonb_build_object('g', m.jeu, 'r', m.manche, 'amt', m.amt, 'motif', v_motif);
    v_texte := 'Éclair ' || m.jeu || ', manche ' || m.manche || ' : annulée, ta mise de ' || to_char(m.amt, 'FM999999990.00') || ' $ t''est rendue.';
    insert into public.notifications (user_id, icon, text, code, params, href) values (v_uid, 'bolt', v_texte, 'flash_rembourse', v_p, '#eclair')
    returning id, created_at into v_id, v_at;
    perform wm.ev(jsonb_build_object('k', 'notif', 'n', jsonb_build_object('id', v_id, 'ic', 'bolt', 'code', 'flash_rembourse', 'p', v_p, 'text', v_texte,
      'href', '#eclair', 'at', wm.en_ms(v_at), 'read', false)));
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', m.id, 'g', m.jeu, 'r', m.manche, 's', m.cote, 'amt', m.amt, 'motif', v_motif));
  end loop;
  return wm.reponse(v_uid, jsonb_build_object('rembourses', v_out, 'eclair', wm.eclair_json(v_uid)));
end $$;

select wm.droits();
