import { Address, Hash, PrivateKeyAccount, zeroAddress, zeroHash } from "viem";
import { useAccount, useChainId, useSignTypedData } from "wagmi";
import {
  BTC_USD_INDEX,
  USDT_COLLATERAL_INDEX,
  MATCHER_ADDRESS,
} from "../constants";
import { EveDEX, Usdt } from "../contracts";
import { orderTypes, domain } from "../helpers/eip721";
import usePrices from "./usePrices";

const createOrderExtended = ({
  collateralIndex,
  senderAddress,
  matcherAddress,
  collateral,
  instrumentIndex,
  amount,
  price,
  side,
  userSession,
  leverage = 1n,
  matcherFee = 0n,
  expiration = Math.floor(Date.now() / 1000) + 3600,
  merkleRoot = zeroHash,
  merkleProof = [],
}: {
  collateralIndex: number;
  senderAddress: Address;
  matcherAddress: Address;
  collateral: Address;
  instrumentIndex: number;
  amount: bigint;
  price: bigint;
  side: number;
  userSession: Address;
  leverage?: bigint;
  matcherFee?: bigint;
  expiration?: number;
  merkleRoot?: Hash;
  merkleProof?: any[];
}) => {
  return {
    collateralIndex,
    order: {
      senderAddress,
      matcherAddress,
      collateral,
      instrumentIndex,
      amount,
      price,
      leverage,
      matcherFee,
      expiration,
      side,
      userSession,
      merkleRoot,
      merkleProof,
      signature: "0x",
    },
  };
};

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
    const { order } = createOrderExtended({
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
      message: order,
      types: orderTypes,
      domain: domain(EveDEX.address as Address, chainId!),
      primaryType: "Order" as any,
      account,
    };
    const signature = await signTypedDataAsync(data);
    order.signature = signature;
    return order;
  };

  return { signOrder };
};

export default useSignOrder;
