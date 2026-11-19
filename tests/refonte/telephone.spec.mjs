// Troisième passe, partie B (téléphone) : les points d'accessibilité et de finition qui se vérifient sans capture.
// Focus au titre à chaque changement d'écran, état des panneaux annoncé, curseur rempli, ponctuation des notifications,
// tag de clan jamais rogné, case du cours en direct sans effet sur la hauteur d'une ligne de marché.
import { test, expect } from '@playwright/test';
import { ouvrir, aller, lire } from '../helpers/app.mjs';

test('changement d’écran : le focus va au titre, pas au premier affichage ni sur un nouveau rendu', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'demo', lang: 'fr' });
  expect(await lire(page, () => document.activeElement === document.body)).toBe(true);
  await aller(page, 'eclair');
  await expect.poll(() => lire(page, () => document.activeElement && document.activeElement.tagName)).toBe('H1');
  await lire(page, () => render(false));
  expect(await lire(page, () => document.activeElement.tagName), 'un écran redessiné garde le focus sur son titre').toBe('H1');
  await aller(page, 'portefeuille');
  expect(await lire(page, () => document.activeElement.matches('#view h1'))).toBe(true);
  expect(erreurs).toEqual([]);
});

test('cloche et menu du compte : aria-expanded et aria-controls suivent le panneau, Échap compris', async ({ page }) => {
  await ouvrir(page, { mode: 'demo', lang: 'fr' });
  const cloche = page.locator('.bell');
  await expect(cloche).toHaveAttribute('aria-expanded', 'false');
  await cloche.click();
  await expect(cloche).toHaveAttribute('aria-expanded', 'true');
  await expect(cloche).toHaveAttribute('aria-controls', 'npanel');
  await page.keyboard.press('Escape');
  await expect(page.locator('#npanel')).toHaveCount(0);
  await expect(cloche).toHaveAttribute('aria-expanded', 'false');
  expect(await cloche.getAttribute('aria-controls')).toBeNull();
  const menu = page.locator('[data-a="umenu"]');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(menu).toHaveAttribute('aria-controls', 'umenu');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});

test('curseur « Chance de Oui au lancement » : la partie remplie suit la valeur, au clavier', async ({ page }) => {
  await ouvrir(page, { mode: 'demo', lang: 'fr', hash: '#creer' });
  const c = page.locator('input.range').first();
  const val = () => c.evaluate(e => e.style.getPropertyValue('--val'));
  expect(parseFloat(await val())).toBeCloseTo(50, 0);
  await c.focus();
  for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowRight');
  expect(parseFloat(await val())).toBeCloseTo((59 - 5) / 90 * 100, 0);
});

test('notifications : pas de point final sur un texte d’une phrase, plusieurs phrases gardent les leurs', async ({ page }) => {
  await ouvrir(page, { mode: 'demo', lang: 'fr' });
  await lire(page, () => { toast({ title: 'Marché suivi.', text: 'Tu seras prévenu.' }); });
  await expect(page.locator('.toast').last()).toContainText('Marché suivi');
  expect(await page.locator('.toast').last().innerText()).not.toMatch(/\.\s*$/m);
  expect(await lire(page, () => [sansPoint('Une phrase.'), sansPoint('Deux phrases. La seconde.'), sansPoint('Trois points…'), sansPoint('Total : 1.5 BTC.')])).toEqual(['Une phrase', 'Deux phrases. La seconde.', 'Trois points…', 'Total : 1.5 BTC']);
});

test.describe('téléphone 320 px', () => {
  test.use({ viewport: { width: 320, height: 700 }, hasTouch: true, isMobile: true });

  test('duels et classement : un tag de clan n’est jamais rogné, le pseudo garde de la place', async ({ page }) => {
    await ouvrir(page, { mode: 'demo', lang: 'fr', hash: '#duels' });
    const tags = await lire(page, () => [...document.querySelectorAll('.dc-n .ctg')].map(t => { const r = t.getBoundingClientRect(), p = t.parentElement.getBoundingClientRect(); return r.right <= p.right + 0.5 && r.left >= p.left - 0.5; }));
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.every(Boolean)).toBe(true);
    await aller(page, 'classement');
    const coupes = await lire(page, () => [...document.querySelectorAll('.lb .lr:not(.me) .lbn')].filter(n => n.scrollWidth > n.clientWidth + 1 && n.getBoundingClientRect().width < 28).map(n => n.textContent));
    expect(coupes, 'à 320 px, un pseudo tronqué garde au moins 28 px (il gardait une lettre)').toEqual([]);
  });

  test('ligne d’un marché : la case du cours en direct ne la fait pas grandir et laisse leur place aux boutons Oui / Non', async ({ page }) => {
    await ouvrir(page, { mode: 'demo', lang: 'fr' });
    const mesure = () => lire(page, () => [...document.querySelectorAll('#board .row:not(.grow)')].slice(0, 3).map(r => [Math.round(r.getBoundingClientRect().height), Math.round(r.querySelector('.acts').getBoundingClientRect().width)]));
    const avant = await mesure();
    await lire(page, () => document.querySelectorAll('.mlive').forEach(s => { s.textContent = '97 450,20 $'; }));
    expect(await mesure()).toEqual(avant);
    expect(await lire(page, () => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
});
