import { expect, it } from "vitest";
import { HqpClient } from "@app/protocol";
import { nodeConnect } from "@app/protocol/node";

it("refuses to connect to port 4321 during tests", async () => {
  await expect(new HqpClient("127.0.0.1", { connect: nodeConnect, port: 4321, timeoutMs: 500 }).info()).rejects.toThrow(
    /never connect to port 4321/,
  );
});
