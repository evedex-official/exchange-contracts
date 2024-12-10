'use strict';

const { parsePrice } = require('../helpers/utils');
module.exports = {
  DEPOSIT_AMOUNT: 1n,
  WITHDRAW_AMOUNT: 1n,
  BTC_PRICE: parsePrice(100_000),
  USDT_PRICE: parsePrice(1.1),
};
