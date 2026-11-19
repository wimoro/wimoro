// Pas de défilement horizontal, en-tête sans débordement ni chevauchement, barre d'onglets lisible, champs ≥ 16 px.
// Un test par écran, les largeurs en boucle (portrait de 320 à 1920 px, plus un paysage 844 × 390). Projet « bureau » seulement.
import { test, expect } from '@playwright/test';
import { ouvrir } from '../helpers/app.mjs';

const TAILLES = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920].map(w => [w, 800]).concat([[844, 390]]);
const DEMO = ['accueil', 'marche-btc150k', 'eclair', 'portefeuille', 'communaute', 'chat', 'profil', 'depot', 'classement'];
const VISITEUR = ['accueil', 'connexion', 'inscription'];

/** Mesures prises dans la page : renvoie la liste des défauts constatés (texte) pour la taille courante. */
function mesurer() {
  const W = innerWidth, pb = [];
  const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const nom = e => (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : e.tagName.toLowerCase()) + '[' + (e.textContent || '').trim().slice(0, 14) + ']';
  // (a)
  if (document.documentElement.scrollWidth > W + 1) {
    const larges = [...document.querySelectorAll('body *')].filter(e => vis(e) && e.getBoundingClientRect().right > W + 1).slice(0, 3).map(nom);
    pb.push(`défilement horizontal : scrollWidth ${document.documentElement.scrollWidth} > ${W} (ex. ${larges.join(', ')})`);
  }
  // (b)
  const boites = [];
  document.querySelectorAll('.top .right > *, .nav > *').forEach(e => { if (vis(e)) boites.push(e); });
  const logo = document.querySelector('.logo'); if (logo && vis(logo)) boites.push(logo);
  boites.forEach(e => { const r = e.getBoundingClientRect(); if (r.left < -0.5 || r.right > W + 0.5) pb.push(`en-tête hors écran : ${nom(e)} [${r.left.toFixed(1)} ; ${r.right.toFixed(1)}] pour ${W}`); });
  for (let i = 0; i < boites.length; i++) for (let j = i + 1; j < boites.length; j++) {
    if (boites[i].contains(boites[j]) || boites[j].contains(boites[i])) continue;
    const a = boites[i].getBoundingClientRect(), b = boites[j].getBoundingClientRect();
    const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left), dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (dx > 1 && dy > 1) pb.push(`en-tête : ${nom(boites[i])} recouvre ${nom(boites[j])} (${dx.toFixed(1)} × ${dy.toFixed(1)} px)`);
  }
  // (c)
  const tb = document.querySelector('nav.tabbar');
  if (W <= 879) {
    if (!vis(tb)) pb.push('barre d’onglets invisible');
    else {
      const ong = [...tb.querySelectorAll('a')].filter(vis);
      if (ong.length !== 5) pb.push(`barre d’onglets : ${ong.length} onglets visibles au lieu de 5`);
      ong.forEach(a => { const s = a.querySelector('span:not(.dotn)'); if (s && s.scrollWidth > s.clientWidth + 1) pb.push(`libellé coupé « ${s.textContent} » : scrollWidth ${s.scrollWidth} > clientWidth ${s.clientWidth}`); });
      scrollTo(0, document.documentElement.scrollHeight);
      let dernier = null, cur = document.querySelector('#view'); for (;;) { const k = [...cur.children].filter(vis); if (!k.length) break; cur = dernier = k[k.length - 1]; }
      if (dernier) { const r = dernier.getBoundingClientRect(), t = tb.getBoundingClientRect(); if (r.bottom > t.top + 1) pb.push(`le dernier élément (${nom(dernier)}) passe sous la barre d’onglets : bas ${r.bottom.toFixed(1)} > haut ${t.top.toFixed(1)}`); }
    }
  } else if (vis(tb)) pb.push('barre d’onglets visible à ' + W + ' px (attendue masquée dès 880)');
  // (d)
  if (W <= 430) document.querySelectorAll('input,select,textarea').forEach(e => {
    if (/^(hidden|checkbox|radio|range|file|button|submit|color)$/.test(e.type) || !vis(e)) return;
    const f = parseFloat(getComputedStyle(e).fontSize); if (f < 16) pb.push(`champ ${e.tagName.toLowerCase()}${e.name ? '[' + e.name + ']' : ''} à ${f}px (< 16)`);
  });
  return pb;
}

async function parcourir(page, erreurs) {
  const defauts = [];
  for (const [w, h] of TAILLES) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => render(true));
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    for (const d of await page.evaluate(mesurer)) defauts.push(`${w}×${h} : ${d}`);
  }
  expect(defauts).toEqual([]);
  expect(erreurs).toEqual([]);
}

for (const ecran of DEMO) {
  test(`responsive · ${ecran} (compte démo)`, async ({ page }) => {
    test.skip(test.info().project.name !== 'bureau', 'projet bureau seulement');
    const { erreurs } = await ouvrir(page, { mode: 'demo', hash: '#' + ecran });
    await page.locator('#ov').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
    if (await page.locator('#ov').count()) { await page.keyboard.press('Escape'); await expect(page.locator('#ov')).toHaveCount(0); }
    await parcourir(page, erreurs);
  });
}
for (const ecran of VISITEUR) {
  test(`responsive · ${ecran} (visiteur)`, async ({ page }) => {
    test.skip(test.info().project.name !== 'bureau', 'projet bureau seulement');
    const { erreurs } = await ouvrir(page, { mode: 'visiteur', hash: '#' + ecran });
    await parcourir(page, erreurs);
  });
}
