import { useWriteContract } from "wagmi";
import {
  Address,
  maxUint32,
  maxUint64,
  maxUint128,
  PrivateKeyAccount,
} from "viem";

import { SessionManager } from "../contracts";

const useCreateSession = () => {
  const { writeContractAsync } = useWriteContract();
  const createSession = async ({
    account,
    sessionWallet,
    expirationTs = maxUint64,
    limitMaxOrders = false,
    ordersAllowed = maxUint32,
    limitAllowance = true,
    allowanceAllowed = maxUint128,
    limitWithdrawals = false,
    withdrawConfig = [],
  }: {
    account: PrivateKeyAccount;
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
      user: account.address,
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
      account,
    });
  };
  return {
    createSession,
  };
};

export default useCreateSession;
