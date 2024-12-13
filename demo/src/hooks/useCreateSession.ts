import { useAccount, useWriteContract } from "wagmi";
import { Address, maxUint32, maxUint64, maxUint128 } from "viem";

import { SessionManager } from "../contracts";

const useCreateSession = () => {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract({});
  const createSession = async ({
    sessionWallet,
    expirationTs = maxUint64,
    limitMaxOrders = false,
    ordersAllowed = maxUint32,
    limitAllowance = true,
    allowanceAllowed = maxUint128,
    limitWithdrawals = false,
    withdrawConfig = [],
  }: {
    sessionWallet: Address;
    expirationTs: bigint;
    limitMaxOrders: boolean;
    ordersAllowed: bigint;
    limitAllowance: boolean;
    allowanceAllowed: bigint;
    limitWithdrawals: boolean;
    withdrawConfig: any[];
  }) => {
    const session = {
      user: address,
      expiration: expirationTs,
      limitMaxOrders,
      ordersAllowed,
      limitAllowance,
      allowanceAllowed,
      limitWithdrawals,
    };
    return await writeContractAsync({
      functionName: "setSession",
      address: SessionManager.address as Address,
      abi: SessionManager.abi,
      args: [sessionWallet, session, withdrawConfig],
    });
  };
  return {
    createSession,
  };
};

export default useCreateSession;
