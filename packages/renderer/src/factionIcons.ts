/** SVG files are the source of truth. Only path geometry is consumed, never executable/raw SVG markup. */
const sources = import.meta.glob("../../../assets/faction-icons/*.svg", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;
export const factionIconPaths: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  Object.entries(sources).map(([file, svg]) => {
    const id = file
      .split("/")
      .at(-1)!
      .replace(/\.svg$/, "");
    const paths = [...svg.matchAll(/<path\s+d="([^"]+)"\s*\/?>/g)].map((match) => match[1]);
    if (!paths.length || paths.some((path) => !/^[MmZzLlHhVvCcSsQqTtAaEe0-9.,+\-\s]+$/.test(path)))
      throw new Error(`Invalid faction icon geometry: ${id}`);
    return [id, paths];
  }),
);
