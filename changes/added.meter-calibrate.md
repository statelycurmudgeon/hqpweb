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
