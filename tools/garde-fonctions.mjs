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
