'use strict';

const { parsePrice } = require('../helpers/utils');
const { BTC_DECIMALS, USDT_DECIMALS } = require('../helpers/constants');

module.exports = {
  USDT_PRICE: parsePrice(1.0, {
    tokenDecimals: USDT_DECIMALS,
  }),
  ORDER_LEVERAGE: 100n,
  USDT_DEPOSIT_AMOUNT: 100n * USDT_DECIMALS,

  MARKET_ORDER_AMOUNT: 10n,
  TP_ORDER_AMOUNT: 10n,
  SL_ORDER_AMOUNT: 10n,

  INITIAL_BTC_PRICE: parsePrice(100_000, {
    tokenDecimals: BTC_DECIMALS,
  }),
  // Trigger price for TP or SL order
  TRIGGER_BTC_PRICE: parsePrice(90_000, {
    tokenDecimals: BTC_DECIMALS,
  }),
  TP_ORDER_PRICE: parsePrice(110_000, {
    tokenDecimals: BTC_DECIMALS,
  }),
  SL_ORDER_PRICE: parsePrice(90_000, {
    tokenDecimals: BTC_DECIMALS,
  }),
};
