<script lang="ts">
  // Detail behind a "More" link under a setting (owner's review, 2026-10-09): one plain line
  // shows; the rest, the how and the caveats, is a tap away.
  import type { Snippet } from "svelte";
  let { children }: { children: Snippet } = $props();
</script>

<details class="more">
  <summary>More</summary>
  <div>{@render children()}</div>
</details>

<style>
  .more {
    margin: 4px 0 8px;
    font-size: 0.85rem;
    color: var(--text-dim);
  }
  summary {
    cursor: pointer;
    color: var(--accent-text);
    width: fit-content;
  }
  div {
    margin-top: 4px;
    line-height: 1.45;
  }
</style>
