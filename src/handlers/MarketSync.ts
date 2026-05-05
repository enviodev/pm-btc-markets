import { indexer } from "generated";
import { S, createEffect } from "envio";

const FIVE_MIN_SECS = 300;
const ONE_DAY_SECS = 86400;
const FIVE_MIN_BLOCKS_POLYGON = 150; // ~2s blocks

const GAMMA_BASE = "https://gamma-api.polymarket.com/events/slug";

const SlugMarket = S.schema({
  conditionId: S.string,
  slug: S.string,
  endDate: S.string,
  clobTokenIds: S.string,
});

const SlugResponse = S.schema({
  slug: S.string,
  endDate: S.string,
  markets: S.array(SlugMarket),
});

export const fetchBtcUpDownSlot = createEffect(
  {
    name: "fetchBtcUpDownSlot",
    input: S.number,
    output: S.union([SlugResponse, null]),
    cache: true,
    rateLimit: { calls: 5, per: 1000 },
  },
  async ({ input: slotTs }) => {
    // Note: avoid `context.log` inside effect handlers — envio
    // 3.0.0-alpha.23 has a bug where the getter captures the wrong `this`
    // and throws "Cannot read properties of undefined (reading 'item')".
    const slug = `btc-updown-5m-${slotTs}`;
    const res = await fetch(`${GAMMA_BASE}/${slug}`);
    console.log(`[gamma] ${res.status} slug=${slug}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(
        `gamma API ${slug} failed: ${res.status} ${res.statusText}`,
      );
    }
    return (await res.json()) as {
      slug: string;
      endDate: string;
      markets: {
        conditionId: string;
        slug: string;
        endDate: string;
        clobTokenIds: string;
      }[];
    };
  },
);

function isoToUnix(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

indexer.onBlock(
  {
    name: "MarketSync",
    where: ({ chain }) => {
      switch (chain.id) {
        case 137:
          return { block: { number: { _every: FIVE_MIN_BLOCKS_POLYGON } } };
        default:
          return (chain.id satisfies never), false;
      }
    },
  },
  async ({ context }) => {
    // Block context exposes only block.number; gamma slugs are wall-clock
    // anchored, so use Date.now() to derive slots. Goal: keep DB populated
    // with the past-24h window of markets so OrderFills from that window
    // are filtered correctly. Sweep all 288 5-min slots in [now-24h, now);
    // Effect cache dedupes across ticks.
    const nowSecs = Math.floor(Date.now() / 1000);
    const aligned = Math.floor(nowSecs / FIVE_MIN_SECS) * FIVE_MIN_SECS;
    const startSlot = aligned - ONE_DAY_SECS;
    const endSlot = aligned - FIVE_MIN_SECS;

    for (let slot = startSlot; slot <= endSlot; slot += FIVE_MIN_SECS) {
      const data = await context.effect(fetchBtcUpDownSlot, slot);
      if (!data || context.isPreload) continue;
      for (const m of data.markets) {
        let tokenIds: string[];
        try {
          tokenIds = JSON.parse(m.clobTokenIds);
        } catch {
          continue;
        }
        const endUnix = isoToUnix(m.endDate);
        const outcomes = ["Up", "Down"];
        for (let i = 0; i < tokenIds.length; i++) {
          const tid = tokenIds[i];
          if (!tid) continue;
          const existing = await context.Market.get(tid);
          context.Market.set({
            id: tid,
            conditionId: m.conditionId,
            slug: m.slug,
            slotTimestamp: slot,
            endDate: endUnix,
            outcome: outcomes[i] ?? `Outcome${i}`,
          });
          if (!existing) {
            context.log.info(
              `[Market+] tokenId=${tid} outcome=${outcomes[i]} slug=${m.slug}`,
            );
          }
        }
      }
    }

    if (context.isPreload) return;

    const cutoff = nowSecs - ONE_DAY_SECS - FIVE_MIN_SECS;
    const expired = await context.Market.getWhere({
      endDate: { _lt: cutoff },
    });
    for (const m of expired) {
      context.Market.deleteUnsafe(m.id);
    }
  },
);
