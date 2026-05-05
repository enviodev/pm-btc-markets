import { indexer } from "generated";

const SIDE_BUY = 0;

function formatRatio(
  numerator: bigint,
  denominator: bigint,
  precision = 6,
): string {
  if (denominator === 0n) return "0";
  const scale = 10n ** BigInt(precision);
  const scaled = (numerator * scale) / denominator;
  const whole = scaled / scale;
  const fraction = (scaled % scale).toString().padStart(precision, "0");
  return `${whole}.${fraction}`;
}

indexer.onEvent(
  { contract: "CTFExchangeV2", event: "OrderFilled" },
  async ({ event, context }) => {
    const {
      orderHash,
      maker,
      taker,
      side,
      tokenId,
      makerAmountFilled,
      takerAmountFilled,
      fee,
      builder,
      metadata,
    } = event.params;

    const price =
      Number(side) === SIDE_BUY
        ? formatRatio(makerAmountFilled, takerAmountFilled)
        : formatRatio(takerAmountFilled, makerAmountFilled);

    context.OrderFill.set({
      id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
      orderHash,
      maker,
      taker,
      side: Number(side),
      tokenId,
      price,
      makerAmountFilled,
      takerAmountFilled,
      fee,
      builder,
      metadata,
      exchange: event.srcAddress,
      timestamp: event.block.timestamp,
      blockNumber: event.block.number,
      transactionHash: event.transaction.hash,
      txFrom: event.transaction.from ?? "",
    });
  },
);
