import { useReadContracts } from "wagmi";

import { CallConfig } from "../interfaces";

import { convertCallsResult, getContractCalls } from "../helpers";
import { EveDEX } from "../contracts";
import { zeroAddress } from "viem";

const useEveDex = () => {
  const calls: CallConfig[] = [
    {
      key: "soLevel",
      functionName: "soLevel",
      args: [],
    },
    {
      key: "accountsWithOpenPositionLength",
      functionName: "getAccountsWithOpenPositionLength",
      args: [],
      defaultValue: [],
    },
    { functionName: "fundingRateAccount", args: [], key: "fundingRateAccount" },
    {
      functionName: "sessionManager",
      args: [],
      key: "sessionManager",
      defaultValue: zeroAddress,
    },
    {
      functionName: "depositDex",
      args: [],
      key: "depositDex",
      defaultValue: zeroAddress,
    },
    {
      functionName: "withdrawMarginLevel",
      args: [],
      key: "withdrawMarginLevel",
    },
    {
      functionName: "liquidationFeePercent",
      args: [],
      key: "liquidationFeePercent",
      defaultValue: 0n,
    },
    {
      functionName: "instrumentsLength",
      args: [],
      key: "instrumentsLength",
      defaultValue: 0,
    },
    {
      functionName: "maxOpenPositions",
      args: [],
      key: "maxOpenPositions",
      defaultValue: 0,
    },
  ];
  const contractCalls = getContractCalls(calls, {
    address: EveDEX.address,
    abi: EveDEX.abi,
  });
  const { data, isLoading } = useReadContracts({
    contracts: contractCalls,
  });

  const eveDexData = convertCallsResult(calls, data);

  return {
    data: eveDexData,
    isLoading,
  };
};

export default useEveDex;
