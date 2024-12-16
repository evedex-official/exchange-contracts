import { Address, PrivateKeyAccount } from "viem";
import { useChainId, useSignTypedData } from "wagmi";
import { BTC_USD_INDEX, USDT_COLLATERAL_INDEX } from "../constants";
import { Usdt } from "../contracts";
import usePrices from "./usePrices";
import { getRandom } from "../helpers";
import {
  createOrderExtended,
  createOrderDataToSign,
} from "../helpers/contract-data-helpers";

const useSignOrder = () => {
  const chainId = useChainId();
  const { signTypedDataAsync } = useSignTypedData();
  const { BTC } = usePrices();

  const signOrder = async ({
    account,
    amount,
    leverage = 100n,
    senderWallet,
    userSessionWallet,
    matcherAddress,
    side,
    collateral = Usdt.address,
    instrumentIndex = BTC_USD_INDEX,
    collateralIndex = USDT_COLLATERAL_INDEX,
  }: {
    account: PrivateKeyAccount;
    amount: bigint;
    leverage: bigint;
    senderWallet: Address;
    userSessionWallet: Address;
    matcherAddress: Address;
    side: number;
    collateral: Address;
    instrumentIndex: number;
    collateralIndex: number;
  }) => {
    const orderExtended = createOrderExtended({
      orderId: getRandom(1, 999999999),
      collateralIndex,
      senderAddress: senderWallet,
      matcherAddress,
      collateral,
      instrumentIndex,
      side,
      amount,
      price: BTC,
      leverage,
      userSession: userSessionWallet,
    });
    const data = {
      ...createOrderDataToSign(orderExtended.order, chainId!),
      account,
    };
    const signature = await signTypedDataAsync(data);
    orderExtended.order.signature = signature;
    return orderExtended;
  };

  return { signOrder };
};

export default useSignOrder;
