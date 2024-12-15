import { useEffect, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useBlockNumber,
} from "wagmi";
import {
  Address,
  erc20Abi,
  maxUint256,
  formatUnits,
  PrivateKeyAccount,
  zeroAddress,
} from "viem";

import useToken from "./useToken";
import { toast } from "react-toastify";

const useApprove = ({
  account,
  source,
  spender,
}: {
  account?: PrivateKeyAccount;
  source: Address;
  spender: Address;
}) => {
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const token = useToken(source);
  const contractConfig = {
    address: source as any,
    abi: erc20Abi,
  };
  const { writeContractAsync } = useWriteContract();
  const { isLoading, data, refetch } = useReadContract({
    ...contractConfig,
    functionName: "allowance",
    args: [account?.address || zeroAddress, spender],
    query: {
      enabled: !!account?.address && !!source,
    },
  });

  const { data: blockNumber } = useBlockNumber({ watch: true });

  useEffect(() => {
    refetch();
  }, [blockNumber]);

  const onMaxApprove = async () => {
    try {
      setIsApproving(true);
      const tx = await writeContractAsync({
        ...contractConfig,
        functionName: "approve",
        args: [spender, maxUint256],
        account,
      });
      toast.success("Approved");
      return tx;
    } catch (e) {
      console.error(e);
      toast.error(`Error: ${(e as any).message}`);
    } finally {
      setIsApproving(false);
    }
  };

  const weiAllowance = data || 0n;

  const allowance = formatUnits(weiAllowance, token.decimals);

  return {
    isLoading,
    weiAllowance,
    allowance,
    isApproving,
    onMaxApprove,
  };
};

export default useApprove;
