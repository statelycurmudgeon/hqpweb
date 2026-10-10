<script lang="ts">
  // Lining the meter up by ear, its own screen (owner's call): first the phone clicks and you
  // tap (your reaction time); then hqpweb plays six claps through HQPlayer and you tap each.
  // The answer is how long after a clap reaches the meter you heard it (meter-calibrate.ts).
  import { api } from "./api.ts";
  import { CLAP_OPTIONS, CLICK_GAPS_S, calibrate, reactionMs } from "./meter-calibrate.ts";
  import { meterDelayMs } from "./meter-delay.ts";
  import { OnsetDetector } from "./meter-onset.ts";

  let {
    instanceId,
    outputDelayMs,
    onresult,
  }: {
    instanceId: string;
    /** HQPlayer's output buffer as last seen; the claps' own reading replaces it (stopped, it reports none). */
    outputDelayMs: number | null;
    /** The wait found, and HQPlayer's buffer while the claps played: the nudge is set against that. */
    onresult: (delayMs: number, outputDelayMs: number | null) => void;
  } = $props();

  let dialog: HTMLDialogElement;
  type Step = "intro" | "reaction" | "claps" | "done" | "failed";
  let step = $state<Step>("intro");
  let message = $state("");
  let taps: number[] = [];
  let tapCount = $state(0);
  let rt = $state<number | null>(null);
  let ctx: AudioContext | null = null;
  let stopMeter: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  export function open() {
    step = "intro";
    message = "";
    dialog.showModal();
  }
  function close() {
    cleanup();
    dialog.close();
  }
  function cleanup() {
    clearTimeout(timer);
    stopMeter?.();
    stopMeter = null;
    void ctx?.close();
    ctx = null;
  }
  const tap = (e: PointerEvent) => {
    taps.push(e.timeStamp);
    tapCount = taps.length;
  };

  /** Step 1: six clicks from this phone (as many as the claps) at uneven gaps; the median tap after each is your reaction time. */
  function startReaction() {
    cleanup();
    step = "reaction";
    taps = [];
    tapCount = 0;
    ctx = new AudioContext();
    const c = ctx;
    const clicks: number[] = [];
    let at = c.currentTime + 1;
    for (const gap of CLICK_GAPS_S) {
      at += gap;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.frequency.value = 1000;
      gain.gain.setValueAtTime(0.3, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.03);
      osc.connect(gain).connect(c.destination);
      osc.start(at);
      osc.stop(at + 0.04);
      // When it's heard, on the page's clock (the same as a tap's timeStamp).
      const latency = (c.outputLatency || c.baseLatency || 0) * 1000;
      clicks.push(performance.now() + (at - c.currentTime) * 1000 + latency);
    }
    timer = setTimeout(
      () => {
        rt = reactionMs(clicks, taps);
        if (rt === null) fail("That didn't catch enough clicks. Try again, tapping as soon as you hear each one.");
        else void startClaps();
      },
      (at - c.currentTime + 1.2) * 1000,
    );
  }

  /** Step 2: the claps through HQPlayer; hits from the undelayed meter, taps less your reaction time. */
  async function startClaps() {
    step = "claps";
    taps = [];
    tapCount = 0;
    const onsets: number[] = [];
    const detector = new OnsetDetector();
    stopMeter = api.meter(instanceId, (m) => {
      const now = performance.now();
      if (m.live && m.levels && detector.feed(now, Math.max(...m.levels.map((l) => l[1] ?? -120)))) onsets.push(now);
    });
    let track;
    try {
      track = await api.calibrate(instanceId);
    } catch (e) {
      return fail((e as Error).message);
    }
    const buffer = track.outputDelayMs ?? outputDelayMs;
    const prior = meterDelayMs(buffer, 0);
    timer = setTimeout(
      () => {
        stopMeter?.();
        const r = calibrate(
          onsets,
          taps.map((t) => t - rt!),
          { priorMs: prior, ...CLAP_OPTIONS },
        );
        if (!r.ok) return fail(`${r.reason} (The meter caught ${onsets.length} claps; you tapped ${taps.length} times.)`);
        result = r;
        step = "done";
        onresult(r.delayMs, buffer);
      },
      track.trackMs + prior + 3000,
    );
  }

  let result = $state<{ delayMs: number; matched: number } | null>(null);
  function fail(why: string) {
    cleanup();
    message = why;
    step = "failed";
  }
</script>

<dialog bind:this={dialog} class="sheet" aria-label="Line up the meter" onclose={cleanup}>
  <div class="head">
    <h3>Line up the meter</h3>
    <button class="done" onclick={close}>{step === "done" ? "Done" : "Cancel"}</button>
  </div>
  {#if step === "intro"}
    <p>Two short steps, about 40 seconds:</p>
    <ol>
      <li>This phone clicks six times: tap as soon as you hear each click.</li>
      <li>hqpweb plays six claps through HQPlayer: tap as soon as you hear each one from your speakers.</li>
    </ol>
    <p class="note">
      The claps stop whatever is playing; press Play in Roon (or your player) afterwards. Use the phone's own speaker, not
      Bluetooth headphones. HQPlayer fetches the clap track from hqpweb's GitHub (or from hqpweb itself, if it can't reach
      GitHub).
    </p>
    <button class="go" onclick={startReaction}>Start</button>
  {:else if step === "reaction" || step === "claps"}
    <p class="now">
      {step === "reaction"
        ? "Step 1 of 2: tap when this phone clicks."
        : "Step 2 of 2: tap when you hear each clap from your speakers."}
    </p>
    <button class="pad" onpointerdown={tap}>Tap<span>{tapCount ? `${tapCount} tapped` : " "}</span></button>
  {:else if step === "done" && result}
    <p class="now">The meter now waits {(result.delayMs / 1000).toFixed(2)} s.</p>
    <p class="note">
      From {result.matched} of 6 claps, less your reaction time ({((rt ?? 0) / 1000).toFixed(2)} s). Earlier and Later fine-tune it.
      Press Play in Roon (or your player) to carry on.
    </p>
    <button class="go" onclick={startReaction}>Try again</button>
  {:else}
    <p class="now">{message}</p>
    <button class="go" onclick={startReaction}>Try again</button>
  {/if}
</dialog>

<style>
  .sheet {
    border: 0;
    border-radius: 18px;
    padding: 16px;
    width: min(28rem, 100vw - 24px);
    max-height: 92vh;
    background: var(--bg-elev);
    color: var(--text);
  }
  .sheet::backdrop {
    background: var(--bg-veil);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  h3 {
    margin: 0;
  }
  .done,
  .go {
    font: inherit;
    min-height: 44px;
    padding: 0 18px;
    border-radius: 22px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
  }
  .go {
    margin-top: 8px;
    background: var(--accent);
    color: var(--on-accent);
    border: 0;
  }
  .note {
    color: var(--text-dim);
    font-size: 0.88rem;
  }
  .now {
    font-weight: 600;
  }
  .pad {
    width: 100%;
    height: 40vh;
    min-height: 220px;
    margin-top: 8px;
    border: 0;
    border-radius: 18px;
    background: var(--accent-soft);
    color: var(--accent-text);
    font: inherit;
    font-size: 2rem;
    font-weight: 700;
    touch-action: manipulation;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .pad span {
    font-size: 0.9rem;
    font-weight: 500;
  }
  .pad:active {
    background: var(--accent);
    color: var(--on-accent);
  }
</style>
