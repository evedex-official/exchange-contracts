import { useBlockNumber, useReadContract } from "wagmi";
import { Address, formatUnits } from "viem";

import useToken from "./useToken";
import { DepositDEX } from "../contracts";
import { useEffect } from "react";

export const useBalance = (tokenAddress: Address, userAddress: Address) => {
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

  return {
    isLoading,
    formatted: formatUnits((data as bigint) || 0n, token.decimals),
    original: data,
    token,
  };
};

export default useBalance;
