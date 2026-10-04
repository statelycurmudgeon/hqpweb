<script lang="ts">
  // A searchable picker for long lists (36–77 items). Opens as a bottom sheet.
  // Items can be disabled (with a reason) or carry a warning, e.g. "failed here before".
  // With HQPlayer 6, filters carry a rating, focus tags and a ratio rule, and
  // modulators a generation: shown as stars (ⓘ for details) or a "Gen" badge, with
  // chips to narrow the list and an optional grouping by rating.
  type Item = {
    index: number;
    name: string;
    disabled?: boolean;
    note?: string;
    warn?: string;
    rating?: number;
    tags?: string[];
    ratioText?: string;
    /** The rating and focus came from this HQPlayer, not our table. */
    fromHqp?: boolean;
    gen?: number;
  };
  let {
    label,
    items,
    current,
    hint = "",
    active = null,
    disabled = false,
    groupByRating = false,
    onpick,
  }: {
    label: string;
    items: Item[];
    current: string;
    hint?: string;
    /** true: HQPlayer reports this selection active; false: it doesn't; null: not applicable. */
    active?: boolean | null;
    disabled?: boolean;
    /** Sections by rating instead of HQPlayer's order (only when items have ratings). */
    groupByRating?: boolean;
    onpick: (item: Item) => void;
  } = $props();

  let dialog: HTMLDialogElement;
  let query = $state("");
  let search: HTMLInputElement;
  let chips = $state<Set<string>>(new Set());
  let openInfo = $state<number | null>(null);

  const rated = $derived(items.some((i) => i.rating !== undefined));
  const tagChips = $derived([...new Set(items.flatMap((i) => i.tags ?? []))].sort());
  const anyWarn = $derived(items.some((i) => i.warn || i.disabled));
  const toggle = (c: string) => {
    const next = new Set(chips);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    chips = next;
  };
  const shown = $derived(
    items.filter((i) => {
      const q = query.trim().toLowerCase();
      if (q && !i.name.toLowerCase().includes(q) && !(i.tags ?? []).some((t) => t.includes(q))) return false;
      if (chips.has("5/5") && i.rating !== 5) return false;
      if (chips.has("works here") && (i.warn || i.disabled)) return false;
      for (const t of tagChips) if (chips.has(t) && !(i.tags ?? []).includes(t)) return false;
      return true;
    }),
  );
  const groups = $derived(
    groupByRating && rated
      ? [5, 4, 3, 2, 1, 0]
          .map((r) => ({ rating: r, items: shown.filter((i) => (i.rating ?? 0) === r) }))
          .filter((g) => g.items.length)
      : [{ rating: -1, items: shown }],
  );
  const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);
  // HQPlayer's terse ratio wording, said plainly.
  const RATIO_WORDS: Record<string, string> = {
    Any: "any conversion ratio",
    "Any up": "any ratio, upsampling only",
    Int: "whole-number ratios",
    "Int up": "whole-number ratios, upsampling only",
    "2^x": "power-of-two ratios",
    "2^x up": "power-of-two ratios, upsampling only",
    "1:1": "no rate conversion",
  };

  function open() {
    query = "";
    openInfo = null;
    dialog.showModal();
    // Don't pop the keyboard on phones; do focus search on desktop.
    if (matchMedia("(pointer: fine)").matches) search.focus();
  }
  function pick(item: Item) {
    if (item.disabled) return;
    dialog.close();
    if (item.name !== current) onpick(item);
  }
</script>

<button class="row" onclick={open} {disabled}>
  <span class="label"
    >{label}{#if hint}<span class="hint">{hint}</span>{/if}</span
  >
  <span class="value">
    {#if active === true}<span class="taken" title="Active in HQPlayer">✓</span>{:else if active === false}<span
        class="not-taken"
        title="HQPlayer reports a different one active">⚠</span
      >{/if}
    {current || "—"}
  </span>
  <span class="chev" aria-hidden="true">›</span>
</button>

<dialog bind:this={dialog} onclick={(e) => e.target === dialog && dialog.close()}>
  <div class="sheet">
    <header>
      <h3>{label}</h3>
      <button class="close" onclick={() => dialog.close()} aria-label="Close">✕</button>
    </header>
    <input bind:this={search} bind:value={query} type="search" placeholder="Search {items.length}…" autocomplete="off" />
    {#if rated || anyWarn}
      <div class="chips" role="group" aria-label="Narrow the list">
        {#if rated}
          <button class:on={chips.has("5/5")} aria-pressed={chips.has("5/5")} onclick={() => toggle("5/5")}>★ 5/5</button>
          {#each tagChips as t (t)}
            <button class:on={chips.has(t)} aria-pressed={chips.has(t)} onclick={() => toggle(t)}>{t}</button>
          {/each}
        {/if}
        {#if anyWarn}
          <button class:on={chips.has("works here")} aria-pressed={chips.has("works here")} onclick={() => toggle("works here")}
            >✓ works here</button
          >
        {/if}
      </div>
    {/if}
    <ul>
      {#each groups as g (g.rating)}
        {#if g.rating >= 0}<li class="group">
            {g.rating ? stars(g.rating) : "Not rated"} <small>({g.items.length})</small>
          </li>{/if}
        {#each g.items as item (item.index)}
          {@const info = item.tags?.length || item.ratioText}
          <li>
            <div class="item">
              <button
                class="main"
                class:current={item.name === current}
                class:warn={!!item.warn}
                disabled={item.disabled}
                onclick={() => pick(item)}
              >
                <span class="name">
                  {item.name}
                  {#if item.warn}<small class="why">⚠ {item.warn}</small>{:else if item.note}<small class="why">{item.note}</small
                    >{/if}
                </span>
                {#if item.rating !== undefined && !(groupByRating && rated)}<span class="stars" aria-label="{item.rating} of 5"
                    >{stars(item.rating)}</span
                  >{/if}
                {#if item.gen !== undefined}<span class="gen" title="Modulator generation">Gen{item.gen}</span>{/if}
                {#if item.name === current}<span class="tick">✓</span>{/if}
              </button>
              {#if info}
                <button
                  class="info"
                  aria-label="Details for {item.name}"
                  aria-expanded={openInfo === item.index}
                  onclick={() => (openInfo = openInfo === item.index ? null : item.index)}>ⓘ</button
                >
              {/if}
            </div>
            {#if info && openInfo === item.index}
              <p class="details">
                {#if item.tags?.length}Favours {item.tags.join(", ")}.{/if}
                {#if item.ratioText}Works with {RATIO_WORDS[item.ratioText] ?? item.ratioText}.{/if}
                {#if item.fromHqp}<span class="src">(HQPlayer's description)</span>{/if}
              </p>
            {/if}
          </li>
        {/each}
      {:else}
        <li class="empty">No match</li>
      {/each}
    </ul>
  </div>
</dialog>

<style>
  .row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 14px 16px;
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row:disabled {
    opacity: 0.5;
    cursor: progress;
  }
  .row:not(:last-child) {
    border-bottom: 1px solid var(--border);
  }
  .label {
    color: var(--text-dim);
    white-space: nowrap;
  }
  .hint {
    margin-left: 6px;
    font-size: 0.72rem;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent-text);
    vertical-align: 1px;
  }
  .value {
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }
  .chev {
    color: var(--text-dim);
    font-size: 1.3rem;
    line-height: 1;
  }
  .taken {
    color: var(--ok);
    font-weight: 700;
    margin-right: 4px;
  }
  .not-taken {
    color: var(--warn);
    margin-right: 4px;
  }

  dialog {
    padding: 0;
    border: 0;
    background: transparent;
    width: min(100%, 34rem);
    max-width: 100%;
    max-height: 100%;
    margin: auto auto 0;
    color: var(--text);
  }
  @media (min-width: 40rem) {
    dialog {
      margin: auto;
    }
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.45);
  }
  .sheet {
    background: var(--bg-elev);
    border-radius: 16px 16px 0 0;
    display: flex;
    flex-direction: column;
    max-height: 80vh;
    padding-bottom: env(safe-area-inset-bottom);
  }
  @media (min-width: 40rem) {
    .sheet {
      border-radius: 16px;
    }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 6px;
  }
  h3 {
    margin: 0;
    font-size: 1rem;
  }
  .close {
    background: none;
    border: 0;
    color: var(--text-dim);
    font-size: 1rem;
    padding: 6px;
    cursor: pointer;
  }
  input {
    margin: 6px 16px 10px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: inherit;
    font: inherit;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 0 8px;
    overflow-y: auto;
  }
  li .main {
    width: 100%;
    display: flex;
    justify-content: space-between;
    padding: 12px 16px;
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  li .main:hover {
    background: var(--bg-elev-2);
  }
  li .main.current {
    color: var(--accent-text);
    font-weight: 600;
  }
  li .main:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .name {
    display: flex;
    flex-direction: column;
  }
  .why {
    font-size: 0.78rem;
    color: var(--text-dim);
    font-weight: 400;
  }
  li .main.warn .why {
    color: var(--warn);
  }
  .empty {
    padding: 12px 16px;
    color: var(--text-dim);
  }
  .item {
    display: flex;
    align-items: stretch;
  }
  .item .main {
    flex: 1;
    min-width: 0;
    align-items: center;
    gap: 8px;
  }
  .stars {
    color: var(--accent-text);
    font-size: 0.8rem;
    letter-spacing: 1px;
    white-space: nowrap;
  }
  .gen {
    font-size: 0.7rem;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--bg-elev-2);
    color: var(--text-dim);
  }
  .info {
    background: none;
    border: 0;
    color: var(--text-dim);
    padding: 0 14px;
    cursor: pointer;
    font-size: 1rem;
  }
  .details {
    margin: 0;
    padding: 0 16px 10px;
    font-size: 0.82rem;
    color: var(--text-dim);
  }
  .details .src {
    opacity: 0.7;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0 16px 8px;
  }
  .chips button {
    font: inherit;
    font-size: 0.8rem;
    padding: 5px 10px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
  }
  .chips button.on {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .group {
    padding: 10px 16px 4px;
    font-size: 0.8rem;
    color: var(--accent-text);
    letter-spacing: 1px;
  }
  .group small {
    color: var(--text-dim);
    letter-spacing: 0;
  }
</style>
