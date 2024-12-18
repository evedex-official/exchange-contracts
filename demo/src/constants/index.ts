import { keccak256, toBytes } from "viem";

export const BUY_SIDE = 1;
export const SELL_SIDE = 0;
export const BTC_USD_INDEX = 0;
export const BTC_USD_SYMBOL = "BTC/USD";
export const ETH_USD_INDEX = 1;
export const ETH_USD_SYMBOL = "ETH/USD";
export const USDT_COLLATERAL_INDEX = 0;
export const BTC_COLLATERAL_INDEX = 1;
export const INT_PRECISION_EVEDEX = 10n ** 8n;
export const INT_PRECISION_DEPOSIT_DEX = 10n ** 8n;
export const USDT_DECIMALS = 6n;
export const BTC_DECIMALS = 8n;
export const MATCHER_ADDRESS = import.meta.env.VITE_MATCHER_ADDRESS || "";

export const ORDER_TYPEHASH = keccak256(
  toBytes(
    "Order(uint256 orderId,address senderAddress,address matcherAddress,address collateral,uint256 instrumentIndex,uint256 amount,uint256 price,uint16 leverage,uint256 matcherFee,uint256 creationTime,uint8 side)"
  )
);

export const WITHDRAW_REQUEST_TYPEHASH = keccak256(
  toBytes(
    "OrderWithdrawal(address collateral,address account,uint256 amount,address session,uint256 expiration)"
  )
);

export enum LC_STORAGE_KEY {
  ORDERS = "EH-DEMO-ORDERS",
  WITHDRAW_REQUESTS = "EH-DEMO-WITHDRAW-REQUESTS",
  PRICES = "EH-DEMO-PRICES",
}
