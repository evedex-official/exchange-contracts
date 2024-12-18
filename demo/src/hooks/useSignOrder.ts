import { Address, Hex, PrivateKeyAccount } from "viem";
import { useChainId, useSignTypedData } from "wagmi";
import { BTC_USD_INDEX, USDT_COLLATERAL_INDEX } from "../constants";
import { Usdt } from "../contracts";
import { getRandom } from "../helpers";
import {
  createOrderExtended,
  createOrderDataToSign,
  getOrdersMerkleTree,
  createMultiOrderDataToSign,
} from "../helpers/contract-data-helpers";
import { OrderExtended } from "../helpers/event-horizon-types";

type OrderToSign = {
  amount: bigint;
  leverage: bigint;
  instrumentPrice: bigint;
  senderWallet: Address;
  userSessionWallet: Address;
  matcherAddress: Address;
  side: number;
  collateral: Address;
  instrumentIndex: number;
  collateralIndex: number;
};

const useSignOrder = () => {
  const chainId = useChainId();
  const { signTypedDataAsync } = useSignTypedData();

  const signOrder = async (
    {
      amount,
      leverage = 100n,
      senderWallet,
      userSessionWallet,
      matcherAddress,
      side,
      instrumentPrice,
      collateral = Usdt.address,
      instrumentIndex = BTC_USD_INDEX,
      collateralIndex = USDT_COLLATERAL_INDEX,
    }: OrderToSign,
    account: PrivateKeyAccount
  ) => {
    const orderExtended = createOrderExtended({
      orderId: getRandom(1, 999999999),
      collateralIndex,
      senderAddress: senderWallet,
      matcherAddress,
      collateral,
      instrumentIndex,
      side,
      amount,
      price: instrumentPrice,
      leverage,
      userSession: userSessionWallet,
    });
    const dataToSign = createOrderDataToSign(orderExtended.order, chainId!);
    const signature = await signTypedDataAsync({ ...dataToSign, account });
    orderExtended.order.signature = signature;
    return orderExtended;
  };

  const signMultiOrder = async (
    orders: OrderToSign[],
    account: PrivateKeyAccount
  ) => {
    const ordersExt: OrderExtended[] = orders.map((order) =>
      createOrderExtended({
        orderId: getRandom(1, 999999),
        collateralIndex: order.collateralIndex,
        senderAddress: order.senderWallet,
        matcherAddress: order.matcherAddress,
        collateral: order.collateral,
        instrumentIndex: order.instrumentIndex,
        side: order.side,
        amount: order.amount,
        price: order.instrumentPrice,
        leverage: order.leverage,
        userSession: order.userSessionWallet,
      })
    );

    const merkleTree = getOrdersMerkleTree(ordersExt);
    const dataToSign = createMultiOrderDataToSign(
      merkleTree.root as Hex,
      chainId
    );
    const signature = await signTypedDataAsync({
      ...dataToSign,
      account,
    });

    return ordersExt.map((orderExt, i) => {
      return {
        collateralIndex: orderExt.collateralIndex,
        order: {
          ...orderExt.order,
          merkleRoot: merkleTree.root,
          merkleProof: merkleTree.getProof(i),
          signature,
        },
      } as OrderExtended;
    });
  };

  return { signOrder, signMultiOrder };
};

export default useSignOrder;
