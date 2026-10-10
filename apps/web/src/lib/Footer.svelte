<script lang="ts">
  // The result of the last change, and what can be done about it: Restart playback, Undo.
  // One fixed layout (a message area and a row for the buttons), so its height doesn't change
  // as "Switching…" turns into the result and Undo appears: the v2 mini bar sits on top of it.
  import type { ResultMessage } from "./result.ts";

  let {
    message,
    busy,
    undoAvailable,
    struggling = false,
    onrestart,
    onundo,
  }: {
    message: ResultMessage | null;
    busy: boolean;
    undoAvailable: boolean;
    /** HQPlayer is falling behind and Undo is there: stay, at full strength (the banner points here). */
    struggling?: boolean;
    onrestart: () => void;
    onundo: () => void;
  } = $props();

  // It goes 30 s after the last change (App keys it by the message, so each result starts
  // afresh); it stays while a change is running, and while HQPlayer struggles.
  let open = $state(false);
  $effect(() => {
    // From a local, not `open`: reading the state it sets made the timer's own close
    // re-run this effect, which reopened the bar and restarted the 30 s, for ever.
    const want = !!(message || undoAvailable);
    open = want;
    if (!want || busy) return;
    const t = setTimeout(() => (open = false), 30_000);
    return () => clearTimeout(t);
  });
  const show = $derived(open || struggling);
  /** Recede from 15 s (gone at 30 s); not while a change runs, nor while HQPlayer struggles. */
  const fade = $derived(!busy && !struggling);

  // Its height while shown, so the v2 mini bar (MiniBar.svelte) can sit above it.
  let height = $state(0);
  $effect(() => {
    document.documentElement.style.setProperty("--footer-h", show ? `${height}px` : "0px");
  });
</script>

<footer class:show class:fade bind:clientHeight={height}>
  <p class="msg {message?.kind ?? ''}">{message?.text ?? ""}</p>
  <div class="actions">
    {#if message?.restart}<button class="undo" onclick={onrestart} disabled={busy}>Restart playback</button>{/if}
    {#if undoAvailable}<button class="undo" onclick={onundo} disabled={busy}>Undo last change</button>{/if}
  </div>
</footer>

<style>
  footer {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 12px 16px max(12px, env(safe-area-inset-bottom));
    /* Opaque: the page underneath showed through and read as faded-out content. */
    background: var(--bg);
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    opacity: 0;
    transform: translateY(100%);
    pointer-events: none;
    transition:
      opacity 0.4s,
      transform 0.4s;
  }
  footer.show {
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }
  /* From 15 s it slowly recedes (owner's call): still there, still tappable; a touch or hover
     brings it back. One step at 15 s when the device asks for less motion. */
  footer.show.fade {
    animation: recede 15s linear 15s forwards;
  }
  footer.show.fade:hover,
  footer.show.fade:focus-within,
  footer.show.fade:active {
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    footer.show.fade {
      animation-duration: 1ms;
    }
  }
  @keyframes recede {
    to {
      opacity: 0.4;
    }
  }
  .msg {
    margin: 0;
    max-width: 34rem;
    text-align: center;
    font-size: 0.9rem;
    /* Two lines kept, so the common messages don't change its height. */
    min-height: 2.8em;
    display: flex;
    align-items: center;
  }
  /* Kept even when empty, so Undo appearing doesn't make it taller. */
  .actions {
    display: flex;
    gap: 8px;
    min-height: 44px;
  }
  .msg.ok {
    color: var(--ok);
  }
  .msg.warn {
    color: var(--warn);
  }
  .msg.error {
    color: var(--danger);
  }
  .msg.info {
    color: var(--text-dim);
  }
  .undo {
    font: inherit;
    font-weight: 600;
    /* Exactly the row's height, so the row is the same with or without it. */
    box-sizing: border-box;
    height: 44px;
    padding: 0 18px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg-elev);
    color: var(--accent-text);
    cursor: pointer;
  }
</style>
