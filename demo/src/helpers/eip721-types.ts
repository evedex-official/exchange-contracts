import { Address } from "viem";

export const domain = (contractAddress: Address, chainId: number) => {
  return {
    name: "EVEDEX",
    version: "1",
    chainId: chainId,
    verifyingContract: contractAddress,
  };
};

export const orderWithdrawalTypes = {
  OrderWithdrawal: [
    { name: "collateral", type: "address" },
    { name: "account", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "session", type: "address" },
    { name: "expiration", type: "uint256" },
  ],
};

export const orderTypes = {
  Order: [
    { name: "orderId", type: "uint256" },
    { name: "senderAddress", type: "address" },
    { name: "matcherAddress", type: "address" },
    { name: "collateral", type: "address" },
    { name: "instrumentIndex", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "price", type: "uint256" },
    { name: "leverage", type: "uint16" },
    { name: "matcherFee", type: "uint256" },
    { name: "creationTime", type: "uint256" },
    { name: "side", type: "uint8" },
  ],
};

export const multiOrderTypes = {
  MultiOrder: [{ name: "merkleRoot", type: "bytes32" }],
};

export const multiOrderLiquidationTypes = {
  MultiOrderLiquidation: [
    { name: "accountToLiquidate", type: "address" },
    { name: "liquidator", type: "address" },
    { name: "liquidationPrices", type: "PriceData[]" },
    { name: "prices", type: "PriceData[]" },
    { name: "leverage", type: "uint16" },
    { name: "liquidationTimestamp", type: "uint256" },
    { name: "expiration", type: "uint256" },
  ],
  PriceData: [
    { name: "index", type: "uint256" },
    { name: "price", type: "uint256" },
  ],
};

export const orderLiquidationTypes = {
  OrderLiquidation: [
    { name: "accountToLiquidate", type: "address" },
    { name: "liquidator", type: "address" },
    { name: "collateral", type: "address" },
    { name: "index", type: "uint256" },
    { name: "prices", type: "PriceData[]" },
    { name: "leverage", type: "uint16" },
    { name: "liquidationTimestamp", type: "uint256" },
    { name: "expiration", type: "uint256" },
  ],
  PriceData: [
    { name: "index", type: "uint256" },
    { name: "price", type: "uint256" },
  ],
};
