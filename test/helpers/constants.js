'use strict';

const { keccak256, toBytes } = require('viem');

module.exports = {
  BUY_SIDE: 1,
  SELL_SIDE: 0,
  BTC_USD_INDEX: 0,
  BTC_USD_SYMBOL: 'BTC/USD',
  ETH_USD_INDEX: 1,
  ETH_USD_SYMBOL: 'ETH/USD',
  USDT_COLLATERAL_INDEX: 0,
  BTC_COLLATERAL_INDEX: 1,
  INT_PRECISION_EVEDEX: 10n ** 8n,
  ALLOWED_SLIPPAGE_EVEDEX: 3n * 10n ** 5n, // 0.3% max slippage between oracle prices and prices passed to convertBalance function
  INT_PRECISION_DEPOSIT_DEX: 10n ** 8n,
  USDT_DECIMALS: 6n,
  BTC_DECIMALS: 8n,
  ORDER_TYPEHASH: keccak256(
    toBytes(
      'Order(uint256 orderId,address senderAddress,address matcherAddress,address collateral,uint256 instrumentIndex,uint256 amount,uint256 price,uint16 leverage,uint256 matcherFee,uint256 creationTime,uint8 side)',
    ),
  ),
  FR_PRECISION: 10n ** 11n,
  PYTH_IDS: {
    USDT_PYTH_ID: toBytes('USDT_PYTH_ID', {
      size: 32,
    }),
    BTC_PYTH_ID: toBytes('BTC_PYTH_ID', {
      size: 32,
    }),
  },
};
