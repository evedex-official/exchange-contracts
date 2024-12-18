import { useBlockNumber, useReadContracts } from "wagmi";
import { Address } from "viem";

import { convertCallsResult, getContractCalls } from "../helpers";
import { Btc, DepositDEX, Usdt } from "../contracts";
import { CallConfig } from "../interfaces";

import { Collateral } from "../helpers/event-horizon-types";
import { useEffect } from "react";

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

const useDepositDex = () => {
  const calls: CallConfig[] = [
    {
      key: "collaterals",
      functionName: "getCollaterals",
      defaultValue: [],
      format: (value: Address[]) => {
        const mergedCollaterals: Collateral[] = [];

        value.forEach((collateral, index) => {
          const config = collateralsConfig[collateral];
          if (config) {
            mergedCollaterals.push({
              ...config,
              index,
            });
          }
        });

        return mergedCollaterals;
      },
    },
  ];
  const contractsCalls = getContractCalls(calls, {
    address: DepositDEX.address,
    abi: DepositDEX.abi,
  });
  const { data, isLoading, refetch } = useReadContracts({
    contracts: contractsCalls,
  });

  const { data: blockNumber } = useBlockNumber({ watch: true });

  useEffect(() => {
    refetch();
  }, [blockNumber]);

  const depositDexData = convertCallsResult(calls, data);

  return {
    data: depositDexData,
    isLoading,
  };
};

export default useDepositDex;
