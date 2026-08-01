import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";

import type { PolicyCapability } from "./index.js";

export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export interface OutboundTargetVerifier {
  createConnectionPlan: (
    capability: PolicyCapability,
    target: string
  ) => Promise<VerifiedOutboundConnectionPlan | null>;
}

export interface VerifiedOutboundConnectionPlan {
  readonly addresses: readonly ResolvedAddress[];
  readonly hostname: string;
  readonly lookup: LookupFunction;
  readonly origin: string;
  readonly port: number;
  readonly target: string;
  readonly verifyRedirect: (
    target: string
  ) => Promise<VerifiedOutboundConnectionPlan | null>;
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
    (first === 192 && second === 88 && third === 99) ||
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
  const finalSeparator = normalized.lastIndexOf(":");
  const ipv4Suffix = normalized.slice(finalSeparator + 1);
  const ipv4Octets = parseIpv4(ipv4Suffix);
  const wordAddress = ipv4Octets
    ? `${normalized.slice(0, finalSeparator + 1)}${(
        ipv4Octets[0] * 256 +
        ipv4Octets[1]
      ).toString(16)}:${(ipv4Octets[2] * 256 + ipv4Octets[3]).toString(16)}`
    : normalized;
  const [left = "", right = ""] = wordAddress.split("::");
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

const mappedIpv4FromWords = (words: readonly number[]): string | null => {
  const hasMappedPrefix =
    words.slice(0, 5).every((word) => word === 0) && words[5] === 65_535;
  const [high, low] = words.slice(6);
  if (!(hasMappedPrefix && high !== undefined && low !== undefined)) {
    return null;
  }
  return `${Math.floor(high / 256)}.${high % 256}.${Math.floor(low / 256)}.${low % 256}`;
};

const isIetfProtocolAssignment = (first: number, second: number): boolean =>
  first === 8193 && second <= 511;

const isSpecialUseIpv6 = (words: readonly number[]): boolean => {
  const [first = 0, second = 0, third = 0, fourth = 0] = words;
  const [last] = words.slice(-1);
  const isUnspecified = words.every((word) => word === 0);
  const isLoopback =
    words.slice(0, 7).every((word) => word === 0) && last === 1;
  const isGlobalUnicast = first >= 8192 && first <= 16_383;
  const isDocumentation = first === 8193 && second === 3512;
  const isBenchmarking = first === 8193 && second === 2 && third === 0;
  const isOrchidV1 = first === 8193 && second >= 16 && second <= 31;
  const isOrchidV2 = first === 8193 && second >= 32 && second <= 47;
  const isSixToFour = first === 8194;
  const isDiscardOnly =
    first === 256 && second === 0 && third === 0 && fourth === 0;
  const isLocalTranslation = first === 100 && second === 65_435 && third === 1;
  const isDocumentationV4 = first === 16_383 && second <= 4095;
  return [
    !isGlobalUnicast,
    isIetfProtocolAssignment(first, second),
    isUnspecified,
    isLoopback,
    isDocumentation,
    isBenchmarking,
    isOrchidV1,
    isOrchidV2,
    isSixToFour,
    isDiscardOnly,
    isLocalTranslation,
    isDocumentationV4,
  ].some(Boolean);
};

const isPublicIpv6 = (address: string): boolean => {
  const words = parseIpv6Words(address);
  if (!words) {
    return false;
  }
  const mapped = mappedIpv4FromWords(words);
  return mapped ? isPublicIpv4(mapped) : !isSpecialUseIpv6(words);
};

export const isPublicIpAddress = (address: string): boolean => {
  const family = isIP(address);
  if (family === 4) {
    return isPublicIpv4(address);
  }
  return family === 6 && isPublicIpv6(address);
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

  createConnectionPlan = async (
    capability: PolicyCapability,
    target: string
  ): Promise<VerifiedOutboundConnectionPlan | null> => {
    try {
      const url = new URL(target);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !this.#allowedOrigins.get(capability)?.has(url.origin)
      ) {
        return null;
      }
      const literalFamily = isIP(url.hostname);
      const addresses: readonly ResolvedAddress[] = literalFamily
        ? [
            {
              address: url.hostname,
              family: literalFamily === 6 ? (6 as const) : (4 as const),
            },
          ]
        : await this.#resolver(url.hostname);
      if (
        addresses.length === 0 ||
        !addresses.every(({ address }) => isPublicIpAddress(address))
      ) {
        return null;
      }
      const pinnedAddresses = Object.freeze(
        addresses.map(({ address, family }) =>
          Object.freeze({ address, family })
        )
      );
      const { hostname } = url;
      // oxlint-disable promise/prefer-await-to-callbacks -- Node's connect-bound LookupFunction transport primitive is callback-based.
      const pinnedLookup: LookupFunction = (
        requestedHostname,
        options,
        callback
      ) => {
        if (requestedHostname !== hostname) {
          const error = new Error(
            "Pinned lookup refused a different hostname"
          ) as NodeJS.ErrnoException;
          error.code = "EPERM";
          callback(error, "", 0);
          return;
        }
        const { all, family: requestedFamilyOption = 0 } = options;
        const requestedFamily = Number(requestedFamilyOption);
        const eligible = requestedFamily
          ? pinnedAddresses.filter(
              ({ family: addressFamily }) => addressFamily === requestedFamily
            )
          : pinnedAddresses;
        if (eligible.length === 0) {
          const error = new Error(
            "Pinned lookup has no verified address for the requested family"
          ) as NodeJS.ErrnoException;
          error.code = "ENOTFOUND";
          callback(error, "", 0);
          return;
        }
        if (all) {
          callback(
            null,
            eligible.map(({ address, family: addressFamily }) => ({
              address,
              family: addressFamily,
            }))
          );
          return;
        }
        const [selected] = eligible;
        if (!selected) {
          callback(new Error("Pinned lookup has no verified address"), "", 0);
          return;
        }
        callback(null, selected.address, selected.family);
      };
      // oxlint-enable promise/prefer-await-to-callbacks
      return Object.freeze({
        addresses: pinnedAddresses,
        hostname,
        lookup: pinnedLookup,
        origin: url.origin,
        port: url.port ? Number(url.port) : 443,
        target: url.href,
        verifyRedirect: (redirectTarget: string) =>
          this.createConnectionPlan(capability, redirectTarget),
      });
    } catch {
      return null;
    }
  };
}
