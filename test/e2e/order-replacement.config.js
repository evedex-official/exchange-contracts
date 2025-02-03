'use strict';

const { parsePrice } = require('../helpers/utils');
const {
  BTC_DECIMALS,
  USDT_DECIMALS,
  PRECISION_DECIMALS_EVEDEX,
  USD_DECIMALS,
  PRECISION_DECIMALS_DEPOSIT_DEX,
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
  USDT_DEPOSIT_AMOUNT: 100_000n * USDT_DECIMALS,
  ORDER_LEVERAGE: 100n,
  ORDER_AMOUNT: 10n,
  NEW_ORDER_AMOUNT: 5n,
};
