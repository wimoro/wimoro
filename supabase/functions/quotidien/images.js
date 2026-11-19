// Images des marchés : choix de la vignette chez Wikimedia Commons, contrôle de la licence, réduction en 128 × 128.
// Module pur (aucun appel réseau, aucune bibliothèque) : l'Edge Function décode et encode avec ImageScript, et ce module
// fait le recadrage et la réduction par moyenne des pixels (meilleure que le « plus proche voisin » d'ImageScript).
export const COTE = 128;
export const MAX_OCTETS = 15000;
// Wikimedia ne sert les vignettes qu'à certaines largeurs (les autres sont refusées aux robots) : 120, 250, 330, 500…
export const LARGEURS = [120, 250, 330, 500, 960];
export const largeurPour = genre => (genre === 'photo' ? 330 : 250);

export const urlImageinfo = (fichier, largeur) => 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=1&prop=imageinfo'
  + '&iiprop=url|mime|size|extmetadata&iiurlwidth=' + largeur + '&titles=' + encodeURIComponent(fichier);

// Fichiers libres seulement : domaine public, CC0, CC BY, CC BY-SA, GFDL, licences d'attribution des institutions (Parlement
// européen, gouvernements) ; jamais un fichier « non libre » (fair use) ni une licence non commerciale ou sans modification.
export function licenceLibre(credit) {
  const l = String(credit?.licence || '').toLowerCase();
  if (!l || /fair use|non-free|nonfree|\bnc\b|non[- ]?commercial|\bnd\b|no deriv/.test(l)) return false;
  return /public domain|domaine public|\bpd(-|\b)|cc0|cc[- ]?by|attribution|gfdl|no restrictions|copyrighted free use|european parliament|\bogl\b/.test(l);
}

export const nomFichier = (sha, mime) => 'img/' + sha + (mime === 'image/png' ? '.png' : '.jpg');

/** Rectangle source à garder pour couvrir un carré (photo) : le centre, légèrement remonté (visages). */
export function rectangleCouverture(sw, sh) {
  const c = Math.min(sw, sh);
  const x = Math.floor((sw - c) / 2);
  const y = sh > sw ? Math.floor((sh - c) * 0.25) : Math.floor((sh - c) / 2);
  return { x, y, w: c, h: c };
}

/** Réduction par moyenne des pixels (RGBA) d'un rectangle source vers tw × th. Prémultiplie l'alpha (pas de halo). */
export function reduire(src, sw, sh, r, tw, th) {
  const out = new Uint8ClampedArray(tw * th * 4);
  const fx = r.w / tw, fy = r.h / th;
  for (let ty = 0; ty < th; ty++) {
    const y0 = r.y + ty * fy, y1 = y0 + fy;
    for (let tx = 0; tx < tw; tx++) {
      const x0 = r.x + tx * fx, x1 = x0 + fx;
      let a = 0, rr = 0, gg = 0, bb = 0, poids = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        if (y < 0 || y >= sh) continue;
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          if (x < 0 || x >= sw) continue;
          const w = (Math.min(x + 1, x1) - Math.max(x, x0)) * wy;
          const i = (y * sw + x) * 4, al = src[i + 3] / 255;
          rr += src[i] * al * w; gg += src[i + 1] * al * w; bb += src[i + 2] * al * w; a += al * w; poids += w;
        }
      }
      const o = (ty * tw + tx) * 4;
      if (a > 0) { out[o] = rr / a; out[o + 1] = gg / a; out[o + 2] = bb / a; }
      out[o + 3] = poids > 0 ? (a / poids) * 255 : 0;
    }
  }
  return out;
}

/** Une image réduite posée au centre d'un carré transparent (logo : il garde ses proportions, avec une marge). */
export function poser(px, w, h, cote = COTE) {
  const out = new Uint8ClampedArray(cote * cote * 4);
  const ox = Math.floor((cote - w) / 2), oy = Math.floor((cote - h) / 2);
  for (let y = 0; y < h; y++) out.set(px.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * cote + ox) * 4);
  return out;
}

/** Les pixels finaux (128 × 128, RGBA) d'une image source : logo contenu avec une marge de 4 px, photo recadrée. */
export function vignette(src, sw, sh, genre) {
  if (genre === 'photo') return reduire(src, sw, sh, rectangleCouverture(sw, sh), COTE, COTE);
  const place = COTE - 8, k = Math.min(place / sw, place / sh, 1);
  const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
  return poser(reduire(src, sw, sh, { x: 0, y: 0, w: sw, h: sh }, w, h), w, h);
}

/** Pose une image sur un fond blanc (pour un JPEG, qui n'a pas de transparence). */
export function aplatir(px) {
  const out = new Uint8ClampedArray(px.length);
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3] / 255;
    out[i] = px[i] * a + 255 * (1 - a); out[i + 1] = px[i + 1] * a + 255 * (1 - a); out[i + 2] = px[i + 2] * a + 255 * (1 - a); out[i + 3] = 255;
  }
  return out;
}
