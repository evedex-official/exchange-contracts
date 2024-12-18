import { useReadContracts } from "wagmi";

import { convertCallsResult, getContractCalls } from "../helpers";
import { Order } from "../helpers/event-horizon-types";
import { getOrderDigest } from "../helpers/contract-data-helpers";

import { EveDEX } from "../contracts";
import { CallConfig } from "../interfaces";

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
  const { data, isLoading } = useReadContracts({
    contracts: contractCalls,
  });
  const convertedData = convertCallsResult(calls, data);

  return { data: convertedData, isLoading };
};

export default useOrderInfo;
