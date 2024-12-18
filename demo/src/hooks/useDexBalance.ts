import { useBlockNumber, useReadContract, useReadContracts } from "wagmi";
import { Address, formatUnits } from "viem";

import useToken from "./useToken";
import { DepositDEX } from "../contracts";
import { useEffect } from "react";
import { CallConfig } from "../interfaces";
import { convertCallsResult, getContractCalls } from "../helpers";

const useBalance = (tokenAddress: Address, userAddress: Address) => {
  const token = useToken(tokenAddress);
  const { data, isLoading, refetch } = useReadContract({
    address: DepositDEX.address as Address,
    functionName: "getBalance",
    abi: DepositDEX.abi,
    args: [userAddress, tokenAddress],
  });

  const { data: blockNumber } = useBlockNumber({ watch: true });

  useEffect(() => {
    refetch();
  }, [blockNumber]);

  const value = ((data as any) as bigint) || 0n;

  return {
    isLoading,
    formatted: formatUnits(value || 0n, token.decimals),
    original: value,
    token,
  };
};

export const useDexBalances = (
  tokenAddresses: Address[],
  userAddress: Address
) => {
  const calls: CallConfig[] = tokenAddresses.map((tokenAddress) => ({
    key: tokenAddress,
    functionName: "getBalance",
    args: [userAddress, tokenAddress],
  }));
  const contractCalls = getContractCalls(calls, {
    address: DepositDEX.address,
    abi: DepositDEX.abi,
  });
  const { data, isLoading, refetch } = useReadContracts({
    contracts: contractCalls,
  });

  const dexBalances = convertCallsResult(calls, data);

  const { data: blockNumber } = useBlockNumber({ watch: true });

  useEffect(() => {
    refetch();
  }, [blockNumber]);

  return {
    isLoading,
    dexBalances,
  };
};

export default useBalance;
