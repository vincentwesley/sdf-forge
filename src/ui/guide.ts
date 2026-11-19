/** The illustrated user guide (built by scripts/make-guide.ts into public/guide/). */
export const GUIDE_URL = `${import.meta.env.BASE_URL}guide/sdf-forge-guide.pdf`;

export function openGuide() {
  window.open(GUIDE_URL, '_blank', 'noopener');
}
