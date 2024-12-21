import { useBlockNumber, useReadContracts } from "wagmi";
import { Address } from "viem";

import { convertCallsResult, getContractCalls } from "../helpers";
import { EveDEX } from "../contracts";
import { CallConfig } from "../interfaces";
import { useEffect } from "react";
import useMarginLevel from "./useMarginLevel";
import { useInstrumentsPrices } from "./useInstruments";
import { useCollateralsPrices } from "./useCollaterals";

const useEveDexAccount = (address: Address) => {
  const calls: CallConfig[] = [
    {
      key: "settledOrders",
      functionName: "settledOrders",
      args: [address],
    },
    {
      key: "activeInstrumentsIndexes",
      functionName: "getActiveInstrumentsIndexes",
      args: [address],
    },
    {
      key: "activeInstrumentsPositions",
      functionName: "getActiveInstrumentsPositions",
      args: [address],
    },
  ];
  const contractCalls = getContractCalls(calls, {
    address: EveDEX.address,
    abi: EveDEX.abi,
  });
  const { data, isLoading, refetch } = useReadContracts({
    contracts: contractCalls,
  });

  const instrumentsPrices = useInstrumentsPrices();
  const collateralsPrices = useCollateralsPrices();

  const { data: marginData, isLoading: isLoadingMarginData } = useMarginLevel(
    address,
    instrumentsPrices,
    collateralsPrices
  );

  const { data: blockNumber } = useBlockNumber({ watch: true });

  useEffect(() => {
    refetch();
  }, [blockNumber]);

  const accountData = convertCallsResult(calls, data) as {
    settledOrders: bigint;
    activeInstrumentsIndexes: bigint[];
    activeInstrumentsPositions: [
      bigint[],
      {
        position: bigint;
        frAccumulated: bigint;
        positionLastUpdate: bigint;
        positionAvgPrice: bigint;
        positionLongFRStored: bigint;
        positionShortFRStored: bigint;
        leverage: bigint;
      }[]
    ];
  };

  return {
    data: { ...accountData, ...marginData },
    isLoading: isLoading || isLoadingMarginData,
  };
};

export default useEveDexAccount;
