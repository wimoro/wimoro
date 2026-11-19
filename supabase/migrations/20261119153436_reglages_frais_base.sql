-- Panneau d'administration, lot 3 (19 nov. 2026), première partie : les frais lus dans les réglages.
--
-- Trois fonctions existantes sont réécrites pour lire wm.reglages ; avec les valeurs par défaut (les constantes d'avant),
-- elles rendent exactement les mêmes résultats (tests/sql/reglages-frais.spec.mjs les compare à une base d'avant) :
--   * wm.fee_rate : barème par catégorie × multiplicateur × remise du rang Diamant ; un changement vaut dès le pari suivant ;
--   * wm.argent : le barème des dépôts et retraits (minimums, frais, plafonds) ;
--   * wm.ref_bonus : le bonus de parrainage.
-- Elles passent d'IMMUTABLE à STABLE (elles lisent une table). Les autres constantes sont remplacées une à une dans les
-- fonctions par les migrations suivantes (reglages_frais_paris, _jeux, _argent_clans).
-- Les prix du Blitz (entrée, entrée de 21 h, rachat) sont envoyés par l'Edge Function « eclair » avec ses propres
-- constantes : tant qu'elle ne lit pas les réglages, les changer bloquerait le Blitz ; ils restent donc « pas encore
-- appliqués » (reglage_modifier les refuse) jusqu'au lot du pari éclair.
-- Définitions d'avant : backup_20261119.fonctions (lot 0).

-- Une liste de nombres (La Série : mises acceptées) ; absente ou mal formée : la liste par défaut.
create or replace function wm.reglage_liste(p_cle text, p_defaut numeric[]) returns numeric[]
language sql stable security definer set search_path = '' as $$
  select coalesce((select array(select (e #>> '{}')::numeric from jsonb_array_elements(r.valeur) e)
                   from wm.reglages r
                   where r.cle = p_cle and jsonb_typeof(r.valeur) = 'array'
                     and not exists (select 1 from jsonb_array_elements(r.valeur) e where jsonb_typeof(e) <> 'number')), p_defaut)
$$;

CREATE OR REPLACE FUNCTION wm.fee_rate(p_cat text, p_disc boolean)
 RETURNS double precision
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select (case p_cat when 'Crypto' then wm.reglage_num('frais.taux.crypto', 0.07) when 'Tech et IA' then wm.reglage_num('frais.taux.tech_ia', 0.04)
                     when 'Bourse' then wm.reglage_num('frais.taux.bourse', 0.04) when 'Matières' then wm.reglage_num('frais.taux.matieres', 0.04)
                     when 'Devises' then wm.reglage_num('frais.taux.devises', 0.04) when 'Football' then wm.reglage_num('frais.taux.football', 0.05)
                     when 'Politique' then wm.reglage_num('frais.taux.politique', 0.05) when 'Économie' then wm.reglage_num('frais.taux.economie', 0.05)
                     when 'Culture' then wm.reglage_num('frais.taux.culture', 0.05) when 'Météo' then wm.reglage_num('frais.taux.meteo', 0.05)
                     when 'Sport' then wm.reglage_num('frais.taux.sport', 0.05) when 'Sport live' then wm.reglage_num('frais.taux.sport_live', 0.05)
                     else wm.reglage_num('frais.taux.defaut', 0.05) end)::float8
         * wm.reglage_num('frais.k', 0.70)::float8 * (case when p_disc then wm.reglage_num('frais.remise_rang', 0.90) else 1 end)::float8
$function$;

-- Le barème d'argent : la même constante qu'avant, dont chaque valeur réglable est remplacée par son réglage.
create or replace function wm.argent_regle(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r record; v numeric;
begin
  for r in select * from (values
      ('{coins,USDC,min}', 'depots.min.usdc'), ('{coins,USDT,min}', 'depots.min.usdt'), ('{coins,ETH,min}', 'depots.min.eth'),
      ('{coins,BTC,min}', 'depots.min.btc'), ('{coins,SOL,min}', 'depots.min.sol'),
      ('{nets,Base,wfee}', 'frais.retraits.base'), ('{nets,Ethereum,wfee}', 'frais.retraits.ethereum'), ('{nets,Arbitrum,wfee}', 'frais.retraits.arbitrum'),
      ('{nets,Polygon,wfee}', 'frais.retraits.polygon'), ('{nets,Solana,wfee}', 'frais.retraits.solana'),
      ('{fiat,card,df}', 'frais.depots_fiat.card'), ('{fiat,bank,df}', 'frais.depots_fiat.bank'), ('{fiat,paypal,df}', 'frais.depots_fiat.paypal'),
      ('{fiat,card,wf}', 'frais.retraits_fiat.card'), ('{fiat,bank,wf}', 'frais.retraits_fiat.bank'), ('{fiat,paypal,wf}', 'frais.retraits_fiat.paypal'),
      ('{depot_max}', 'depots.max'), ('{fiat_min}', 'depots.fiat_min'), ('{fiat_max}', 'depots.fiat_max'), ('{retrait_min}', 'retraits.min')) x(chemin, cle) loop
    v := wm.reglage_num(r.cle, null);
    if v is not null then p := jsonb_set(p, r.chemin::text[], to_jsonb(v)); end if;
  end loop;
  return p;
end $$;

CREATE OR REPLACE FUNCTION wm.argent()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select wm.argent_regle('{
  "coins": {
    "USDC": {"min": 5, "fixe": true, "nets": ["Base", "Ethereum", "Arbitrum", "Solana", "Polygon"]},
    "USDT": {"min": 5, "fixe": true, "nets": ["Ethereum", "Tron", "Arbitrum", "Solana"]},
    "ETH":  {"min": 0.002, "nets": ["Ethereum", "Base", "Arbitrum"]},
    "BTC":  {"min": 0.0001, "nets": ["Bitcoin", "Lightning"]},
    "SOL":  {"min": 0.03, "nets": ["Solana"]}},
  "nets": {
    "Base": {"conf": 12, "fmt": "evm", "wfee": 0.05}, "Ethereum": {"conf": 12, "fmt": "evm", "wfee": 2},
    "Arbitrum": {"conf": 12, "fmt": "evm", "wfee": 0.1}, "Polygon": {"conf": 30, "fmt": "evm", "wfee": 0.05},
    "Solana": {"conf": 1, "fmt": "sol", "wfee": 0.01}, "Tron": {"conf": 20}, "Bitcoin": {"conf": 2}, "Lightning": {"conf": 1}},
  "fiat": {
    "card":   {"df": 0.025, "wf": 0.015, "need": 3, "pas": 650, "wd_ms": 3500},
    "bank":   {"df": 0, "wf": 0, "need": 8, "pas": 700, "wd_ms": 6000},
    "paypal": {"df": 0.019, "wf": 0.01, "need": 3, "pas": 650, "wd_ms": 3500}},
  "depot_max": 1000000, "fiat_min": 10, "fiat_max": 5000, "retrait_min": 5, "wd_ms": 4500
}'::jsonb) $function$;

CREATE OR REPLACE FUNCTION wm.ref_bonus()
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select wm.reglage_num('parrainage.bonus', 10)::numeric $function$;

update wm.reglages
set applique = false,
    explication = explication || ' L''Edge Function « eclair » envoie encore son propre montant : réglage branché au lot du pari éclair.'
where cle in ('blitz.buyin', 'blitz.buyin_prime', 'blitz.rachat') and applique;

select wm.droits();
