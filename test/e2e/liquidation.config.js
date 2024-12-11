'use strict';

const { parsePrice } = require('../helpers/utils');

module.exports = {
  USDT_DEPOSIT_AMOUNT: 100n * 10n ** 6n, // collateral
  BTC_INITIAL_PRICE: parsePrice(100_000), // price of the order
  USDT_INITIAL_PRICE: parsePrice(1.0), // initial price of the usdt (used as a collateral)
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
  BTC_CURRENT_PRICE: parsePrice(121_000), // current price. liquidation will happen if marginLevel <= soLevel
  USDT_CURRENT_PRICE: parsePrice(1.0), // current price. liquidation will happen if marginLevel <= soLevel
};
