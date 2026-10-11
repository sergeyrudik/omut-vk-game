import type { GameSave } from "./game-engine";

type PersistResult = { value: string | null; external: GameSave | null; previous?: GameSave; localWritten?: boolean };
type Options = {
  read: () => string | null;
  write: (value: string) => boolean;
  parse: (value: string | null) => GameSave;
  serialize: (save: GameSave) => string;
  withLock?: (run: () => Promise<PersistResult>) => Promise<PersistResult>;
};

// Compare the exact storage snapshot, rather than generating a newer timestamp
// for an old in-memory save. Web Locks serialize cooperating browser tabs.
export function createSaveCoordinator(options: Options) {
  let observed: string | null = null;
  let generation = 0;
  let committed: GameSave | null = null;
  const initialize = (raw: string | null, initial?: GameSave) => {
    observed = raw;
    committed = initial ?? null;
  };
  const refresh = (): GameSave | null => {
    const raw = options.read();
    if (raw === observed) return null;
    observed = raw;
    generation += 1;
    committed = options.parse(raw);
    return committed;
  };
  const persist = async (save: GameSave): Promise<PersistResult> => {
    const expectedGeneration = generation;
    const run = async (): Promise<PersistResult> => {
      const external = refresh();
      if (external) return { value: null, external };
      // An external change also invalidates writes already waiting for the lock.
      if (expectedGeneration !== generation) return { value: null, external: committed };
      // Adopting a storage event must not echo it back with a fresh timestamp.
      if (save === committed) return { value: null, external: null };
      // Snapshot persistence is only for initialization. Once a transaction or
      // external update happened, mutations must use transact, never old renders.
      if (generation > 0 && committed) return { value: null, external: committed };
      const value = options.serialize(save);
      const localWritten = options.write(value);
      if (localWritten) observed = value;
      committed = save;
      return { value, external: null, localWritten };
    };
    return options.withLock ? options.withLock(run) : run();
  };
  const transact = async (transform: (current: GameSave) => GameSave | null): Promise<PersistResult> => {
    const run = async (): Promise<PersistResult> => {
      const current = refresh() ?? committed ?? options.parse(options.read());
      const next = transform(current);
      if (!next) return { value: null, external: current, previous: current };
      // Older snapshot effects may still be queued; they cannot undo this action.
      generation += 1;
      const value = options.serialize(next);
      const localWritten = options.write(value);
      if (localWritten) observed = value;
      committed = next;
      return { value, external: next, previous: current, localWritten };
    };
    return options.withLock ? options.withLock(run) : run();
  };
  return { initialize, refresh, persist, transact };
}
