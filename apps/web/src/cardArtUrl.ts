/** Card art by card folder. The production build converts the PNGs to WebP (scripts/webp-art-plugin.ts), so the extension follows the build. */
export const cardArtUrl = (id: string) =>
  `/cards/${id}/data.${import.meta.env.PROD ? "webp" : "png"}`;
