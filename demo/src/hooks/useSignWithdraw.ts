import { Address, Hex, PrivateKeyAccount } from "viem";
import { useChainId, useSignTypedData, useWriteContract } from "wagmi";
import { DepositDEX } from "../contracts";
import { domain, orderWithdrawalTypes } from "../helpers/eip721";

const createWithdrawRequest = ({
  accountAddress,
  collateralAddress,
  amount,
  session,
  expiration,
}: {
  accountAddress: Address;
  collateralAddress: Address;
  amount: bigint;
  session: Address;
  expiration: number;
}) => {
  return {
    collateral: collateralAddress,
    account: accountAddress,
    amount,
    session,
    expiration,
    signature: "0x" as Hex,
  };
};

const useSignWithdraw = () => {
  const chainId = useChainId();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();

  const signWithdraw = async ({
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
      message: request,
      types: orderWithdrawalTypes,
      domain: domain(DepositDEX.address as Address, chainId!),
      primaryType: "OrderWithdrawal" as any,
      account,
    };
    const signature = await signTypedDataAsync(data);

    request.signature = signature as Hex;

    const tx = await writeContractAsync({
      functionName: "withdrawRequest",
      address: DepositDEX.address,
      abi: DepositDEX.abi,
      args: [request],
      account,
    });

    return { tx, request };
  };

  return { signWithdraw };
};

export default useSignWithdraw;
