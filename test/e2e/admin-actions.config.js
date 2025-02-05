'use strict';

const { ETH_USD_SYMBOL, ETH_USD_INDEX, FR_PRECISION } = require('../helpers/constants');

module.exports = {
  ...require('./order-buy-sell.config'),
  ETH_USD_INSTRUMENT: {
    SYMBOL: ETH_USD_SYMBOL,
    INDEX: ETH_USD_INDEX,
    MAX_LEVERAGE: 100n,
    DAILY_FR_LONG: 86400n,
    DAILY_FR_SHORT: 86400n,
    STATIC_FR: 0n,
  },
  NEW_BTC_FR_LONG: (FR_PRECISION * 1n) / 1000n, // 0.01 %
  NEW_BTC_FR_SHORT: -((FR_PRECISION * 1n) / 1000n), // -0.01 %
  ORDER_AMOUNT: 100_000n,
};
