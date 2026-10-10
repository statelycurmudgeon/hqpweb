- **Switching back into DSD no longer fails when the remembered rate can't play.** A mode
  switch brings back the rate last used in that mode. If the modulator HQPlayer comes back
  with can't play at that rate (AHM modulators stop below DSD1024), hqpweb now leaves the
  rate out and keeps HQPlayer's own, instead of switching, stalling and rolling back. Seen with
  two HQPlayer engines on one machine, where the remembered rate came from the other engine.
