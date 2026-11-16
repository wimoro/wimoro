-- L'état du joueur et les suites d'une résolution de marché s'assemblent à partir de blocs enregistrés.
--
-- Jusqu'ici, chaque lot recopiait wm.state() et wm.marche_suites() en y ajoutant sa ligne. Un lot appliqué en retard aurait
-- donc effacé les ajouts des lots suivants. Désormais un lot enregistre son bloc (une ligne dans une table) et ne touche
-- plus aux autres : l'ordre d'application des lots n'a plus d'importance.

create table if not exists wm.etat_blocs (
  cle text primary key,                    -- champ de la réponse de api_state (ou simple nom, pour une étape « avant »)
  fonction text not null,                  -- fonction wm.xxx(uuid) ; pour un bloc, elle renvoie du jsonb
  ordre integer not null default 100,
  avant boolean not null default false     -- vrai : étape exécutée avant la lecture (ce qui se règle au chargement)
);
create table if not exists wm.suites_blocs (
  cle text primary key,                    -- champ du journal de la résolution
  fonction text not null,                  -- fonction wm.xxx(text, text) : marché, issue
  ordre integer not null default 100
);
alter table wm.etat_blocs enable row level security;
alter table wm.suites_blocs enable row level security;
revoke all on wm.etat_blocs, wm.suites_blocs from public, anon, authenticated;

create or replace function wm.blitz_etat(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_agg(j.blitz order by j.blitz) from wm.blitz_joueurs j where j.user_id = p_user and not j.regle), '[]'::jsonb)
$$;

insert into wm.etat_blocs (cle, fonction, ordre, avant) values
  ('duels_expirer', 'wm.duels_expirer', 10, true),
  ('ref_regler', 'wm.ref_regler', 20, true),
  ('serie', 'wm.serie_etat', 10, false),
  ('blitz', 'wm.blitz_etat', 20, false),
  ('duels', 'wm.duels_etat', 30, false),
  ('combos', 'wm.combos_etat', 40, false),
  ('ref', 'wm.ref_etat', 50, false)
on conflict (cle) do update set fonction = excluded.fonction, ordre = excluded.ordre, avant = excluded.avant;

insert into wm.suites_blocs (cle, fonction, ordre) values
  ('duels', 'wm.duels_marche', 10),
  ('combines', 'wm.combos_marche', 20)
on conflict (cle) do update set fonction = excluded.fonction, ordre = excluded.ordre;

-- ── État du joueur : ce qui se règle au chargement, puis le socle, puis les blocs ──
create or replace function wm.state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); v jsonb; b record; x jsonb;
begin
  for b in select e.fonction from wm.etat_blocs e where e.avant order by e.ordre, e.cle loop
    execute format('select %s($1)', b.fonction::regproc) using v_uid;
  end loop;
  v := wm.state_socle();
  for b in select e.cle, e.fonction from wm.etat_blocs e where not e.avant order by e.ordre, e.cle loop
    execute format('select %s($1)', b.fonction::regproc) using v_uid into x;
    v := v || jsonb_build_object(b.cle, x);
  end loop;
  return v;
end $$;

-- ── Ce qui suit la résolution d'un marché ──
create or replace function wm.marche_suites(p_market text, p_issue text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb := '{}'::jsonb; b record; x jsonb;
begin
  for b in select s.cle, s.fonction from wm.suites_blocs s order by s.ordre, s.cle loop
    execute format('select to_jsonb(%s($1, $2))', b.fonction::regproc) using p_market, p_issue into x;
    v := v || jsonb_build_object(b.cle, x);
  end loop;
  return v;
end $$;

select wm.droits();
