import { describe, expect, it } from "vitest";
import { createSet, readSets, readAdventures, writeAdventure, type Repo } from "../src/lib/fs";
import type { AdventureDef } from "@realms/adventure";

class FakeFile {
  kind = "file" as const;
  data: string | Blob = "";
  constructor(public name: string) {}
  async getFile() {
    return new Blob([this.data]);
  }
  async createWritable() {
    return {
      write: async (value: string | Blob) => {
        this.data = value;
      },
      close: async () => {},
    };
  }
}
class FakeDir {
  kind = "directory" as const;
  entries = new Map<string, FakeDir | FakeFile>();
  constructor(public name = "root") {}
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    let entry = this.entries.get(name);
    if (!entry && options?.create) this.entries.set(name, (entry = new FakeDir(name)));
    if (!(entry instanceof FakeDir)) throw new Error("Not found");
    return entry;
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    let entry = this.entries.get(name);
    if (!entry && options?.create) this.entries.set(name, (entry = new FakeFile(name)));
    if (!(entry instanceof FakeFile)) throw new DOMException("Not found", "NotFoundError");
    return entry;
  }
  async *values() {
    yield* this.entries.values();
  }
}
const example: AdventureDef = {
  id: "test",
  revision: 1,
  faction: "bright-marches",
  name: { en: "Test" },
  premise: { en: "Journey" },
  start: "start",
  starterDeck: {},
  nodes: [],
  events: [],
  enemies: [],
  pools: {},
};

describe("adventure files", () => {
  it("writes and reopens definitions and artwork without removing existing artwork", async () => {
    const root = new FakeDir() as unknown as Repo;
    const first = new Blob(["first"], { type: "image/webp" });
    await writeAdventure(root, "test", example, { map: first });
    await writeAdventure(
      root,
      "test",
      { ...example, revision: 2 },
      { scene: new Blob(["second"], { type: "image/webp" }) },
    );
    const [loaded] = await readAdventures(root);
    expect(loaded.data.revision).toBe(2);
    expect(await loaded.art.map.text()).toBe("first");
    expect(await loaded.art.scene.text()).toBe("second");
  });
  it("refuses paths masquerading as an adventure or art name", async () => {
    const root = new FakeDir() as unknown as Repo;
    await expect(writeAdventure(root, "../outside", example, {})).rejects.toThrow();
    await expect(
      writeAdventure(root, "test", example, { "../outside": new Blob() }),
    ).rejects.toThrow();
  });
});

describe("set files", () => {
  it("creates and reloads a set without overwriting an existing one", async () => {
    const root = new FakeDir() as unknown as Repo;
    const set = {
      id: "test-set",
      name: "Test Set",
      code: "TST",
      description: "A test set",
      color: "#d4bd85",
      symbol: "⟐",
      factions: [],
      introduces: [],
    };
    await createSet(root, set);
    expect(await readSets(root)).toEqual([set]);
    await expect(createSet(root, { ...set, name: "Overwrite" })).rejects.toThrow(/already exists/);
    expect((await readSets(root))[0].name).toBe("Test Set");
  });
});
