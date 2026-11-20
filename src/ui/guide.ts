/** The illustrated user guide (built by scripts/make-guide.ts into public/guide/). */
export const GUIDE_URL = `${import.meta.env.BASE_URL}guide/sdf-forge-guide.pdf`;

export function openGuide() {
  window.open(GUIDE_URL, '_blank', 'noopener');
}

/** The live site (credit links in embeds point here). */
export const SITE_URL = 'https://vincentwesley.github.io/sdf-forge/';
