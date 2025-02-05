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
  USDT_DEPOSIT_AMOUNT: 100n * USDT_DECIMALS, // collateral
  BTC_INSTRUMENT_INITIAL_PRICE: parsePrice(100_000, {
    precisionDecimals: PRECISION_DECIMALS_EVEDEX,
  }), // price of the order
  USDT_INSTRUMENT_INITIAL_PRICE: parsePrice(1.0, {
    precisionDecimals: USDT_DECIMALS,
  }), // initial price of the usdt (used as a collateral)
  BTC_COLLATERAL_INITIAL_PRICE: parsePrice(100_000, {
    tokenInDecimals: BTC_DECIMALS,
    tokenOutDecimals: USD_DECIMALS,
    precisionDecimals: PRECISION_DECIMALS_DEPOSIT_DEX,
  }),
  USDT_COLLATERAL_INITIAL_PRICE: parsePrice(1.0, {
    tokenInDecimals: USDT_DECIMALS,
    tokenOutDecimals: USD_DECIMALS,
    precisionDecimals: PRECISION_DECIMALS_DEPOSIT_DEX,
  }),
  ORDER_LEVERAGE: 1n,
  INITIAL_ORDER_SIZE_PERCENT: 80n, // order size in percents of the margin level at stop-out boundary

  /**
   * tweak following parameters to test different liquidation scenarios
   *
   * Case 1
   * if ORDER_LEVERAGE is 1n, and INITIAL_ORDER_SIZE_PERCENT is 80n, then LONG position should be
   * liquidated after the price drops below 80_000 (-20 %)
   *
   * Case 2
   * if ORDER_LEVERAGE is 10n, and INITIAL_ORDER_SIZE_PERCENT is 80n, then LONG position should be
   * liquidated after the price drops below 98_000 (-2 %)
   *
   * Case 3
   * if ORDER_LEVERAGE is 1n, and INITIAL_ORDER_SIZE_PERCENT is 50n, then LONG position should be
   * liquidated after the price drops below 20_000 (-80 %)
   *
   * Case 4
   * if ORDER_LEVERAGE is 1n, and INITIAL_ORDER_SIZE_PERCENT is 80n, then SHORT position should be
   * liquidated after the price raises above 120_000 (+20 %)
   *
   * Case 5
   * if ORDER_LEVERAGE is 10n, and INITIAL_ORDER_SIZE_PERCENT is 80n, then SHORT position should be
   * liquidated after the price raises above 102_000 (+2 %)
   *
   * Case 6
   * if ORDER_LEVERAGE is 1n, and INITIAL_ORDER_SIZE_PERCENT is 50n, then SHORT position should be
   * liquidated after the price raises above 180_000 (+80 %)
   */
  BTC_INSTRUMENT_CURRENT_PRICE: parsePrice(121_000, {
    precisionDecimals: PRECISION_DECIMALS_EVEDEX,
  }), // current price. liquidation will happen if marginLevel <= soLevel
  USDT_INSTRUMENT_CURRENT_PRICE: parsePrice(1.0, {
    precisionDecimals: PRECISION_DECIMALS_EVEDEX,
  }), // current price. liquidation will happen if marginLevel <= soLevel
  BTC_COLLATERAL_CURRENT_PRICE: parsePrice(121_000, {
    tokenInDecimals: BTC_DECIMALS,
    tokenOutDecimals: USD_DECIMALS,
    precisionDecimals: PRECISION_DECIMALS_DEPOSIT_DEX,
  }),
  USDT_COLLATERAL_CURRENT_PRICE: parsePrice(1.0, {
    tokenInDecimals: USDT_DECIMALS,
    tokenOutDecimals: USD_DECIMALS,
    precisionDecimals: PRECISION_DECIMALS_DEPOSIT_DEX,
  }),
};
