<script lang="ts">
  // The "show only" bar of the v2 pickers (docs/design-v2-layout.md rule 2): loose chips
  // to toggle, families as one drop-down each (chips.ts grouped), then a count. Folded
  // behind "Narrow" (owner's review, 2026-10-09): seven controls before the first filter
  // pushed the list halfway down a phone. Open while any is chosen.
  import type { SvelteSet } from "svelte/reactivity";
  import Chip from "./Chip.svelte";
  import { chooseInGroup, type grouped } from "./chips.ts";

  let {
    offered,
    keys,
    count,
  }: {
    offered: ReturnType<typeof grouped>;
    /** The chosen keys; changed in place. */
    keys: SvelteSet<string>;
    count: string;
  } = $props();

  let unfolded = $state(false);
  const open = $derived(unfolded || keys.size > 0);
  const chosen = (prefix: string) => [...keys].find((k) => k.startsWith(prefix)) ?? "";
  function toggle(key: string) {
    if (keys.has(key)) keys.delete(key);
    else keys.add(key);
  }
</script>

<div class="bar">
  <button class="narrow" aria-expanded={open} disabled={keys.size > 0} onclick={() => (unfolded = !unfolded)}
    >Narrow{keys.size ? ` · ${keys.size}` : ""} <span aria-hidden="true">{open ? "▴" : "▾"}</span></button
  >
  <span class="count">{count}</span>
</div>
{#if open}<div class="facets" role="group" aria-label="Show only">
    {#each offered.chips as f (f.key)}
      <Chip kind={f.kind} label={f.label} pressed={keys.has(f.key)} onclick={() => toggle(f.key)} />
    {/each}
    {#each offered.groups as g (g.prefix)}
      <span class="sel" class:on={!!chosen(g.prefix)}>
        <select
          class="group"
          aria-label={g.label}
          value={chosen(g.prefix)}
          onchange={(e) => chooseInGroup(keys, g.prefix, e.currentTarget.value)}
        >
          <option value="">{g.label}: any</option>
          {#each g.options as o (o.key)}<option value={o.key}>{o.label}</option>{/each}
        </select>
      </span>
    {/each}
  </div>{/if}

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }
  .narrow {
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    min-height: 36px;
    padding: 0 14px;
    border-radius: 18px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
  }
  .narrow:disabled {
    cursor: default;
    opacity: 1;
  }
  .facets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  /* Drawn like a chip (Chip.svelte), with our own arrow: iOS draws its own select shorter. */
  .sel {
    position: relative;
    display: inline-flex;
    color: var(--text);
  }
  .sel::after {
    content: "";
    position: absolute;
    right: 12px;
    top: 50%;
    width: 6px;
    height: 6px;
    margin-top: -5px;
    border-right: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
    transform: rotate(45deg);
    pointer-events: none;
  }
  .group {
    appearance: none;
    -webkit-appearance: none;
    box-sizing: border-box;
    height: 36px;
    margin: 0;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    line-height: 1;
    padding: 0 30px 0 12px;
    border-radius: 18px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: inherit;
    cursor: pointer;
  }
  .sel.on {
    color: var(--bg);
  }
  .sel.on .group {
    background: var(--text);
    border-color: var(--text);
  }
  .count {
    font-size: 0.8rem;
    color: var(--text-dim);
  }
</style>
