'use strict';

const { parsePrice } = require('../helpers/utils');
const { BTC_DECIMALS, USDT_DECIMALS } = require('../helpers/constants');

module.exports = {
  DEPOSIT_AMOUNT: 1n,
  WITHDRAW_AMOUNT: 1n,
  BTC_PRICE: parsePrice(100_000, {
    tokenDecimals: BTC_DECIMALS,
  }),
  USDT_PRICE: parsePrice(1.1, {
    tokenDecimals: USDT_DECIMALS,
  }),
};
