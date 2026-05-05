import {
  HypersyncClient,
  Decoder,
  type Query,
} from "@envio-dev/hypersync-client";

const POLYGON_HYPERSYNC_URL = "https://137.hypersync.xyz";

const CTF_EXCHANGE_ADDRESSES = [
  "0xe111180000d2663c0091e4f400237545b87b996b",
  "0xe2222d279d744050d28e00520010520000310f59",
  "0xe2222d002000ba0053cef3375333610f64600036",
];

const ORDER_FILLED_SIGNATURE =
  "OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint8 side, uint256 tokenId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee, bytes32 builder, bytes32 metadata)";

const INDEXED_NAMES = ["orderHash", "maker", "taker"] as const;
const BODY_NAMES = [
  "side",
  "tokenId",
  "makerAmountFilled",
  "takerAmountFilled",
  "fee",
  "builder",
  "metadata",
] as const;

async function main() {
  const apiToken = process.env.ENVIO_API_TOKEN;
  if (!apiToken) {
    throw new Error("ENVIO_API_TOKEN missing in environment");
  }

  const client = new HypersyncClient({
    url: POLYGON_HYPERSYNC_URL,
    apiToken,
  });

  const height = await client.getHeight();
  const fromBlock = Math.max(0, height - 10);
  const toBlock = height;

  console.log(
    `Polygon height ${height}. Fetching OrderFilled from blocks [${fromBlock}, ${toBlock}) across ${CTF_EXCHANGE_ADDRESSES.length} contracts.`,
  );

  const query: Query = {
    fromBlock,
    toBlock,
    logs: [
      {
        address: CTF_EXCHANGE_ADDRESSES,
      },
    ],
    fieldSelection: {
      block: ["Number", "Timestamp", "Hash"],
      log: [
        "BlockNumber",
        "LogIndex",
        "TransactionHash",
        "Address",
        "Data",
        "Topic0",
        "Topic1",
        "Topic2",
        "Topic3",
      ],
    },
  };

  const res = await client.get(query);
  const logs = res.data.logs ?? [];
  const blocks = res.data.blocks ?? [];

  const blockTimestampByNumber = new Map<number, bigint>();
  for (const block of blocks) {
    if (block.number != null && block.timestamp != null) {
      blockTimestampByNumber.set(Number(block.number), BigInt(block.timestamp));
    }
  }

  console.log(`Fetched ${logs.length} raw logs, decoding OrderFilled...`);

  const decoder = Decoder.fromSignatures([ORDER_FILLED_SIGNATURE]);
  const decoded = await decoder.decodeLogs(logs);

  let matched = 0;
  for (let i = 0; i < logs.length; i++) {
    const decodedLog = decoded[i];
    if (!decodedLog) continue;
    matched++;

    const log = logs[i];
    const blockNumber = Number(log.blockNumber);
    const timestamp = blockTimestampByNumber.get(blockNumber);

    const fields: Record<string, string> = {};
    for (let j = 0; j < INDEXED_NAMES.length; j++) {
      const v = decodedLog.indexed[j]?.val;
      fields[INDEXED_NAMES[j]] = v == null ? "null" : String(v);
    }
    for (let j = 0; j < BODY_NAMES.length; j++) {
      const v = decodedLog.body[j]?.val;
      fields[BODY_NAMES[j]] = v == null ? "null" : String(v);
    }

    console.log("---");
    console.log(`blockNumber:      ${blockNumber}`);
    console.log(
      `timestamp:        ${timestamp ?? "n/a"}${
        timestamp != null
          ? ` (${new Date(Number(timestamp) * 1000).toISOString()})`
          : ""
      }`,
    );
    console.log(`transactionHash:  ${log.transactionHash}`);
    console.log(`exchange:         ${log.address}`);
    for (const [name, val] of Object.entries(fields)) {
      console.log(`${(name + ":").padEnd(19)}${val}`);
    }
  }

  console.log("---");
  console.log(
    `Done. ${matched} OrderFilled events of ${logs.length} total logs in last 10 blocks.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
