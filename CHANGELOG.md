# Changelog

Versions follow [semantic versioning](https://semver.org). Before 1.0, any release
may change behaviour; upgrade notes say what you need to do.

## Unreleased

Changes since the last release are notes in [`changes/`](changes/), one file per change; a
release gathers them here (`tools/release/changes.ts`).

## 0.1.0-beta.6 — the new layout for everyone, filters that fit, and calmer mode switches

**Update:** `docker compose pull && docker compose up -d`. Settings, presets and history
are kept. The new layout is now everyone's; the earlier one is Settings → Appearance →
"Classic layout", per device. If you set the meter's timing by ear before, set it again: the
meter now holds a fixed time in PCM and DSD.

### Added

- **Filters that fit, and what it would take.** In the filter sheet, filters that won't
  play as set (a ratio they can't do, a failure here, or trouble inferred from one) move
  below "Won't fit your settings", each with why. Load is only ever what this machine measured;
  inference goes through a short, sourced list of what's no heavier than what (e.g.
  sinc-Lh is about an eighth of sinc-L's load), so if sinc-Lh couldn't keep up, sinc-L is
  flagged too. Picking one asks first ("Try anyway?"). "What would it take?" offers the
  fewest changes to the modulator or rate that would let it play, with either kept if you
  like, nearest and lightest first.
- **An (i) on every filter.** Each filter in the pickers has a short note on what it's
  like (its family, its own character, phase, two-stage), paraphrased from HQPlayer 6's
  help and manual, with Jussi Laako's forum remarks where he's been specific, every line
  cited and his older posts marked "possibly dated". The filter sheet's title has one on
  the two slots: 1x for CD-rate sources, Nx for the rest, HQPlayer's defaults, and the
  Apod counter rule. Characters, not a ranking.
- **Control over the filter sort.** Settings → HQPlayer → Learned performance has "Sort filters by what's
  worked here" (on by default; off gives one plain list with no questions), and a slider:
  "Forget load results older than" a week, a month, 3 months (default), 6 months, a year,
  or never. Older results are ignored, not deleted. Beside a failure in the filter sheet,
  "Forget this" clears that one record (and anything inferred from it). Inferred trouble
  now reads as a guess: "Probably won't keep up here: sinc-Lh couldn't, and this is no
  lighter (…)".
- **The guide hands over to filters.** Its last step has a Filters → button
  beside Done, which closes the guide and opens the filter sheet for the slot in use, with
  a line on where to start: HQPlayer's defaults, then your ears.
- **A fuller install guide** ([docs/install.md](docs/install.md)): where your settings
  live and how to back them up, the ports hqpweb uses (the meter needs TCP 4322),
  options, reverse proxies (nginx and Caddy; both live streams, now playing and the
  meter, must not be buffered), running without Docker, and what to check when
  something doesn't work. The README keeps a short quick start.
- **Line the meter up by ear.** In Settings → Listening (the meter's (i) links there), "Line up by ear…" opens a
  short two-step screen: the phone clicks six times and you tap (your reaction time), then
  hqpweb plays six claps through HQPlayer and you tap each one you hear from your speakers.
  hqpweb works out how long after a clap reaches the meter you heard it, less your reaction
  time, and sets the meter's wait to match. It stops what's playing; press Play again after.
  HQPlayer fetches the clap track from hqpweb's GitHub, or from hqpweb itself if it can't.
- **The meter keeps the same timing in PCM and DSD.** hqpweb held back a fixed number of
  meter frames, about 0.33 s in PCM but much less in DSD (more frames a second), so the
  meter's lag shifted by up to ~0.4 s when you changed mode. It now holds a fixed time. If
  you set the meter's timing by ear before, set it again.
- **Volume after HQPlayer restarts.** HQPlayer comes back from a restart at its saved
  volume, which can be louder than you left it. In Settings → Listening you can set a cap
  per HQPlayer: when hqpweb sees HQPlayer stop answering and come back at a different,
  louder volume, it turns it down to the cap, about a second after HQPlayer answers again
  (measured on a real restart), and notes it in History. It never raises the volume, and a
  network blip that leaves the volume alone is left alone. It works only while hqpweb is
  running; with a cap set, hqpweb checks HQPlayer once a second even with no page open.
  Off by default.

### Changed

- **The new layout is the layout.** One card for the signal path, meters, Compare,
  History, the guide as a flow and the filter sort, on phones and laptops. Everyone moves
  to it, including anyone who never switched it on. The earlier layout stays, for now, as
  an opt-in: Settings → Appearance → "Classic layout", per device. Its filter order
  ("Grouped by rating") shows only there.
- **Calmer, more finished.** Compare, History and Presets are rows of one card, like the
  signal card's. Section labels are sentence case, not capitals. When every filter or
  modulator in a narrowed list shares a fact (all apodizing, say), it's said once by the
  count instead of on every row. The meter's (i) says one line about the view, with the rest
  behind More, and timing is its own row; before the first frames it says it's lining up,
  not an empty box. Sheets rise in gently and rows answer a press (not when the device asks
  for less motion). In the guide, Done is the one filled button. The result bar fades from
  15 s and goes at 30 s; a touch brings it back, and it stays while HQPlayer is struggling.
- **The meter's (i) is two lines:** what the view shows, and how long it waits, with a
  link to Settings, where you line it up by ear. Earlier, Later and the beat dot are gone.
- **Settings has four tabs:** HQPlayer (your HQPlayers, DAC answers, learned failures),
  Listening (volume buttons, the restart cap), Appearance (theme, layout) and
  Roon.
- **Simpler to read and use.** One guide: the Modulator and Dither sheets are the list, with
  "Not sure where to start? Guide me" opening the step-by-step guide (no List/Guide tabs in
  the new layout). The filter and modulator lists open straight onto the list; their
  narrowing controls sit behind **Narrow**, which shows how many are on. Settings says each
  thing in a line, with the detail behind **More**. "Meter unavailable" replaces a technical
  note, with the reason a tap away. On a laptop the meter starts open, until you close it.
  Plainer words: "Fits your settings" / "Won't fit your settings", History's "Elsewhere",
  "Your answers are saved", and "In DSD, Auto picks the highest rate on offer".
- **Switching mode is calmer to watch.** While a switch runs, the now card and the mini bar
  say "Switching" and hold still, instead of showing each step HQPlayer passes through
  (paused, stopped, paused again); play and pause wait until it's done. Once the music is
  back, the footer says it's checking playback. The footer keeps one height as the result and
  Undo appear, so the mini bar above it no longer jumps, and it doesn't start fading while a
  long switch is still running.

### Fixed

- **History no longer logs HQPlayer's start-up as changes.** Right after a restart
  HQPlayer passes through other states (its mode flipping within a second); hqpweb now
  waits 10 s before it compares settings again.
- **The meter no longer drops short peaks.** hqpweb shows about 20 updates a second of
  HQPlayer's 43 (PCM) to 180 (DSD) meter frames; each update now carries the loudest peak
  of the frames it stands for, so drum hits show.
- **Switching back into DSD no longer fails when the remembered rate can't play.** A mode
  switch brings back the rate last used in that mode. If the modulator HQPlayer comes back
  with can't play at that rate (AHM modulators stop below DSD1024), hqpweb now leaves the
  rate out and keeps HQPlayer's own, instead of switching, stalling and rolling back. Seen with
  two HQPlayer engines on one machine, where the remembered rate came from the other engine.
- **Switching mode no longer crashes HQPlayer Embedded.** Switching between PCM and DSD
  while music played, or was paused, could crash Embedded 6.2.5 (measured: paused, 1 of 2
  tries crashed; stopped, none of 3). hqpweb now stops HQPlayer first (pausing Roon first
  when its zone is linked), switches, then carries on: Roon is played again until it's
  playing, and HQPlayer's own playlist plays and seeks back to where it was. It takes a
  while, up to about 20 seconds of silence, and the switch sheet and footer say so.
- **The result bar goes away again.** It was meant to leave 30 s after a change, but its own
  timer reopened it each time, so it (and Undo) stayed for good.
- **Settings no longer jumps between tabs.** The sheet's top edge stays where it is when
  you switch tabs, and About follows each tab's content instead of being squeezed at the bottom.
- **A filter HQPlayer is slow to build no longer fools the check.** Switching to a very
  long filter (sinc-L, measured on a Mac) can leave HQPlayer answering nothing for ~10 s
  and the music silent for longer. hqpweb gave up on the check as "inconclusive". It now
  waits HQPlayer out, judges playback once it answers, and remembers the filter: the sheet
  shows "⏳ slow to switch here (9 s)" and asks before you switch to it again. A warning,
  never a block.

## 0.1.0-beta.5 — a new layout to try, a meter, Compare and a guided flow

**Update:** `docker compose pull && docker compose up -d`. Settings, presets and history
are kept. The new layout is a preview, off by default: Settings → Try the new layout.
Its meter needs HQPlayer's meter port (the control port + 1) reachable from hqpweb.

### Added

- **Width and Dynamics views in the meter.** Width shows, band by band, how alike left and
  right are: no bar is mono, a long bar wide, and red out of phase (hqpweb now sends each
  band's left/right correlation). Dynamics shows the last 30 s of loudness and peaks, with
  the crest factor: small for compressed music, large for dynamic.
- **A Stereo view in the meter.** Left grows to the left of a centre line and right to the
  right, low notes at the bottom, each side with its peak held then falling back: where
  the channels differ, band by band.
- **The meter lines up with what you hear.** HQPlayer's meter shows the music before its
  output buffer, so it ran ahead of the room by about that buffer, which is set in
  HQPlayer. The meter now waits HQPlayer's reported output delay (less hqpweb's own lag),
  and the (i) panel has Earlier and Later to set it by ear for the DAC and network, saved
  per HQPlayer on this device.
- **Guide me as a flow, in the new layout.** The button on the signal card opens the guide
  full height, one question at a time: your DAC, amplifier and volume, then where to start
  (in PCM: your DAC, the connection, then where to start), with Back and Next. Next waits
  for an answer; opened again, it starts at the first question left. "Switch to PCM" from
  the guide carries on with the dither guide. Its questions, wording and advice are the
  guide's own; only where it sends you to change the rate or mode now names the card,
  where those live in this layout.
- **Compare, in the new layout.** A button below the signal card opens two full settings
  cards side by side: A as it was playing, B to choose (mode, filters, modulator or
  dither, rate), and a preset can be loaded into either. The big A and B buttons switch
  what plays; which one you're hearing is read back from HQPlayer, not assumed. It says
  what a switch costs (a pause across modes, a gap across rates) and that levels aren't
  matched between DSD and PCM. Keep A, Keep B, or save B as a preset. A mode hqpweb hasn't
  seen on this HQPlayer yet offers its last-seen settings only, and says so.
- **hqpweb remembers each mode's lists.** HQPlayer only lists the filters, modulators or
  dithers and rates of the mode in use. hqpweb now keeps each mode's lists, by name, as it
  last read them on that HQPlayer and engine, so the other mode's choices can be offered
  before switching (for Compare). Kept in `history.json`.
- **hqpweb remembers what kept up here.** While hqpweb is open and music plays, it notes
  how fast HQPlayer processed each combination once settled (it skips the first seconds,
  which are often slow, and keeps the lowest 5-second average), per DAC and source rate.
  The new layout's pickers show it ("✓ kept up here (2.1×)"). Failures now also record the
  source rate they happened with. Both are kept in `learned.json`; older files load as
  before.
- **A change history, and each mode's last settings.** hqpweb now logs every change: its
  own (with before, after and how playback went, including rollbacks), undos, presets, and
  changes made elsewhere, such as in HQPlayer's own window (volume aside). It also
  remembers each mode's settings as last seen, per DAC, because HQPlayer only reports the
  mode in use. Kept in `history.json`; the new layout's History shows them. `GET
/api/instances/:id/history`.
- **A preview of the new layout** (Settings → "Try the new layout", this device only). The
  signal path is one card: a line showing what the music goes through now, DSD and PCM as
  tabs (the other mode's settings as last seen, and a sheet that says what switching
  does), and the rate row saying what auto picked and why. History lists every change. Two
  columns on wide screens. The current layout is unchanged. On a phone, a slim bar with
  the track, health, play/pause and volume takes over when the now card scrolls away.
  History leaves out volume changes.
- **The meter's server side** (groundwork for the new layout's meter). While someone
  watches, hqpweb reads HQPlayer's meter (the control port + 1), smooths its bursts, and
  streams levels and 48 frequency bands to the browser, letting go a few seconds after the
  last viewer leaves. `GET /api/instances/:id/meter` (server-sent events).
- **The meter, in the new layout.** Under the now card, a live strip marked "Meter" (left
  and right levels with their peaks) that opens into a square with six views: Waterfall,
  Line (with a peak hold), Bars, Stereo, Width and Dynamics. It says so when HQPlayer
  offers no meter, or between tracks. The view you pick is remembered on this device. The
  meter shows the music as HQPlayer receives it, before upsampling. Low bands are drawn as
  wide as they really are (at the bottom, one band per ~21.5 Hz bin) instead of repeating
  one value across several bars.
- **Filter pickers with chips, in the new layout.** Each filter shows up to four chips: in
  use, ✓ kept up here (with its speed on this machine), ✗ fell behind here or won't play
  this ratio, ★ 5/5, its phase (from the name), apodizing, the ratio it needs, its focus
  and length. "+n · why?" shows the rest and the reason. The modulator and dither lists
  get the same: in use, kept up or fell behind here, won't play at this rate, the guide's
  starting point, order, load within its line ("EC line: lightest"), "needs a fast CPU at
  this rate" (Signalyst on the EC line at DSD1024) and generation; their sections, cited
  notes and the guide are unchanged. Above each list, yes/no facts are chips and the rest
  drop-downs (phase, apodizing, ratio, focus, length; order, load, generation), with a
  count; in use and trouble aren't filters. Names and rates are set in the mono font. The
  current layout's pickers are unchanged.

### Fixed

- **A mode switch no longer fails over a rate you didn't ask for.** Switching back to a
  mode brings its last-seen rate, but only if that mode still offers and allows it; a rate
  above this instance's limit (set in HQPlayer itself) made every switch fail after two
  real mode changes. The new layout's switch sheet likewise offers only allowed DSD rates.
- **The Now card shows 48k-family DSD rates** (DSD256 (48k)) and readings in [source]
  mode, which showed "—".
- **A stalled meter viewer** (a phone asleep with the page open) no longer makes the
  server buffer meter frames without end.
- **Each palette has a second accent**, a complementary colour: coral with Dark's cyan,
  magenta with Light's blue, teal with Copper and with Brass light. The meter uses it for
  peaks and the loud end of the waterfall, so Copper and Brass are no longer all brown.
  Width shows out of phase in red, against whichever accent is further from red (in Brass
  light the warning colour it used was the same brown as the bars).
- **The waterfall follows the theme:** silence is the plot's own background, then the
  accent, and the loudest the second accent (it was a fixed blue-to-yellow that clashed
  with the light themes). The strip's peak readings sit one per row ("L −22.0" over "R
  −22.0"), so they fit a phone instead of being cut off.
- **The meter's views run Waterfall, Line, Bars**, and a new viewer starts on Waterfall. A
  view chosen before is kept.
- **One way to write rates and modes.** Everywhere: DSD256, PCM in kHz (1536 kHz, not
  1.536 MHz), "Rate" (not "Output rate"), and "DSD" for HQPlayer's "SDM (DSD)". A rate
  after a mode switch was sometimes written in the old mode's terms (DSD256 as "11.2896
  MHz"); DSD is now told by the rate itself.
- **Tidier v2 screen.** Processing speed is shown once (on the path line); the footer is
  opaque and the page scrolls clear of it; without a meter stream there's a one-line note
  instead of a card; History sets only names and values in the mono font.
- **Load within a modulator line moves under "why?"** It's still a filter. On every row it
  read as a quality ranking, and the variants are character choices of one quality.
- **The app's files answer HEAD requests.** A browser asking for the icon that way (Safari
  does) got "not found", which can leave a tab or a Dock app without hqpweb's icon.
- **The new layout uses a laptop's width.** Its two columns were capped at about 260 px
  each (a width rule that lost to another), so filter names and labels wrapped and the
  modulator was cut off. They now share up to 76rem, labels stay on one line, and long
  names wrap rather than being cut.
- **The meter strip keeps its bars and its Meter toggle** in a narrow column: the peak
  words give way instead. The open meter's dB scale sits beside the chart, not over the
  top bands, and what the views show is behind an (i) button.
- **A volume change is quiet.** No "Applying…" or result message unless it goes wrong, and
  no Undo: the slider undoes itself. Undo stays for filters, shaping, rate and mode.
- **The meter says it's after HQPlayer's volume** (measured: a −30 dBFS tone read −53 dB
  at −23 dB volume).
- **The meter's axes are real.** The frequency labels (20 Hz, 200, 2k, 20 kHz) sit where
  the log scale puts them, with faint gridlines, and the open meter has a dB scale every
  20 dB. The strip gives each side's peak, and the meter explains what the bars, line and
  strip show (each bar is the loudest frequency in its band, not averaged). Its open/close
  cue is a plain chevron.
- **On an iPhone home-screen app, the page no longer scrolls under the clock.** A backdrop
  covers the status bar's height.
- **The status no longer goes stale for several seconds after a mode switch.** HQPlayer
  holds the connection while it switches, so the status reply was slow, and hqpweb took
  that for HQPlayer being slow and backed off its polling (about 6 s). It now ignores slow
  replies that waited behind its own changes.
- **Switching back to DSD no longer lands on its highest rate.** HQPlayer brings back a
  mode's filters and modulator when you switch, but resets the rate to auto, which in DSD
  is the highest rate. A modulator that kept up at DSD256 then fell behind at DSD1024 and
  was rolled back every time, with no way back into DSD. hqpweb now puts back the rate you
  last used in that mode; if it has none for DSD, the new layout's switch sheet asks.
- **No more stale rate after a switch while paused.** HQPlayer keeps reporting the old
  mode's last rate until playback starts (768 kHz shown under DSD). A rate that doesn't
  belong to the mode in use is now shown as unknown until a real one arrives.

## 0.1.0-beta.4 — named DACs, and a safer mode switch

**Update:** `docker compose pull && docker compose up -d`. Settings, presets and learned
failures are kept; everything saved before belongs to the first DAC.

### Added

- **Named DACs behind one HQPlayer.** If one HQPlayer plays to more than one DAC (a
  saved HQPlayer profile for each), name them in Settings → Your setup → DACs and choose
  the one in use there or from the header. HQPlayer can't tell an app which DAC it's
  using, so you choose it whenever you switch in HQPlayer. Your setup answers, the
  failures hqpweb learns and presets marked "this DAC only" follow the choice; anything
  saved before stays with the first DAC. The model is MusicD-Remote's (by meltface-80),
  adopted as-is so data saved in either app keeps its meaning in the other.

### Fixed

- **Switching between DSD and PCM no longer crashes HQPlayer.** Switching mode while
  music played crashed HQPlayer Desktop on macOS (seen twice, the same way). hqpweb now
  pauses first, switches, sets the rest, then carries on: through Roon when Roon is
  switched on in Settings and the zone is linked; from HQPlayer's own playlist by itself.
  Otherwise, with Roon playing, it stays paused and says so: press play in Roon.

## 0.1.0-beta.3 — a guide for the modulator and dither

**Update:** `docker compose pull && docker compose up -d`. Settings are kept; the
setup answers start empty, and failures hqpweb learned before are kept (counted as once).

### Added

- **A guide for the modulator and dither (beta).** The Modulator / Dither row now opens
  a sheet with two tabs. **List** is HQPlayer's whole list, grouped by family, with the
  older series folded (the one in use always shows). **Guide** asks a few questions
  about your DAC, amplifier, volume and connection, and suggests where to start, with
  each suggestion linked to the Signalyst post it comes from. Suggestions are starting
  points, chosen by name from your HQPlayer's own list. Nothing is changed until you pick.
  - **Rate and modulator together:** the guide offers pairs (for example DSD256 with
    ASDM7EC-fast, or DSD1024 with AHM), each set as one change. hqpweb orders the two
    so playback never passes through a pair that can't play.
  - **What each modulator is like:** CPU load and character for the EC variants and AHM,
    with the post each comes from.
  - The List keeps search and an **Only what plays here** chip.
- **Safety net for rate and modulator.** Picking a rate your modulator can't play at
  (in Advanced), or a modulator your rate can't take (AHM below DSD1024), offers the
  other half of a pair that plays. That's the only change hqpweb refuses on its own.
- **When HQPlayer struggles:** at DSD1024, modulators other than AHM carry Signalyst's
  note that they need a high-clock CPU; the "falling behind" warning waits until it
  lasts, and names a recent change; and if HQPlayer stops answering, hqpweb says how to
  restart it (Desktop or Embedded), and dims what it last showed.
- **Failure history.** hqpweb counts how often a combination has failed on each
  HQPlayer ("failed here 3×, last 6 Oct"), and you can clear it in Settings.
- **Settings → Your setup**, where the same answers can be seen and changed, per
  instance, with **Find your DAC**: a table of chips and common models.

### Changed

- **Rollbacks after a rate or mode change wait longer** before judging playback, so the
  few slow seconds while HQPlayer restarts its processing aren't taken for an overload.
  A real overload is still caught within about 11 seconds. The rollback message says
  what happened in plainer words, and shows in the picker if it's open.

- The DAC table follows Signalyst's 2025–26 advice: newer ESS chips are listed as
  re-processing DSD, and Denafrips as converting it (PCM output suits it better).
- **Volume:** the guide suggests Signalyst's gain optimisation (HQPlayer at −3 dB, the
  amplifier at the loudest you'd ever want, then turn down in HQPlayer or Roon). The
  512+fs modulators are offered as an option at DSD512 and up, not as the starting point.
- In the list, a row the guide suggests for your answers shows the guide's reason
  instead of an older, narrower note (for example, NS9 at 384 kHz for a ladder DAC).

- Section headings in Settings, and the rating groups in the filter picker, are now in
  the main text colour and bold, so they read as headings.

## 0.1.0-beta.2 — safer rollback, Restart playback

**Update:** `docker compose pull && docker compose up -d`. Settings are kept.

### Changed

- **A rollback never raises the volume.** If a change that also lowered the volume
  (a preset, say) stops playback and is rolled back, the other settings go back but
  the volume stays where you put it. Undo, which you press yourself, can still return
  to the level you were at, if nobody moved it since.
- **When a rollback leaves HQPlayer stopped,** hqpweb says so and offers **Restart
  playback** (if HQPlayer was playing from its own playlist), or tells you to resume in
  Roon. It no longer says HQPlayer "may need a restart". Restarting HQPlayer is the
  fallback if playback still won't come back; check its volume afterwards.

### Fixed

- In PCM mode, results named the dither "Modulator"; they now say "Dither", as the
  picker does.

### For developers

- Browser tests (`npm run test:e2e`), a curated ESLint set, a file-length limit,
  volume-safety property tests, a pre-commit hook, and a live release check against a
  real HQPlayer (`npm run release-check`). See `docs/quality-plan.md`.

## 0.1.0-beta.1 — first beta, and a published image

Beta: the feature set is settled for now, and updates keep your settings (instances,
presets, learned failures). Bugs and rough edges are still expected.

**Update:** `docker compose pull && docker compose up -d`. Settings are kept.

### Upgrade notes

- **The compose file now runs the published image** (`ghcr.io/statelycurmudgeon/hqpweb`,
  amd64 and arm64) instead of building. If you installed from a clone and want to keep
  building from source, use
  `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build`.
  Either way the settings volume is the same.

### Added

- **Published image** for each release, with build provenance; `HQPWEB_TAG` pins a
  version.
- **Discovery tries harder:** each scan sends its query three times, so a lost UDP
  packet no longer means "nothing found" (a tester's first scans failed several times).
- **Settings carry a format number,** and CI loads a set of settings files as
  earlier versions wrote them, so an update can't silently drop your instances,
  presets, learned failures or Roon pairing. A file from a newer hqpweb loads with a
  warning.
- **README screenshots.**

### Fixed

- "Apod 23· your filter handles this" now has its space.

## 0.1.0-alpha.2 — filter guide, compatible filters, safety signals

**Update:** `git pull && docker compose up -d --build`. No settings change.

- **Apodization notice.** When HQPlayer's Apod counter passes 10 in a track and the
  filter in use isn't apodizing, the Now card says so, with "Choose an apodizing
  filter…". With an apodizing filter, the count shows "your filter handles this".
  (The counter is per track: seen past 150 on one track, then 5 on the next.)
- **"hqpweb has been updated. Reload."** An installed app can stay open on old code;
  it now checks the server when it comes back to the foreground and offers a reload.
- **Health and About show the build's commit**, so deploys can be told apart.
- **Filter and modulator descriptions (HQPlayer 6):** each filter shows HQPlayer's
  own rating (stars); tap ⓘ for what it favours (transients, timbre, space) and the
  ratios it works with. Chips narrow the list (5/5, a focus, "works here"), and
  Settings can group the list by rating. Modulators show their generation (Gen1–8).
- **Ratio warnings use HQPlayer 6's own rule** when it gives one. On v5 we follow
  the v5 manual, except where measured otherwise: on Desktop 5.17.2 sinc-M needs a
  power-of-two ratio (it refuses 3×, and 2× down plays), not "whole-number". FFT
  allows power-of-two either way, and the ext2 variants are covered.
- **v5 instances get the same guide:** ratings and focus borrowed from HQPlayer 6 by
  name; v5-only filters and modulators described from the v5 manual.
- **Compatible filters first.** When the output rate is fixed, filters that can't do
  the current conversion ratio are hidden by a "compatible" chip (on by default; "Show
  all" lists them struck through). Picking one offers the output rates that fit, marks
  the closest, offers Auto, or applies anyway; the filter and rate change together.
- **"The next track won't start."** When HQPlayer is stopped and the track queued in
  its playlist can't play with the current filter and fixed rate, the Now card says
  why, with a fix: rates that fit, Auto, or another filter. (HQPlayer itself just
  ignores Play.) With a fixed rate, a note under the filters also warns about source
  rates the next album might use.
- **Volume jumps are flagged.** If HQPlayer's volume rises 10 dB or more without
  hqpweb (a restart brings it back at its saved level; v6 at −3 dB, measured), the Now
  card says so, with a button to go back to the previous level, and Dismiss.
- **"HQPlayer didn't start."** HQPlayer replies OK to Play even when nothing can start.
  After a Play from hqpweb, if nothing starts within a few seconds, the app says so,
  and why when a rule explains it; otherwise it points at the output (an NAA in use
  elsewhere, a DAC that's off).
- **Apod and clip counters.** HQPlayer's apodization counter appears once it's above
  0 (amber; red past 10, where HQPlayer's manual suggests an apodizing filter, with a
  link that opens the filter list narrowed to apodizing filters). The clip counter
  appears once above 0, with a hint to lower the volume. Filters carry an "apodizing"
  chip, from HQPlayer 6's own filter table (yes, no or partly).
- **"Processing" shows HQPlayer's processing speed** (e.g. 32×) on 5.17.2 and 6.x.
- **Seek** within files HQPlayer plays itself.

## 0.1.0-alpha.1 — first public release

**Install:** see the README. **Update:** `git pull && docker compose up -d --build`.

### What's in it

- **Instances:** discovery on the local network segment (with host networking), or
  add by address; rename; the name defaults to the one HQPlayer reports.
- **Now card:** output rate, mode, source format, playback state, track position,
  and **Processing** (whether HQPlayer keeps up with real time: Real-time ✓,
  Straining or Falling behind, from a 30 s fit of its position), plus volume.
- **Quick changes:** 1x and Nx filters, dither or modulator, volume, with hints
  from HQPlayer's documented rules on combinations that won't play.
- **Advanced:** mode, output rate, convolution on/off, matrix profile, polarity,
  20 kHz filter, adaptive volume.
- **Checked and reversible:** every change is read back; a change that stops
  playback or leaves HQPlayer unable to keep up is rolled back, remembered, and
  warned about next time. Undo for the last change. Volume is never raised more than
  6 dB at once, and undo and rollback never raise it.
- **Presets:** named sets of settings shared across instances, previewed per
  instance (active, quick or major change), saved with or without volume.
- **Transport:** previous, play/pause and next. With Roon as the source and no Roon
  link, only Stop (play and next sent to HQPlayer don't reach Roon).
- **Roon (optional, off by default):** now playing with cover art, a seek slider and
  working transport for the Roon zone that feeds each HQPlayer.
- **Install:** one Docker container, settings in a Docker volume, no login (see
  Security in the README).

### Known limits

- Tested on HQPlayer Desktop 5 (macOS and Linux). Embedded, HQPlayer 6 and Windows
  are untested.
- HQPlayer's saved configurations and its output device can't be switched: the
  control protocol doesn't allow it (README: "Why can't I switch profiles or
  endpoints?").
- Discovery doesn't cross VLANs or routed subnets; add instances by address.

### For the two pre-release installs

If you ran a build from before this release: the container is now `hqpweb` (run
`docker compose down` before pulling); settings moved from `./config` to a Docker
volume (`docker compose cp config/instances.json controller:/config/` once, then
`docker compose restart`); the default port is 4380 (was 8787); and the parked
library browser now lives on the `library` branch.
