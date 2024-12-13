import { Address, Hash, zeroAddress, zeroHash } from "viem";
import { useAccount, useSignTypedData } from "wagmi";
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
  price: number;
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
  const { address, chainId } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { btc } = usePrices();

  const signOrder = async ({
    amount,
    leverage = 100n,
    senderWallet,
    side,
    collateral = Usdt.address,
    instrumentIndex = BTC_USD_INDEX,
    collateralIndex = USDT_COLLATERAL_INDEX,
  }: {
    amount: bigint;
    leverage: bigint;
    senderWallet: Address;
    side: number;
    collateral: Address;
    instrumentIndex: number;
    collateralIndex: number;
  }) => {
    const userSession =
      senderWallet === address ? zeroAddress : (address as Address);
    const { order } = createOrderExtended({
      collateralIndex,
      senderAddress: senderWallet,
      matcherAddress: MATCHER_ADDRESS,
      collateral,
      instrumentIndex,
      side,
      amount,
      price: btc,
      leverage,
      userSession,
    });
    const data = {
      message: order,
      types: orderTypes,
      domain: domain(EveDEX.address as Address, chainId!),
      primaryType: "Order" as any,
    };
    return await signTypedDataAsync(data);
  };

  return { signOrder };
};

export default useSignOrder;
