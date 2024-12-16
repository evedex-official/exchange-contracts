import { parsePrice } from "../helpers";

import { useConfig } from "../providers/ConfigProvider";

const usePrices = () => {
  const { prices } = useConfig();

  return {
    BTC: parsePrice(prices.BTC, {
      tokenDecimals: 18n,
    }),
    USDT: parsePrice(prices.USDT, {
      tokenDecimals: 6n,
    }),
  };
};

export default usePrices;
