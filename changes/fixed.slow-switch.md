- **A filter HQPlayer is slow to build no longer fools the check.** Switching to a very
  long filter (sinc-L, measured on a Mac) can leave HQPlayer answering nothing for ~10 s
  and the music silent for longer. hqpweb gave up on the check as "inconclusive". It now
  waits HQPlayer out, judges playback once it answers, and remembers the filter: the sheet
  shows "⏳ slow to switch here (9 s)" and asks before you switch to it again. A warning,
  never a block.
