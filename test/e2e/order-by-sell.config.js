'use strict';

const { parsePrice } = require('../helpers/utils');
module.exports = {
  BTC_PRICE: parsePrice(100_000),
  USDT_PRICE: parsePrice(1.1),
  ORDER_LEVERAGE: 100n,
  USDT_DEPOSIT_AMOUNT: 100n * 10n ** 6n,
};
