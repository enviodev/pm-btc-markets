import { indexer } from "generated";

indexer.onEvent(
  { contract: "CTFExchangeV2", event: "OrderFilled" },
  async ({ event, context }) => {

  },
);

