import { useBlockNumber, useReadContract, useReadContracts } from "wagmi";
import { Btc, DepositDEX, Usdt } from "../contracts";
import { Address } from "viem";
import { useEffect } from "react";

type Collateral = {
  address: Address;
  index: number;
  symbol: string;
  decimals: number;
  name: string;
};

const collateralsConfig = {
  [Usdt.address]: {
    address: Usdt.address,
    symbol: "USDT",
    name: "Tether",
    decimals: 6,
  },
  [Btc.address]: {
    address: Btc.address,
    symbol: "BTC",
    name: "Bitcoin",
    decimals: 18,
  },
};

const contractConfig = {
  abi: DepositDEX.abi,
  address: DepositDEX.address,
};

const useCollaterals = () => {
  const { data, isLoading, refetch } = useReadContract({
    ...contractConfig,
    functionName: "getCollaterals",
  });

  const { data: blockNumber } = useBlockNumber({ watch: true });

  useEffect(() => {
    refetch();
  }, [blockNumber]);

  const collaterals: Address[] = ((data as any) as Address[]) || [];

  const mergedCollaterals: Collateral[] = [];

  collaterals.forEach((collateral, index) => {
    const config = collateralsConfig[collateral];
    if (config) {
      mergedCollaterals.push({
        ...config,
        index,
      });
    }
  });

  return {
    collaterals: mergedCollaterals,
    isLoading: isLoading,
  };
};

export default useCollaterals;
