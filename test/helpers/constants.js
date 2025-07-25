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
  MARGIN_CALC_MARGIN_PRECISION: 10_000, // Precision for margin calculations: contracts/helpers/MarginCalc.sol:15
  EVEDEX_MARGIN_PRECISION: 100, // Precision for margin calculations: contracts/helpers/EvedexMargin.sol:15
  ALLOWED_SLIPPAGE_EVEDEX: 3n * 10n ** 5n, // 0.3% max slippage between oracle prices and prices passed to convertBalance function
  INT_PRECISION_DEPOSIT_DEX: 10n ** 8n,
  ALLOWED_SLIPPAGE_DEPOSIT_DEX: 3n * 10n ** 5n, // 0.3% max slippage between oracle prices and prices passed to convertBalance function
  FR_PRECISION: 10n ** 11n,
  USDT_DECIMALS: 10n ** 6n,
  BTC_DECIMALS: 10n ** 8n,
  USD_DECIMALS: 10n ** 8n,
  PRECISION_DECIMALS_DEPOSIT_DEX: 10n ** 12n,
  PRECISION_DECIMALS_EVEDEX: 10n ** 8n,
  ORDER_TYPEHASH: keccak256(
    toBytes(
      'Order(uint256 orderId,address senderAddress,address matcherAddress,uint256 instrumentIndex,uint256 amount,uint256 price,bool limited,uint16 leverage,uint256 creationTime,uint8 side)',
    ),
  ),
  PYTH_IDS: {
    USDT_PYTH_ID: toBytes('USDT_PYTH_ID', {
      size: 32,
    }),
    BTC_PYTH_ID: toBytes('BTC_PYTH_ID', {
      size: 32,
    }),
  },
};
