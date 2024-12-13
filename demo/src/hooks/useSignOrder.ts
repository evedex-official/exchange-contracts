import { Address, zeroHash } from "viem";
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
    sessionWallet,
    side,
    collateral = Usdt.address,
    instrumentIndex = BTC_USD_INDEX,
    collateralIndex = USDT_COLLATERAL_INDEX,
  }: {
    amount: bigint;
    leverage: bigint;
    sessionWallet: Address;
    side: number;
    collateral: Address;
    instrumentIndex: number;
    collateralIndex: number;
  }) => {
    const { order } = createOrderExtended({
      collateralIndex,
      senderAddress: address,
      matcherAddress: MATCHER_ADDRESS,
      collateral,
      instrumentIndex,
      side,
      amount,
      price: btc,
      leverage,
      userSession: sessionWallet,
    });
    const data = {
      message: order,
      types: orderTypes,
      domain: domain(EveDEX.address as Address, chainId!),
      primaryType: "Order",
    };
    return await signTypedDataAsync(data);
  };

  return { signOrder };
};

export default useSignOrder;
