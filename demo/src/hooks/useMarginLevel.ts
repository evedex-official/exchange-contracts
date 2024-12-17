import { useAccount, useReadContract } from "wagmi";
import { Address } from "viem";

import { EveDEX } from "../contracts";

const useMarginLevel = (instrumentPrices: any, collateralPrices: any) => {
  const { data } = useReadContract({
    functionName: "calculateMarginLevel",
    address: EveDEX.address as Address,
    abi: EveDEX.abi,
    args: [
      address,
      instrumentPrices, // Current instrument prices
      collateralPrices, // Current collateral prices
      true, // Check prices flag
      Math.floor(Date.now() / 1000), // Historical timestamp
      0n, // History search hint (optimization for gas)
    ],
  });

  const [marginLevel, equity, margin, pnls, frs] = data as any[];
  return { marginLevel, equity, margin, pnls, frs } as {
    marginLevel: bigint;
    equity: bigint;
    margin: bigint;
  };
};

export default useMarginLevel;
