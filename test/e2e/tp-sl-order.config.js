'use strict';

const { parsePrice } = require('../helpers/utils');
const {
  USDT_DECIMALS,
  USD_DECIMALS,
  PRECISION_DECIMALS_DEPOSIT_DEX,
  PRECISION_DECIMALS_EVEDEX,
  BTC_DECIMALS,
} = require('../helpers/constants');

module.exports = {
  USDT_COLLATERAL_PRICE: parsePrice(1.0, {
    tokenInDecimals: USDT_DECIMALS,
    tokenOutDecimals: USD_DECIMALS,
    precisionDecimals: PRECISION_DECIMALS_DEPOSIT_DEX,
  }),
  BTC_COLLATERAL_PRICE: parsePrice(100_000, {
    tokenInDecimals: BTC_DECIMALS,
    tokenOutDecimals: USD_DECIMALS,
    precisionDecimals: PRECISION_DECIMALS_DEPOSIT_DEX,
  }),
  ORDER_LEVERAGE: 100n,
  USDT_DEPOSIT_AMOUNT: 100n * USDT_DECIMALS,

  MARKET_ORDER_AMOUNT: 10n,
  TP_ORDER_AMOUNT: 10n,
  SL_ORDER_AMOUNT: 10n,

  BTC_INSTRUMENT_INITIAL_PRICE: parsePrice(100_000, {
    precisionDecimals: PRECISION_DECIMALS_EVEDEX,
  }), // price of the order
  // Trigger price for TP or SL order
  TRIGGER_BTC_PRICE: parsePrice(90_000, {
    precisionDecimals: PRECISION_DECIMALS_EVEDEX,
  }),
  // Trigger collateral price for TP or SL order
  BTC_COLLATERAL_TRIGGER_PRICE: parsePrice(90_000, {
    tokenInDecimals: BTC_DECIMALS,
    tokenOutDecimals: USD_DECIMALS,
    precisionDecimals: PRECISION_DECIMALS_DEPOSIT_DEX,
  }),
  TP_ORDER_PRICE: parsePrice(110_000, {
    precisionDecimals: PRECISION_DECIMALS_EVEDEX,
  }),
  SL_ORDER_PRICE: parsePrice(90_000, {
    precisionDecimals: PRECISION_DECIMALS_EVEDEX,
  }),
};
