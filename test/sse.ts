// A minimal EventSource for tests: Node has none. Reads a server-sent-events stream with
// fetch and hands each named event to its listeners; onerror when the stream ends or fails
// (unless closed). Enough for the web app's httpApi, nothing more.
export class NodeEventSource {
  onerror: (() => void) | null = null;
  private readonly ctl = new AbortController();
  private readonly handlers = new Map<string, ((e: { data: string }) => void)[]>();

  constructor(url: string) {
    void this.run(url);
  }

  addEventListener(name: string, fn: (e: { data: string }) => void) {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), fn]);
  }

  close() {
    this.ctl.abort();
  }

  private async run(url: string) {
    try {
      const res = await fetch(url, { signal: this.ctl.signal, headers: { accept: "text/event-stream" } });
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      let event = "message";
      let data: string[] = [];
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line === "") {
            if (data.length) for (const fn of this.handlers.get(event) ?? []) fn({ data: data.join("\n") });
            event = "message";
            data = [];
          } else if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
        }
      }
    } catch {
      // aborted (closed) or the connection failed
    }
    if (!this.ctl.signal.aborted) this.onerror?.();
  }
}
