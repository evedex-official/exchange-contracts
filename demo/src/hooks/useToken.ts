import { useReadContracts } from "wagmi";
import { Address, erc20Abi } from "viem";

import { CallConfig } from "../interfaces";

import { convertCallsResult } from "../helpers";

export const useToken = (tokenAddress: Address) => {
  const config = {
    address: tokenAddress,
    abi: erc20Abi,
  };
  const calls: CallConfig[] = [
    {
      ...config,
      key: "decimals",
      functionName: "decimals",
    },
    {
      ...config,
      key: "symbol",
      functionName: "symbol",
    },
    {
      ...config,
      key: "name",
      functionName: "name",
    },
  ];
  const { data, isLoading } = useReadContracts({
    contracts: calls,
  });

  const { decimals, symbol, name } = convertCallsResult(calls, data);

  return { decimals, symbol, name, isLoading };
};

export default useToken;
