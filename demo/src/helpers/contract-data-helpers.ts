import {
  Address,
  zeroHash,
  Hash,
  Hex,
  encodeAbiParameters,
  keccak256,
} from "viem";

import { DepositDEX, EveDEX } from "../contracts";

import { domain, orderTypes, orderWithdrawalTypes } from "./eip721-types";
import { OrderExtended, Order, WithdrawalRequest } from "./event-horizon-types";
import { ORDER_TYPEHASH } from "../constants";

export const createOrderExtended = ({
  orderId,
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
  creationTime = Math.floor(Date.now() / 1000),
  merkleRoot = zeroHash,
  merkleProof = [],
}: {
  orderId: number;
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
  creationTime?: number;
  merkleRoot?: Hash;
  merkleProof?: any[];
}): OrderExtended => {
  return {
    collateralIndex,
    order: {
      orderId,
      senderAddress,
      matcherAddress,
      collateral,
      instrumentIndex,
      amount,
      price,
      leverage,
      matcherFee,
      creationTime,
      side,
      userSession,
      merkleRoot,
      merkleProof,
      signature: "0x",
    },
  };
};

export const getOrderDigest = (order: Order) => {
  const encodedData = encodeAbiParameters(
    [
      { type: "bytes32", name: "ORDER_TYPEHASH" },
      { type: "uint256", name: "orderId" },
      { type: "address", name: "senderAddress" },
      { type: "address", name: "matcherAddress" },
      { type: "uint256", name: "instrumentIndex" },
      { type: "uint256", name: "amount" },
      { type: "uint256", name: "price" },
      { type: "uint256", name: "matcherFee" },
      { type: "uint256", name: "creationTime" },
      { type: "uint8", name: "side" },
    ],
    [
      ORDER_TYPEHASH,
      BigInt(order.orderId),
      order.senderAddress,
      order.matcherAddress,
      BigInt(order.instrumentIndex),
      order.amount,
      order.price,
      order.matcherFee,
      BigInt(order.creationTime),
      order.side,
    ]
  );
  return keccak256(encodedData);
};

export const createOrderDataToSign = (order: Order, chainId: number) => {
  return {
    message: order,
    types: orderTypes,
    domain: domain(EveDEX.address as Address, chainId),
    primaryType: "Order" as any,
  };
};

export const createWithdrawRequest = ({
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

export const createWithdrawDataToSign = (
  withdrawalRequest: WithdrawalRequest,
  chainId: number
) => {
  return {
    message: withdrawalRequest,
    types: orderWithdrawalTypes,
    domain: domain(DepositDEX.address as Address, chainId),
    primaryType: "OrderWithdrawal" as any,
  };
};

export const getWithdrawalRequestHash = (
  withdrawalRequest: WithdrawalRequest
) => {
  const encodedData = encodeAbiParameters(
    [
      {
        type: "tuple",
        name: "order",
        components: [
          { type: "address", name: "collateral" },
          { type: "address", name: "account" },
          { type: "uint256", name: "amount" },
          { type: "address", name: "session" },
          { type: "uint256", name: "expiration" },
          { type: "bytes", name: "signature" },
        ],
      },
    ],
    [
      {
        collateral: withdrawalRequest.collateral,
        account: withdrawalRequest.account,
        amount: withdrawalRequest.amount,
        session: withdrawalRequest.session,
        expiration: BigInt(withdrawalRequest.expiration),
        signature: withdrawalRequest.signature,
      },
    ]
  );
  return keccak256(encodedData);
};

export const createMultiLiquidationOrder = ({
  accountToLiquidate,
  liquidator,
  collateral,
  liquidationPrices,
  prices,
  leverage,
  liquidationTimestamp = Math.floor(Date.now() / 1000),
  expiration = Math.floor(Date.now() / 1000) + 3600,
}: {
  accountToLiquidate: Address;
  liquidator: Address;
  collateral: Address;
  liquidationPrices: { index: number; price: bigint }[];
  prices: { index: number; price: bigint }[];
  leverage: bigint;
  liquidationTimestamp?: number;
  expiration?: number;
}) => {
  return {
    accountToLiquidate,
    liquidator,
    collateral,
    liquidationPrices,
    prices,
    leverage,
    liquidationTimestamp,
    expiration,
    signature: "0x",
  };
};
