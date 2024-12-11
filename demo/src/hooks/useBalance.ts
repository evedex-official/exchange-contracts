import { useReadContract } from "wagmi";
import { erc20Abi, Address, formatUnits } from "viem";

import useToken from "./useToken";

export const useBalance = (tokenAddress: Address, userAddress: Address) => {
  const token = useToken(tokenAddress);
  const { data, isLoading } = useReadContract({
    address: tokenAddress as Address,
    functionName: "balanceOf",
    abi: erc20Abi,
    args: [userAddress as Address],
  });

  return {
    isLoading,
    formatted: formatUnits(data || 0n, token.decimals),
    original: data,
    token,
  };
};

export default useBalance;
