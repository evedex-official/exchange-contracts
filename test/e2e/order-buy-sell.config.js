'use strict';

const { parsePrice } = require('../helpers/utils');
const {
  BTC_DECIMALS,
  USDT_DECIMALS,
  USD_DECIMALS,
  PRECISION_DECIMALS_DEPOSIT_DEX,
  PRECISION_DECIMALS_EVEDEX,
} = require('../helpers/constants');

module.exports = {
  BTC_INSTRUMENT_PRICE: parsePrice(100_000, {
    precisionDecimals: PRECISION_DECIMALS_EVEDEX,
  }),
  BTC_COLLATERAL_PRICE: parsePrice(100_000, {
    tokenInDecimals: BTC_DECIMALS,
    tokenOutDecimals: USD_DECIMALS,
    precisionDecimals: PRECISION_DECIMALS_DEPOSIT_DEX,
  }),
  USDT_COLLATERAL_PRICE: parsePrice(0.9, {
    tokenInDecimals: USDT_DECIMALS,
    tokenOutDecimals: USD_DECIMALS,
    precisionDecimals: PRECISION_DECIMALS_DEPOSIT_DEX,
  }),
  ORDER_LEVERAGE: 100n,
  USDT_DEPOSIT_AMOUNT: 100n * USDT_DECIMALS,
};
