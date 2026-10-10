- **Switching mode no longer crashes HQPlayer Embedded.** Switching between PCM and DSD
  while music played, or was paused, could crash Embedded 6.2.5 (measured: paused, 1 of 2
  tries crashed; stopped, none of 3). hqpweb now stops HQPlayer first (pausing Roon first
  when its zone is linked), switches, then carries on: Roon is played again until it's
  playing, and HQPlayer's own playlist plays and seeks back to where it was. It takes a
  while, up to about 20 seconds of silence, and the switch sheet and footer say so.
