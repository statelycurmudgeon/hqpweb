// A WebSocket server's side, just enough for test fakes (fake-roon.ts, the browser tests'
// TCP bridge): the handshake, unfragmented frames either way, ping and close.
import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";

/** One frame, unmasked (server to client); binary unless another opcode is given. */
export function frame(payload: Buffer, opcode = 2): Buffer {
  const len = payload.length;
  const head =
    len < 126
      ? Buffer.from([0x80 | opcode, len])
      : len < 65536
        ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 0xff])
        : Buffer.concat([
            Buffer.from([0x80 | opcode, 127]),
            (() => {
              const b = Buffer.alloc(8);
              b.writeBigUInt64BE(BigInt(len));
              return b;
            })(),
          ]);
  return Buffer.concat([head, payload]);
}

/** Answer an upgrade request and read the client's frames: each message's payload to `onMessage`, and whether it's text. */
export function acceptWebSocket(req: IncomingMessage, socket: Socket, onMessage: (payload: Buffer, text: boolean) => void) {
  const accept = createHash("sha1")
    .update(`${req.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  let buf = Buffer.alloc(0);
  socket.on("data", (d: Buffer) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const opcode = buf[0]! & 0x0f;
      let len = buf[1]! & 0x7f;
      let off = 2;
      if (len === 126) ((len = buf.readUInt16BE(2)), (off = 4));
      else if (len === 127) ((len = Number(buf.readBigUInt64BE(2))), (off = 10));
      const masked = (buf[1]! & 0x80) !== 0;
      const need = off + (masked ? 4 : 0) + len;
      if (buf.length < need) return;
      const mask = masked ? buf.subarray(off, off + 4) : null;
      const payload = Buffer.from(buf.subarray(off + (masked ? 4 : 0), need));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i]! ^= mask[i % 4]!;
      buf = buf.subarray(need);
      if (opcode === 8) return socket.end(frame(Buffer.alloc(0), 8));
      if (opcode === 9) socket.write(frame(payload, 10));
      else if (opcode === 1 || opcode === 2) onMessage(payload, opcode === 1);
    }
  });
}
