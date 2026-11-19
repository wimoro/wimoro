// Produit le texte SQL des fonctions existantes qui reçoivent un contrôle ajouté (panneau d'administration, lots 2 et 3).
//
// On part TOUJOURS de la définition en vigueur (pg_get_functiondef dans la base embarquée, chargée avec les migrations du
// dépôt jusqu'à celle du lot : identique à la production, vérifié par empreinte avant chaque application). On ne fait que :
//   * insérer des lignes marquées « -- [ajout] » avant ou après un repère, qui doit apparaître UNE seule fois ;
//   * remplacer un littéral par wm.reglage_num('<clé>', <le même littéral>) sur une ligne marquée « -- [réglage] » ;
//   * changer la volatilité (IMMUTABLE → STABLE) quand la fonction lit désormais un réglage.
// Le test tests/sql/gardes.spec.mjs vérifie qu'aucune autre différence n'existe.
//
//   node tools/garde-fonctions.mjs 2 blocages_moderation > fonctions-lot2.sql
//   (le second argument : nom de la migration du lot, pour lire les définitions d'avant elle)
import { creerBase, q } from '../tests/sql/base.mjs';

const A = '-- [ajout] ';
const R = (de, vers, cle) => ({ remplace: [de, vers, cle] });
const paris = { apres: 'perform wm.rg_garde(v_uid);', lignes: [`  perform wm.garde(v_uid, 'paris');   ${A}blocage des paris`] };

export const LOTS = {
  2: [
    { f: 'wm.uid()', edits: [{ avant: '  return v;', lignes: [`  perform wm.uid_gardes(v);   ${A}déconnexion forcée, blocage du site, maintenance`] }] },
    { f: 'wm.buy(text,text,numeric,uuid,jsonb)', edits: [paris] },
    { f: 'public.srv_eclair_miser(uuid,jsonb)', edits: [paris] },
    { f: 'public.srv_serie_start(uuid,jsonb)', edits: [paris] },
    { f: 'public.srv_blitz_join(uuid,jsonb)', edits: [paris] },
    { f: 'public.srv_blitz_rebuy(uuid,jsonb)', edits: [paris] },
    { f: 'wm.duel_create(jsonb)', edits: [paris] },
    { f: 'wm.duel_accepter(bigint,uuid,integer,numeric)', edits: [{ apres: 'perform wm.rg_garde(p_adv);', lignes: [`    perform wm.garde(p_adv, 'paris');   ${A}blocage des paris de celui qui accepte`] }] },
    { f: 'public.srv_duel_eclair_creer(uuid,jsonb)', edits: [paris] },
    { f: 'wm.combo_place(jsonb)', edits: [paris] },
    { f: 'wm.stack_create(jsonb)', edits: [paris] },
    { f: 'wm.copy_start(jsonb)', edits: [{ apres: "  if not found then perform wm.fail('profil_absent'); end if;", lignes: [`  perform wm.garde(v_uid, 'paris');   ${A}blocage des paris`] }] },
    { f: 'wm.copie_executer(bigint,text,text,numeric,boolean)', edits: [{ avant: '  if p_attendre then select * into s', lignes: [`  if wm.bloque(v_user, 'paris') then return jsonb_build_object('r', 'bloque'); end if;   ${A}copieur bloqué : rien, jamais d'exception`] }] },
    { f: 'wm.demo_deposit(jsonb,uuid)', edits: [{ apres: 'perform wm.rg_garde(v_uid);', lignes: [`  perform wm.garde(v_uid, 'depots');   ${A}blocage des dépôts`] }] },
    { f: 'wm.demo_withdraw(jsonb,uuid)', edits: [{ apres: "  if found then return v_prev || jsonb_build_object('rejoue', true); end if;", lignes: [`  perform wm.garde(v_uid, 'retraits');   ${A}blocage des retraits`] }] },
    { f: 'wm.proposal_create(jsonb)', edits: [{ apres: "  if not found then perform wm.fail('profil_absent'); end if;", lignes: [`  perform wm.garde(v_uid, 'creation');   ${A}blocage de la création de marchés`] }] },
    { f: 'wm.clan_join(text,text)', edits: [
      { apres: '  perform 1 from public.user_stats where user_id = v_uid for update;', lignes: [`  perform wm.garde(v_uid, 'clans');   ${A}blocage des clans`] },
      { avant: '  select * into r from wm.clan_verifier(v_uid, p_clan);', lignes: [`  perform wm.clan_dissous_garde(p_clan);   ${A}clan dissous par l'équipe`] }] },
    { f: 'wm.clan_apply(text)', edits: [{ apres: '  perform 1 from public.user_stats where user_id = v_uid for update;', lignes: [
      `  perform wm.garde(v_uid, 'clans');   ${A}blocage des clans`, `  perform wm.clan_dissous_garde(p_clan);   ${A}clan dissous par l'équipe`] }] },
    { f: 'wm.clan_create(jsonb)', edits: [{ apres: "  if not found then perform wm.fail('profil_absent'); end if;", lignes: [`  perform wm.garde(v_uid, 'clans');   ${A}blocage des clans`] }] },
    ...['wm.clan_promote(uuid)', 'wm.clan_kick(uuid)', 'wm.clan_invite(uuid)', 'wm.clan_call(text,text)', 'wm.clan_war()'].map(f => (
      { f, edits: [{ apres: '  perform 1 from public.user_stats where user_id = v_uid for update;', lignes: [`  perform wm.garde(v_uid, 'clans');   ${A}blocage des clans`] }] })),
    { f: 'wm.clan_war_join()', edits: [{ apres: "  if not found then perform wm.fail('profil_absent'); end if;", lignes: [
      `  perform wm.garde(v_uid, 'clans');   ${A}blocage des clans`, `  perform wm.garde(v_uid, 'paris');   ${A}blocage des paris (mise de la guerre)`] }] },
    { f: 'wm.chat_send(text,text)', edits: [{ apres: '  perform wm.chat_salon(p_room);', lignes: [
      `  perform wm.garde(v_uid, 'chat', p_room);   ${A}blocage du chat (tous les salons ou celui-ci)`,
      `  perform wm.chat_regles(v_uid, p_room, v_text);   ${A}salon fermé, mode lent, mots interdits`] }] },
    { f: 'wm.chat_share(text,text,text)', edits: [{ avant: "  if p_side is null or p_side not in ('oui', 'non') then perform wm.fail('cote_invalide'); end if;", lignes: [
      `  perform wm.garde(v_uid, 'chat', case when v_ami is not null then 'dm' else p_room end);   ${A}blocage du chat`,
      `  if v_ami is null then perform wm.chat_regles(v_uid, p_room, ''); end if;   ${A}salon fermé, mode lent`] }] },
    { f: 'wm.chat_react(text,text,text)', edits: [{ avant: "  perform wm.debit(v_uid, 'reaction', 40, 'trop_de_reactions');", lignes: [
      `  perform wm.garde(v_uid, 'chat', case when v_autre is not null then 'dm' else v_salon end);   ${A}blocage du chat`] }] },
    { f: 'wm.ana_share(jsonb,text[],text)', edits: [{ apres: '    v_rooms := v_rooms || r;', lignes: [
      `    perform wm.garde(v_uid, 'chat', case when r like 'dm:%' then 'dm' else r end);   ${A}blocage du chat`,
      `    perform wm.chat_regles(v_uid, case when r like 'dm:%' then 'dm' else r end, v_text);   ${A}salon fermé, mode lent, mots interdits`] }] },
    { f: 'wm.dm_send(uuid,text)', edits: [{ apres: '  perform wm.dm_garde(v_uid, p_user, true);', lignes: [
      `  perform wm.garde(v_uid, 'chat', 'dm');   ${A}blocage du chat (messages privés compris)`,
      `  perform wm.chat_regles(v_uid, 'dm', v_text);   ${A}mots interdits, si le réglage vaut aussi en privé`] }] },
  ],
  // Lot 3 : les constantes lues dans wm.reglages (valeur par défaut = le littéral remplacé). wm.fee_rate, wm.argent et
  // wm.ref_bonus sont réécrites à la main dans la migration du lot (vérifiées sur leurs résultats).
  3: [
    { f: 'wm.quote_buy(double precision,double precision,text,boolean,text,double precision)', volatilite: ['IMMUTABLE', 'STABLE'], edits: [] },
    { f: 'wm.buy(text,text,numeric,uuid,jsonb)', edits: [
      R('v_total < 1 then', "v_total < wm.reglage_num('paris.mise_min', 1) then", 'paris.mise_min'),
      { apres: "  if p_key is null then perform wm.fail('cle_absente'); end if;", lignes: [
        `  if v_total > wm.reglage_num('paris.mise_max', null) then perform wm.fail('montant_max'); end if;   ${A}plafond des paris (vide par défaut : aucun)`] }] },
    { f: 'public.srv_eclair_miser(uuid,jsonb)', edits: [
      R('v_amt < 1 or v_amt > 10000', "v_amt < wm.reglage_num('eclair.mise_min', 1) or v_amt > wm.reglage_num('eclair.mise_max', 10000)", 'eclair.mise_min, eclair.mise_max')] },
    { f: 'public.srv_serie_start(uuid,jsonb)', edits: [
      R('v_stake not in (5, 10, 25, 50, 100)', "not (v_stake = any (wm.reglage_liste('serie.mises', array[5, 10, 25, 50, 100])))", 'serie.mises')] },
    { f: 'public.srv_blitz_join(uuid,jsonb)', edits: [
      R('v_buyin not in (10, 25)', "v_buyin not in (wm.reglage_num('blitz.buyin', 10), wm.reglage_num('blitz.buyin_prime', 25))", 'blitz.buyin, blitz.buyin_prime')] },
    { f: 'public.srv_blitz_rebuy(uuid,jsonb)', edits: [R('v_prix is distinct from 50', "v_prix is distinct from wm.reglage_num('blitz.rachat', 50)", 'blitz.rachat')] },
    { f: 'wm.duel_create(jsonb)', edits: [
      R('v_mise < 5 or v_mise > 5000', "v_mise < wm.reglage_num('duels.mise_min', 5) or v_mise > wm.reglage_num('duels.mise_max', 5000)", 'duels.mise_min, duels.mise_max'),
      R("x.etat = 'open') >= 10", "x.etat = 'open') >= wm.reglage_num('duels.max_ouverts', 10)", 'duels.max_ouverts'),
      R("now() + interval '48 hours'", "now() + interval '1 hour' * wm.reglage_num('duels.expiration_h', 48)", 'duels.expiration_h')] },
    { f: 'public.srv_duel_eclair_creer(uuid,jsonb)', edits: [
      R('v_mise < 5 or v_mise > 5000', "v_mise < wm.reglage_num('duels.mise_min', 5) or v_mise > wm.reglage_num('duels.mise_max', 5000)", 'duels.mise_min, duels.mise_max'),
      R("x.etat = 'open') >= 10", "x.etat = 'open') >= wm.reglage_num('duels.max_ouverts', 10)", 'duels.max_ouverts')] },
    { f: 'wm.combo_place(jsonb)', edits: [
      R('v_mise < 2 or v_mise > 1000', "v_mise < wm.reglage_num('combines.mise_min', 2) or v_mise > wm.reglage_num('combines.mise_max', 1000)", 'combines.mise_min, combines.mise_max'),
      R("jsonb_array_length(p -> 'legs') > 6", "jsonb_array_length(p -> 'legs') > wm.reglage_num('combines.selections_max', 6)", 'combines.selections_max'),
      R('round(v_brut * 0.05, 2)', "round(v_brut * wm.reglage_num('frais.combines.commission', 0.05), 2)", 'frais.combines.commission'),
      R('least(v_brut - v_frais, 50000)', "least(v_brut - v_frais, wm.reglage_num('combines.gain_max', 50000))", 'combines.gain_max')] },
    { f: 'wm.combo_valeur(wm.combos)', edits: [R('v_p * 0.95)', "v_p * wm.reglage_num('combines.encaisse_decote', 0.95))", 'combines.encaisse_decote')] },
    { f: 'wm.stack_create(jsonb)', edits: [
      R('v_buyin < 5 or v_buyin > 1000', "v_buyin < wm.reglage_num('stacks.buyin_min', 5) or v_buyin > wm.reglage_num('stacks.buyin_max', 1000)", 'stacks.buyin_min, stacks.buyin_max'),
      R("y.etat = 'active') >= 5", "y.etat = 'active') >= wm.reglage_num('stacks.max_actifs', 5)", 'stacks.max_actifs')] },
    { f: 'wm.stacks_avant(uuid)', edits: [R('s.buyin * 2 * 0.96', "s.buyin * 2 * (1 - wm.reglage_num('frais.stacks.commission', 0.04))", 'frais.stacks.commission')] },
    { f: 'wm.copy_start(jsonb)', edits: [
      R('v_budget < 50', "v_budget < wm.reglage_num('copies.budget_min', 50)", 'copies.budget_min'),
      R('(v_per < 5 or', "(v_per < wm.reglage_num('copies.mise_min', 5) or", 'copies.mise_min'),
      R('(v_cap > 0 and v_cap < 5)', "(v_cap > 0 and v_cap < wm.reglage_num('copies.mise_min', 5))", 'copies.mise_min'),
      R("x.etat <> 'stopped') >= 10", "x.etat <> 'stopped') >= wm.reglage_num('copies.max_actives', 10)", 'copies.max_actives')] },
    { f: 'wm.copie_executer(bigint,text,text,numeric,boolean)', edits: [
      R('trunc(v_fee * 0.20, 2)', "trunc(v_fee * wm.reglage_num('frais.copies.part_copie', 0.20), 2)", 'frais.copies.part_copie'),
      R('donne = donne + v_fee * 0.20', "donne = donne + v_fee * wm.reglage_num('frais.copies.part_copie', 0.20)", 'frais.copies.part_copie'),
      R('if v_amt < 5 or v_libre < v_amt', "if v_amt < wm.reglage_num('copies.mise_min', 5) or v_libre < v_amt", 'copies.mise_min')] },
    { f: 'wm.demo_deposit(jsonb,uuid)', edits: [{ apres: '  end loop;', lignes: [
      `  if v_usd + coalesce((select sum(x.usd_equivalent) from public.deposits x where x.user_id = v_uid and x.label is null and x.created_at >= now() - interval '1 day'), 0) > wm.reglage_num('depots.max_jour', null) then perform wm.fail('limite_depot'); end if;   ${A}plafond du site par jour (vide par défaut : aucun)`] }] },
    { f: 'wm.demo_withdraw(jsonb,uuid)', edits: [{ apres: "  if s.balance < v_amt then perform wm.fail('solde_insuffisant'); end if;", lignes: [
      `  if v_amt > wm.reglage_num('retraits.max', null) then perform wm.fail('retrait_max'); end if;   ${A}plafond d'un retrait (vide par défaut : aucun)`] }] },
    { f: 'wm.clan_create(jsonb)', edits: [
      R('if s.balance < 50 then', "if s.balance < wm.reglage_num('clans.frais_creation', 50) then", 'clans.frais_creation'),
      R('set balance = balance - 50, profit_realized = coalesce(profit_realized, 0) - 50 where',
        "set balance = balance - wm.reglage_num('clans.frais_creation', 50), profit_realized = coalesce(profit_realized, 0) - wm.reglage_num('clans.frais_creation', 50) where", 'clans.frais_creation'),
      R("values (v_uid, -50, v_solde, 'clan', v_id)", "values (v_uid, -wm.reglage_num('clans.frais_creation', 50), v_solde, 'clan', v_id)", 'clans.frais_creation')] },
    { f: 'wm.clan_war()', edits: [{ apres: '  insert into wm.clan_guerres (clan_id, ennemi, par, bots, fin)', lignes: [
      `  if g.buyin is distinct from wm.reglage_num('clans.guerre_buyin', 20) then update wm.clan_guerres set buyin = wm.reglage_num('clans.guerre_buyin', 20) where id = g.id returning * into g; end if;   ${A}mise de la guerre (réglage ; 20 par défaut, comme la colonne)`] }] },
    { f: 'wm.clan_guerres_avancer(uuid)', edits: [R('round(v_pot * 0.96 / v_n, 2)', "round(v_pot * (1 - wm.reglage_num('frais.guerres.commission', 0.04)) / v_n, 2)", 'frais.guerres.commission')] },
  ],
};

/** Applique les modifications d'une fonction à sa définition ; lève si un repère manque ou n'est pas unique. */
export function modifier(def, spec) {
  let lignes = def.replace(/\s+$/, '').split('\n');
  for (const e of spec.edits || []) {
    if (e.remplace) {
      const [de, vers, cle] = e.remplace;
      const idx = lignes.map((l, i) => l.includes(de) ? i : -1).filter(i => i >= 0);
      if (idx.length !== 1) throw new Error(`${spec.f} : « ${de} » trouvé ${idx.length} fois`);
      lignes[idx[0]] = lignes[idx[0]].split(de).join(vers) + `   -- [réglage] ${cle}`;
      continue;
    }
    const repere = e.avant ?? e.apres;
    const idx = lignes.map((l, i) => l.includes(repere) ? i : -1).filter(i => i >= 0);
    if (idx.length !== 1) throw new Error(`${spec.f} : repère « ${repere} » trouvé ${idx.length} fois`);
    const at = e.avant ? idx[0] : idx[0] + 1;
    lignes = [...lignes.slice(0, at), ...e.lignes, ...lignes.slice(at)];
  }
  let texte = lignes.join('\n');
  if (spec.volatilite) {
    const [de, vers] = spec.volatilite;
    const entete = texte.slice(0, texte.indexOf('AS $function$'));
    if (!new RegExp(`^ ${de}\\b`, 'm').test(entete)) throw new Error(`${spec.f} : volatilité ${de} absente`);
    texte = entete.replace(new RegExp(`^ ${de}\\b`, 'm'), ' ' + vers) + texte.slice(entete.length);
  }
  return texte + ';\n';
}

/** Texte SQL des fonctions modifiées d'un lot, lu dans une base chargée jusqu'à la migration donnée (exclue). */
export async function produire(lot, until) {
  const db = await creerBase({ until });
  let out = '';
  for (const spec of LOTS[lot]) {
    const [{ def }] = await q(db, 'select pg_get_functiondef($1::regprocedure) as def', [spec.f]);
    out += modifier(def, spec) + '\n';
  }
  await db.close();
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('garde-fonctions.mjs')) {
  const [lot, until] = process.argv.slice(2);
  if (!LOTS[lot] || !until) { console.error('usage : node tools/garde-fonctions.mjs <lot> <nom de la migration du lot>'); process.exit(1); }
  process.stdout.write(await produire(lot, until));
}
