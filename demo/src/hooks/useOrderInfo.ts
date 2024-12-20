import { useBlockNumber, useReadContracts } from "wagmi";

import { convertCallsResult, getContractCalls } from "../helpers";
import { Order } from "../helpers/event-horizon-types";
import { getOrderDigest } from "../helpers/contract-data-helpers";

import { EveDEX } from "../contracts";
import { CallConfig } from "../interfaces";
import { useEffect } from "react";

const useOrderInfo = (order: Order) => {
  const orderHash = getOrderDigest(order);
  const calls: CallConfig[] = [
    {
      key: "filledAmount",
      functionName: "filledAmounts",
      args: [orderHash],
      defaultValue: 0n,
    },
  ];
  const contractCalls = getContractCalls(calls, {
    address: EveDEX.address,
    abi: EveDEX.abi,
  });
  const { data, isLoading, refetch } = useReadContracts({
    contracts: contractCalls,
  });
  const convertedData = convertCallsResult(calls, data);

  const { data: blockNumber } = useBlockNumber({ watch: true });

  useEffect(() => {
    refetch();
  }, [blockNumber]);

  return { data: convertedData, isLoading };
};

export default useOrderInfo;
