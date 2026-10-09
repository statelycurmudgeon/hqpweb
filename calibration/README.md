# The clap track

`claps-v1.wav` is the meter calibration's clap track: six claps at irregular gaps, generated
by [apps/server/src/calibration.ts](../apps/server/src/calibration.ts) (MIT, like the rest).
It's kept here so HQPlayer can fetch it from GitHub when it can't reach hqpweb itself. A test
checks it matches the generator; if the pattern ever changes, it becomes `claps-v2.wav` and the
old file stays for older versions.
