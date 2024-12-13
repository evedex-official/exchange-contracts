import { useEffect } from "react";
import { useAccount, useReadContract, useBlockNumber } from "wagmi";
import { Address } from "viem";

import { SessionManager } from "../contracts";

const useSession = () => {
  const { address } = useAccount();
  const { data, isLoading, refetch } = useReadContract({
    functionName: "getSessions",
    address: SessionManager.address as Address,
    abi: SessionManager.abi,
    args: [address],
  });

  const { data: blockNumber } = useBlockNumber({ watch: true });

  useEffect(() => {
    refetch();
  }, [blockNumber]);

  return { data, isLoading };
};

export default useSession;
