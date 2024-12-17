import { Address, Hex, PrivateKeyAccount, zeroAddress } from "viem";
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
    accountAddress,
    userSessionAccount,
  }: {
    account: PrivateKeyAccount;
    amount: bigint;
    collateralAddress: Address;
    accountAddress: Address;
    userSessionAccount?: PrivateKeyAccount;
  }) => {
    const session = userSessionAccount?.address || zeroAddress;
    const request = createWithdrawRequest({
      accountAddress,
      collateralAddress,
      amount,
      session,
      expiration: Math.floor(Date.now() / 1000) + 3600,
    });

    const signerAccount = userSessionAccount || account;

    const data = {
      ...createWithdrawDataToSign(request, chainId),
      account: signerAccount,
    };
    const signature = await signTypedDataAsync(data);

    request.signature = signature as Hex;

    return request;
  };

  const withdrawRequest = async (args: {
    account: PrivateKeyAccount;
    amount: bigint;
    collateralAddress: Address;
    accountAddress: Address;
    userSessionAccount?: PrivateKeyAccount;
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
