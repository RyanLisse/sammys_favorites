#!/usr/bin/env node

import { once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import net from "node:net";

const [operation, snapshotPath] = process.argv.slice(2);
const redisHost = process.env.SAMMYS_REDIS_HOST ?? "127.0.0.1";
const redisPort = Math.trunc(Number(process.env.SAMMYS_REDIS_PORT ?? ""));
const redisDatabase = Math.trunc(Number(process.env.SAMMYS_REDIS_DB ?? ""));
const redisPassword = process.env.SAMMYS_REDIS_PASSWORD;
const namespace = process.env.SAMMYS_TEST_NAMESPACE;

if (!["backup", "restore"].includes(operation ?? "") || !snapshotPath) {
  throw new Error(
    "Usage: redis-namespace-snapshot.mjs <backup|restore> <snapshot-path>"
  );
}
if (
  !redisPassword ||
  !namespace ||
  !Number.isInteger(redisPort) ||
  redisPort < 1 ||
  redisPort > 65_535 ||
  !Number.isInteger(redisDatabase) ||
  redisDatabase < 1 ||
  redisDatabase > 1023
) {
  throw new Error("Missing Redis namespace environment");
}

const findLineEnd = (buffer, offset) => buffer.indexOf("\r\n", offset);

const parseResponse = (buffer, offset = 0) => {
  if (offset >= buffer.length) {
    return;
  }
  const type = String.fromCodePoint(buffer[offset]);
  const lineEnd = findLineEnd(buffer, offset + 1);
  if (lineEnd === -1) {
    return;
  }
  const header = buffer.subarray(offset + 1, lineEnd).toString("utf-8");
  const bodyOffset = lineEnd + 2;

  if (type === "+") {
    return { nextOffset: bodyOffset, value: header };
  }
  if (type === "-") {
    throw new Error(`Redis error: ${header}`);
  }
  if (type === ":") {
    return { nextOffset: bodyOffset, value: Math.trunc(Number(header)) };
  }
  if (type === "$") {
    const length = Math.trunc(Number(header));
    if (length === -1) {
      return { nextOffset: bodyOffset, value: null };
    }
    if (buffer.length < bodyOffset + length + 2) {
      return;
    }
    return {
      nextOffset: bodyOffset + length + 2,
      value: buffer.subarray(bodyOffset, bodyOffset + length),
    };
  }
  if (type === "*") {
    const length = Math.trunc(Number(header));
    const values = [];
    let nextOffset = bodyOffset;
    for (let index = 0; index < length; index += 1) {
      const item = parseResponse(buffer, nextOffset);
      if (!item) {
        return;
      }
      const { nextOffset: itemNextOffset, value } = item;
      values.push(value);
      nextOffset = itemNextOffset;
    }
    return { nextOffset, value: values };
  }
  throw new Error(`Unsupported Redis response type: ${type}`);
};

const encodeCommand = (parts) => {
  const buffers = [Buffer.from(`*${parts.length}\r\n`)];
  for (const part of parts) {
    const value = Buffer.isBuffer(part) ? part : Buffer.from(String(part));
    buffers.push(
      Buffer.from(`$${value.length}\r\n`),
      value,
      Buffer.from("\r\n")
    );
  }
  return Buffer.concat(buffers);
};

const connect = async () => {
  const socket = net.createConnection({ host: redisHost, port: redisPort });
  await once(socket, "connect");
  let buffered = Buffer.alloc(0);

  const command = async (...parts) => {
    socket.write(encodeCommand(parts));
    while (true) {
      const response = parseResponse(buffered);
      if (response) {
        buffered = buffered.subarray(response.nextOffset);
        return response.value;
      }
      const [chunk] = await once(socket, "data");
      buffered = Buffer.concat([buffered, chunk]);
    }
  };

  await command("AUTH", redisPassword);
  await command("SELECT", redisDatabase);
  return { close: () => socket.end(), command };
};

const redis = await connect();
try {
  if (operation === "backup") {
    const entries = [];
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.command(
        "SCAN",
        cursor,
        "COUNT",
        "200"
      );
      cursor = nextCursor.toString("utf-8");
      for (const key of keys) {
        const ttl = await redis.command("PTTL", key);
        const payload = await redis.command("DUMP", key);
        if (payload) {
          entries.push({
            key: key.toString("base64"),
            payload: payload.toString("base64"),
            ttlMilliseconds: Math.max(ttl, 0),
          });
        }
      }
    } while (cursor !== "0");

    await writeFile(
      snapshotPath,
      `${JSON.stringify({ entries, namespace, redisDatabase, snapshotVersion: 1 }, null, 2)}\n`,
      { mode: 0o600 }
    );
  } else {
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf-8"));
    if (
      snapshot.snapshotVersion !== 1 ||
      snapshot.namespace !== namespace ||
      snapshot.redisDatabase !== redisDatabase ||
      !Array.isArray(snapshot.entries)
    ) {
      throw new Error(
        "Redis snapshot does not match the selected namespace database"
      );
    }
    await redis.command("FLUSHDB", "SYNC");
    for (const entry of snapshot.entries) {
      await redis.command(
        "RESTORE",
        Buffer.from(entry.key, "base64"),
        entry.ttlMilliseconds,
        Buffer.from(entry.payload, "base64"),
        "REPLACE"
      );
    }
  }
} finally {
  redis.close();
}
