import { Address } from "viem";
import { parsePrice } from "../helpers";

import { useConfig } from "../providers/ConfigProvider";
import useCollaterals from "./useCollaterals";

const usePrices = () => {
  const { prices } = useConfig();
  const { collaterals } = useCollaterals();

  const parsedPrices = collaterals.reduce((acc, collateral) => {
    acc[collateral.address] = parsePrice(prices[collateral.address], {
      tokenDecimals: BigInt(collateral.decimals),
    });
    return acc;
  }, {} as { [x: Address]: bigint });

  return parsedPrices;
};

export default usePrices;
