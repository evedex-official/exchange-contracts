'use strict';

const { parsePrice } = require('../helpers/utils');
const { BUY_SIDE, BTC_USD_INDEX, SELL_SIDE, USDT_DECIMALS, BTC_DECIMALS } = require('../helpers/constants');

module.exports = {
  USDT_PRICE: parsePrice(1.0, {
    tokenDecimals: USDT_DECIMALS,
  }),
  BTC_PRICE: parsePrice(100_000, {
    tokenDecimals: BTC_DECIMALS,
  }),
  ALICE_ORDER_CONFIG: {
    side: BUY_SIDE,
    amount: 10n,
    leverage: 1n,
    instrumentPrice: {
      index: BTC_USD_INDEX,
      price: parsePrice(101_000, {
        tokenDecimals: BTC_DECIMALS,
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
        tokenDecimals: BTC_DECIMALS,
      }),
    },
  },
};
