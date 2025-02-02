'use strict';

const { parsePrice } = require('../helpers/utils');
const { BTC_DECIMALS, USDT_DECIMALS } = require('../helpers/constants');

module.exports = {
  BTC_PRICE: parsePrice(100_000, {
    tokenDecimals: BTC_DECIMALS,
  }),
  USDT_PRICE: parsePrice(1.0, {
    tokenDecimals: USDT_DECIMALS,
  }),
  USDT_DEPOSIT_AMOUNT: 100_000n * USDT_DECIMALS,
  ORDER_LEVERAGE: 100n,
  ORDER_AMOUNT: 10n,
  NEW_ORDER_AMOUNT: 5n,
};
