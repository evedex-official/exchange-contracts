'use strict';

const { parsePrice } = require('../helpers/utils');
const {
  BUY_SIDE,
  BTC_USD_INDEX,
  SELL_SIDE,
  USDT_DECIMALS,
  BTC_DECIMALS,
  USD_DECIMALS,
  PRECISION_DECIMALS_DEPOSIT_DEX,
  PRECISION_DECIMALS_EVEDEX,
} = require('../helpers/constants');

module.exports = {
  BTC_COLLATERAL_PRICE: parsePrice(100_000, {
    tokenInDecimals: BTC_DECIMALS,
    tokenOutDecimals: USD_DECIMALS,
    precisionDecimals: PRECISION_DECIMALS_DEPOSIT_DEX,
  }),
  USDT_COLLATERAL_PRICE: parsePrice(1.0, {
    tokenInDecimals: USDT_DECIMALS,
    tokenOutDecimals: USD_DECIMALS,
    precisionDecimals: PRECISION_DECIMALS_DEPOSIT_DEX,
  }),
  ALICE_ORDER_CONFIG: {
    side: BUY_SIDE,
    amount: 10n,
    leverage: 1n,
    instrumentPrice: {
      index: BTC_USD_INDEX,
      price: parsePrice(101_000, {
        precisionDecimals: PRECISION_DECIMALS_EVEDEX,
      }),
    },
  },
  BOB_ORDER_CONFIG: {
    side: SELL_SIDE,
    amount: 5n,
    leverage: 1n,
    instrumentPrice: {
      index: BTC_USD_INDEX,
      price: parsePrice(99_000, {
        precisionDecimals: PRECISION_DECIMALS_EVEDEX,
      }),
    },
  },
};
