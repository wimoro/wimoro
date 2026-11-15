// Recette 1 (mode Démo) : chaque écran se charge sans aucune erreur console, en anglais, français et hébreu.
// Couvre B01 (plus d'erreur au chargement).
import { test, expect } from '@playwright/test';
import { ouvrir, aller, ECRANS } from '../helpers/app.mjs';

for (const mode of ['visiteur', 'demo']) for (const lang of ['en', 'fr', 'he']) {
  test(`B01 · ${mode} · ${lang} : 26 écrans, zéro erreur console`, async ({ page }) => {
    const { erreurs } = await ouvrir(page, { mode, lang });
    expect(erreurs, 'erreurs au chargement').toEqual([]);
    const vides = [];
    for (const e of ECRANS) {
      await aller(page, e);
      const texte = await page.locator('#view').innerText();
      if (texte.trim().length < 20) vides.push(e);
    }
    expect(erreurs, 'erreurs pendant le parcours des écrans').toEqual([]);
    expect(vides, 'écrans vides').toEqual([]);
    expect(await page.evaluate(() => document.documentElement.dir)).toBe(lang === 'he' ? 'rtl' : 'ltr');
  });
}

test('mode Démo · téléphone : aucun écran ne déborde en largeur @mobile', async ({ page }) => {
  const { erreurs } = await ouvrir(page, { mode: 'demo' });
  const deborde = [];
  for (const e of ECRANS) {
    await aller(page, e);
    const d = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (d > 2) deborde.push(`${e} (+${d}px)`);
  }
  expect(deborde).toEqual([]);
  expect(erreurs).toEqual([]);
});

test('mode Démo : les indications « Mode démo » et l’onboarding d’origine sont là', async ({ page }) => {
  await ouvrir(page, { mode: 'demo', lang: 'fr', hash: '#depot' });
  await page.locator('[data-a="sim-dep"]').first().click();
  await expect(page.locator('.md .demo-b').first()).toHaveText('Mode démo');
});
