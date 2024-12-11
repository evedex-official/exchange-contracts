import { useReadContracts } from "wagmi";
import { Address, erc20Abi } from "viem";

import { CallConfig } from "../interfaces";

import { convertCallsResult } from "../helpers";

const useBalances = (tokens: Address[], address: Address) => {
  const calls: CallConfig[] = tokens.map((token) => ({
    key: token,
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  }));

  const { data, isLoading } = useReadContracts({
    contracts: calls,
    query: {
      enabled: !!address && calls.length > 0,
      refetchInterval: 1000,
    },
  });

  const balances = convertCallsResult(calls, data);

  return {
    balances,
    isLoading,
  };
};

export default useBalances;
