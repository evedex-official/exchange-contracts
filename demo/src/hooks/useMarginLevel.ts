import { useReadContract } from "wagmi";
import { Address } from "viem";

import { EveDEX } from "../contracts";

const useMarginLevel = (
  address: Address,
  instrumentPrices: any,
  collateralPrices: any
) => {
  const args = [
    address,
    instrumentPrices, // Current instrument prices
    collateralPrices, // Current collateral prices
    true, // Check prices flag
    Math.floor(Date.now() / 1000), // Historical timestamp
    0n, // History search hint (optimization for gas)
  ];

  const { data, isLoading } = useReadContract({
    functionName: "calculateMarginLevel",
    address: EveDEX.address as Address,
    abi: EveDEX.abi,
    args,
    query: {
      enabled: instrumentPrices.length > 0 && collateralPrices.length > 0,
    },
  });

  const [marginLevel, equity, margin, pnls, frs] = (data as any[]) || [];

  return { data: { marginLevel, equity, margin, pnls, frs }, isLoading } as {
    data: {
      marginLevel: bigint;
      equity: bigint;
      margin: bigint;
      pnls: bigint[];
      frs: bigint[];
    };
    isLoading: boolean;
  };
};

export default useMarginLevel;
