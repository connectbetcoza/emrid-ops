import type { StreamChange } from "@/lib/work/producer-core";

/**
 * DynamoDB Stream parsing — PURE. Turns a raw stream record (AttributeValue
 * wire format) into the normalized `StreamChange` the producer-core consumes.
 *
 * A tiny, dependency-free unmarshaller (we only need the scalar + container
 * types a Profile/Device image uses) keeps the parser self-contained — no
 * reliance on a transitive `@aws-sdk/util-dynamodb`. Unknown shapes pass through
 * unchanged rather than throwing, so a new attribute type never breaks parsing.
 */

function unmarshallValue(av: unknown): unknown {
  if (av === null || typeof av !== "object") return av;
  const v = av as Record<string, unknown>;
  if ("S" in v) return v.S;
  if ("N" in v) return Number(v.N);
  if ("BOOL" in v) return Boolean(v.BOOL);
  if ("NULL" in v) return null;
  if ("M" in v) return unmarshallImage(v.M as Record<string, unknown>);
  if ("L" in v) return (v.L as unknown[]).map(unmarshallValue);
  if ("SS" in v) return v.SS;
  if ("NS" in v) return (v.NS as string[]).map((n) => Number(n));
  return v;
}

export function unmarshallImage(
  image: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!image || typeof image !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(image)) {
    out[key] = unmarshallValue(value);
  }
  return out;
}

type RawStreamRecord = {
  eventName?: string;
  dynamodb?: {
    Keys?: Record<string, unknown>;
    NewImage?: Record<string, unknown>;
    OldImage?: Record<string, unknown>;
  };
};

const EVENT_NAMES = new Set(["INSERT", "MODIFY", "REMOVE"]);

/**
 * Parse a single raw stream record. Returns null when the record is malformed or
 * lacks the PK/SK keys (so the caller simply skips it rather than failing the
 * whole batch).
 */
export function parseStreamRecord(record: unknown): StreamChange | null {
  if (!record || typeof record !== "object") return null;
  const r = record as RawStreamRecord;
  const d = r.dynamodb;
  if (!d) return null;

  const keys = unmarshallImage(d.Keys);
  const pk = keys && typeof keys.PK === "string" ? keys.PK : null;
  const sk = keys && typeof keys.SK === "string" ? keys.SK : null;
  if (!pk || !sk) return null;

  const eventName = EVENT_NAMES.has(r.eventName ?? "")
    ? (r.eventName as StreamChange["eventName"])
    : "MODIFY";

  return {
    eventName,
    keys: { PK: pk, SK: sk },
    newImage: unmarshallImage(d.NewImage),
    oldImage: unmarshallImage(d.OldImage),
  };
}
