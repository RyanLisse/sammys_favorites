import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import type { PolicyCapability } from "./index.js";

export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export interface OutboundTargetVerifier {
  verify: (capability: PolicyCapability, target: string) => Promise<boolean>;
}

export type AddressResolver = (
  hostname: string
) => Promise<readonly ResolvedAddress[]>;

const parseIpv4 = (
  address: string
): readonly [number, number, number, number] | null => {
  if (isIP(address) !== 4) {
    return null;
  }
  const [first, second, third, fourth] = address.split(".").map(Number);
  return first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined
    ? null
    : [first, second, third, fourth];
};

const isPrivateOrLocalIpv4 = (
  octets: readonly [number, number, number, number]
): boolean => {
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
};

const isReservedIpv4 = (
  octets: readonly [number, number, number, number]
): boolean => {
  const [first, second, third] = octets;
  return (
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
};

const isPublicIpv4 = (address: string): boolean => {
  const octets = parseIpv4(address);
  return Boolean(
    octets && !isPrivateOrLocalIpv4(octets) && !isReservedIpv4(octets)
  );
};

const normalizeIpv6 = (address: string): string =>
  address.toLowerCase().split("%")[0] ?? address.toLowerCase();

const parseIpv6Words = (address: string): readonly number[] | null => {
  const normalized = normalizeIpv6(address);
  if (isIP(normalized) !== 6) {
    return null;
  }
  const [left = "", right = ""] = normalized.split("::");
  const leftWords = left ? left.split(":") : [];
  const rightWords = right ? right.split(":") : [];
  const missingWords = 8 - leftWords.length - rightWords.length;
  const words = [
    ...leftWords,
    ...Array.from({ length: missingWords }, () => "0"),
    ...rightWords,
  ].map((word) => Number.parseInt(word, 16));
  return words.length === 8 ? words : null;
};

const mappedIpv4 = (address: string): string | null => {
  const normalized = normalizeIpv6(address);
  const dottedMatch = /^::ffff:(?<address>\d+\.\d+\.\d+\.\d+)$/u.exec(
    normalized
  );
  if (dottedMatch?.groups?.address) {
    return dottedMatch.groups.address;
  }
  const hexadecimalMatch =
    /^::ffff:(?<high>[\da-f]{1,4}):(?<low>[\da-f]{1,4})$/u.exec(normalized);
  if (!(hexadecimalMatch?.groups?.high && hexadecimalMatch.groups.low)) {
    return null;
  }
  const high = Number.parseInt(hexadecimalMatch.groups.high, 16);
  const low = Number.parseInt(hexadecimalMatch.groups.low, 16);
  return `${Math.floor(high / 256)}.${high % 256}.${Math.floor(low / 256)}.${low % 256}`;
};

const mappedIpv4FromWords = (words: readonly number[]): string | null => {
  const hasMappedPrefix =
    words.slice(0, 5).every((word) => word === 0) && words[5] === 65_535;
  const [high, low] = words.slice(6);
  if (!(hasMappedPrefix && high !== undefined && low !== undefined)) {
    return null;
  }
  return `${Math.floor(high / 256)}.${high % 256}.${Math.floor(low / 256)}.${low % 256}`;
};

export const isPublicIpAddress = (address: string): boolean => {
  if (isIP(address) === 4) {
    return isPublicIpv4(address);
  }
  if (isIP(address) !== 6) {
    return false;
  }
  const dottedMapped = mappedIpv4(address);
  if (dottedMapped) {
    return isPublicIpv4(dottedMapped);
  }
  const words = parseIpv6Words(address);
  if (!words) {
    return false;
  }
  const mapped = mappedIpv4FromWords(words);
  if (mapped) {
    return isPublicIpv4(mapped);
  }
  const [first = 0, second = 0] = words;
  const [last] = words.slice(-1);
  const isUnspecified = words.every((word) => word === 0);
  const isLoopback =
    words.slice(0, 7).every((word) => word === 0) && last === 1;
  return !(
    isUnspecified ||
    isLoopback ||
    (first >= 64_512 && first <= 65_023) ||
    (first >= 65_152 && first <= 65_215) ||
    first >= 65_280 ||
    (first === 8193 && second === 3512)
  );
};

const systemResolver: AddressResolver = async (hostname) => {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map(({ address, family }) => ({
    address,
    family: family === 6 ? 6 : 4,
  }));
};

export class DnsPinnedOutboundTargetVerifier implements OutboundTargetVerifier {
  readonly #allowedOrigins: ReadonlyMap<PolicyCapability, ReadonlySet<string>>;
  readonly #resolver: AddressResolver;

  constructor(
    allowedOrigins: ReadonlyMap<PolicyCapability, ReadonlySet<string>>,
    resolver: AddressResolver = systemResolver
  ) {
    this.#allowedOrigins = allowedOrigins;
    this.#resolver = resolver;
  }

  verify = async (
    capability: PolicyCapability,
    target: string
  ): Promise<boolean> => {
    try {
      const url = new URL(target);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !this.#allowedOrigins.get(capability)?.has(url.origin)
      ) {
        return false;
      }
      const literalFamily = isIP(url.hostname);
      const addresses = literalFamily
        ? [{ address: url.hostname, family: literalFamily === 6 ? 6 : 4 }]
        : await this.#resolver(url.hostname);
      return (
        addresses.length > 0 &&
        addresses.every(({ address }) => isPublicIpAddress(address))
      );
    } catch {
      return false;
    }
  };
}
