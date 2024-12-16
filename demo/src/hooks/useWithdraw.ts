import { Address, Hex, PrivateKeyAccount } from "viem";
import { useChainId, useSignTypedData, useWriteContract } from "wagmi";
import { DepositDEX } from "../contracts";
import {
  createWithdrawDataToSign,
  createWithdrawRequest,
} from "../helpers/contract-data-helpers";

const useWithdraw = () => {
  const chainId = useChainId();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();

  const signWithdrawRequest = async ({
    account,
    amount,
    collateralAddress,
    withdrawerWallet,
    userSessionWallet,
  }: {
    account: PrivateKeyAccount;
    amount: bigint;
    collateralAddress: Address;
    withdrawerWallet: Address;
    userSessionWallet: Address;
  }) => {
    const request = createWithdrawRequest({
      accountAddress: withdrawerWallet,
      collateralAddress,
      amount,
      session: userSessionWallet,
      expiration: Math.floor(Date.now() / 1000) + 3600,
    });

    const data = {
      ...createWithdrawDataToSign(request, chainId),
      account,
    };
    const signature = await signTypedDataAsync(data);

    request.signature = signature as Hex;

    return request;
  };

  const withdrawRequest = async (args: {
    account: PrivateKeyAccount;
    amount: bigint;
    collateralAddress: Address;
    withdrawerWallet: Address;
    userSessionWallet: Address;
  }) => {
    const request = await signWithdrawRequest(args);

    const tx = await writeContractAsync({
      functionName: "withdrawRequest",
      address: DepositDEX.address,
      abi: DepositDEX.abi,
      args: [request],
      account: args.account,
    });

    return { tx, request };
  };

  return { signWithdrawRequest, withdrawRequest };
};

export default useWithdraw;
