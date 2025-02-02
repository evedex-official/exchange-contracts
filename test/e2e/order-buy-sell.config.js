'use strict';

const { parsePrice } = require('../helpers/utils');
const { BTC_DECIMALS, USDT_DECIMALS } = require('../helpers/constants');

module.exports = {
  BTC_PRICE: parsePrice(100_000, {
    tokenDecimals: BTC_DECIMALS,
  }),
  USDT_PRICE: parsePrice(0.9, {
    tokenDecimals: USDT_DECIMALS,
  }),
  ORDER_LEVERAGE: 100n,
  USDT_DEPOSIT_AMOUNT: 100n * USDT_DECIMALS,
};
