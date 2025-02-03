'use strict';

const { upgrades } = require('hardhat');
const { prepare } = require('./adl.fixture');
const {
  USDT_DECIMALS,
  BTC_DECIMALS,
  USDT_COLLATERAL_INDEX,
  BUY_SIDE,
  SELL_SIDE,
  PRECISION_DECIMALS_EVEDEX,
  USD_DECIMALS,
  PRECISION_DECIMALS_DEPOSIT_DEX,
} = require('./helpers/constants');
const { parsePrice, getFullPricesBtcUsdt } = require('./helpers/utils');
const { expect } = require('chai');

describe('adl tests', () => {
  before(upgrades.silenceWarnings);

  const config = {
    suit: 'adl tests',
    USDT_DEPOSIT_AMOUNT: 100n * USDT_DECIMALS, // collateral
    BTC_PRICE_USERS_TRADE: parsePrice(100_000, {
      precisionDecimals: PRECISION_DECIMALS_EVEDEX,
    }), // price of the order
    BTC_PRICE_LIQUIDATOR_TRADE: parsePrice(100_000, {
      precisionDecimals: PRECISION_DECIMALS_EVEDEX,
    }),
    USDT_PRICE_COLLATERAL: parsePrice(1.0, {
      tokenInDecimals: USDT_DECIMALS,
      tokenOutDecimals: USD_DECIMALS,
      precisionDecimals: PRECISION_DECIMALS_DEPOSIT_DEX,
    }),
    BTC_PRICE_COLLATERAL: parsePrice(100_000, {
      tokenInDecimals: BTC_DECIMALS,
      tokenOutDecimals: USD_DECIMALS,
      precisionDecimals: PRECISION_DECIMALS_DEPOSIT_DEX,
    }),
    ORDER_LEVERAGE: 1n,
    USER_ORDER_SIZE_PERCENT: 80n, // user's order size in percents of the margin level at stop-out boundary
    LIQUIDATOR_ORDER_SIZE_PERCENT: 10n, // liquidator's initial position size in percents of the margin level at stop-out boundary
    LIQUIDATOR_ORDER_SIDE: BUY_SIDE,
  };

  it('should not liquidate with valid margin', async () => {
    const { orders, eveDex, usdtToken, btcToken, matcher } = await prepare(config);
    const fullPrices = getFullPricesBtcUsdt(
      config.BTC_PRICE_USERS_TRADE,
      config.BTC_PRICE_COLLATERAL,
      config.USDT_PRICE_COLLATERAL,
      btcToken.address,
      usdtToken.address,
    );
    const historyTimestamp = Math.trunc(Date.now() / 1000);
    const liquidationOrder = {
      accountToLiquidate: orders.longOrderExt.order.senderAddress,
      liquidator: orders.liquidatorOrderExt.order.senderAddress,
      index: orders.longOrderExt.order.instrumentIndex,
      amount: orders.longOrderExt.order.amount,
      prices: fullPrices.instrumentPrices,
      collateralIndexLiquidator: USDT_COLLATERAL_INDEX,
      collateralIndexToLiquidate: USDT_COLLATERAL_INDEX,
      leverageLiquidator: config.ORDER_LEVERAGE,
      leverageToLiquidate: config.ORDER_LEVERAGE,
    };
    try {
      await eveDex.write.adlLiquidation([liquidationOrder, fullPrices, historyTimestamp, 0n], {
        account: matcher.account.address,
      });
      expect.fail('Expected SufficientMargin() revert, but transaction succeeded.');
    } catch (error) {
      expect(error.details).to.include('SufficientMargin()');
    }
  });

  it('should liquidate short position', async () => {
    const { eveDex, usdtToken, btcToken, matcher, depositDex, orders } = await prepare(config);
    const delta = (config.BTC_PRICE_USERS_TRADE * (101n - config.USER_ORDER_SIZE_PERCENT)) / 100n;
    const boundaryPrice = config.BTC_PRICE_USERS_TRADE + delta;
    const collateralPriceDelta = (config.BTC_PRICE_COLLATERAL * (101n - config.USER_ORDER_SIZE_PERCENT)) / 100n;
    const boundaryCollateralPrice = config.BTC_PRICE_COLLATERAL + collateralPriceDelta;

    const userCollateralBalanceBefore = await depositDex.read.getBalance([
      orders.shortOrderExt.order.senderAddress,
      usdtToken.address,
    ]);
    const userPosBefore = await eveDex.read.getActiveInstrumentsPositions([orders.shortOrderExt.order.senderAddress]);
    const liquidatorCollateralBalanceBefore = await depositDex.read.getBalance([
      orders.liquidatorOrderExt.order.senderAddress,
      usdtToken.address,
    ]);
    const liquidatorPosBefore = await eveDex.read.getActiveInstrumentsPositions([
      orders.liquidatorOrderExt.order.senderAddress,
    ]);
    const fullPrices = getFullPricesBtcUsdt(
      boundaryPrice,
      boundaryCollateralPrice,
      config.USDT_PRICE_COLLATERAL,
      btcToken.address,
      usdtToken.address,
    );
    const historyTimestamp = Math.trunc(Date.now() / 1000);
    const liquidationOrder = {
      accountToLiquidate: orders.shortOrderExt.order.senderAddress,
      liquidator: orders.liquidatorOrderExt.order.senderAddress,
      index: orders.shortOrderExt.order.instrumentIndex,
      amount: -orders.shortOrderExt.order.amount,
      prices: fullPrices.instrumentPrices,
      collateralIndexLiquidator: USDT_COLLATERAL_INDEX,
      collateralIndexToLiquidate: USDT_COLLATERAL_INDEX,
      leverageLiquidator: config.ORDER_LEVERAGE,
      leverageToLiquidate: config.ORDER_LEVERAGE,
    };
    await eveDex.write.adlLiquidation([liquidationOrder, fullPrices, historyTimestamp, 0n], {
      account: matcher.account.address,
    });

    const userCollateralBalanceAfter = await depositDex.read.getBalance([
      orders.shortOrderExt.order.senderAddress,
      usdtToken.address,
    ]);
    const userPosAfter = await eveDex.read.getActiveInstrumentsPositions([orders.shortOrderExt.order.senderAddress]);
    const liquidatorCollateralBalanceAfter = await depositDex.read.getBalance([
      orders.liquidatorOrderExt.order.senderAddress,
      usdtToken.address,
    ]);
    const liquidatorPosAfter = await eveDex.read.getActiveInstrumentsPositions([
      orders.liquidatorOrderExt.order.senderAddress,
    ]);

    const userCollateralBalanceDiff = userCollateralBalanceAfter - userCollateralBalanceBefore;
    const liquidatorBalanceDiff = liquidatorCollateralBalanceAfter - liquidatorCollateralBalanceBefore;
    const liquidatorPosDiff = liquidatorPosAfter[1][0].position - liquidatorPosBefore[1][0].position;

    expect(userCollateralBalanceDiff < 0n).true;
    expect(liquidatorBalanceDiff > 0n).true;
    expect(userPosAfter[0].length).to.equal(0n);
    expect(liquidatorPosDiff).to.equal(userPosBefore[1][0].position);
    expect(liquidatorBalanceDiff).to.equal(userCollateralBalanceDiff * -1n);
  });

  it('should liquidate long position', async () => {
    config.LIQUIDATOR_ORDER_SIDE = SELL_SIDE;

    const { eveDex, usdtToken, btcToken, matcher, depositDex, orders } = await prepare(config);
    const delta = (config.BTC_PRICE_USERS_TRADE * (101n - config.USER_ORDER_SIZE_PERCENT)) / 100n;
    const boundaryPrice = config.BTC_PRICE_USERS_TRADE - delta;
    const collateralPriceDelta = (config.BTC_PRICE_COLLATERAL * (101n - config.USER_ORDER_SIZE_PERCENT)) / 100n;
    const boundaryCollateralPrice = config.BTC_PRICE_COLLATERAL - collateralPriceDelta;

    const userCollateralBalanceBefore = await depositDex.read.getBalance([
      orders.longOrderExt.order.senderAddress,
      usdtToken.address,
    ]);
    const userPosBefore = await eveDex.read.getActiveInstrumentsPositions([orders.longOrderExt.order.senderAddress]);
    const liquidatorCollateralBalanceBefore = await depositDex.read.getBalance([
      orders.liquidatorOrderExt.order.senderAddress,
      usdtToken.address,
    ]);
    const liquidatorPosBefore = await eveDex.read.getActiveInstrumentsPositions([
      orders.liquidatorOrderExt.order.senderAddress,
    ]);

    const fullPrices = getFullPricesBtcUsdt(
      boundaryPrice,
      boundaryCollateralPrice,
      config.USDT_PRICE_COLLATERAL,
      btcToken.address,
      usdtToken.address,
    );
    const historyTimestamp = Math.trunc(Date.now() / 1000);
    const liquidationOrder = {
      accountToLiquidate: orders.longOrderExt.order.senderAddress,
      liquidator: orders.liquidatorOrderExt.order.senderAddress,
      index: orders.longOrderExt.order.instrumentIndex,
      amount: orders.longOrderExt.order.amount,
      prices: fullPrices.instrumentPrices,
      collateralIndexLiquidator: USDT_COLLATERAL_INDEX,
      collateralIndexToLiquidate: USDT_COLLATERAL_INDEX,
      leverageLiquidator: config.ORDER_LEVERAGE,
      leverageToLiquidate: config.ORDER_LEVERAGE,
    };
    await eveDex.write.adlLiquidation([liquidationOrder, fullPrices, historyTimestamp, 0n], {
      account: matcher.account.address,
    });

    const userCollateralBalanceAfter = await depositDex.read.getBalance([
      orders.longOrderExt.order.senderAddress,
      usdtToken.address,
    ]);
    const userPosAfter = await eveDex.read.getActiveInstrumentsPositions([orders.longOrderExt.order.senderAddress]);
    const liquidatorCollateralBalanceAfter = await depositDex.read.getBalance([
      orders.liquidatorOrderExt.order.senderAddress,
      usdtToken.address,
    ]);
    const liquidatorPosAfter = await eveDex.read.getActiveInstrumentsPositions([
      orders.liquidatorOrderExt.order.senderAddress,
    ]);

    const userCollateralBalanceDiff = userCollateralBalanceAfter - userCollateralBalanceBefore;
    const liquidatorBalanceDiff = liquidatorCollateralBalanceAfter - liquidatorCollateralBalanceBefore;
    const liquidatorPosDiff = liquidatorPosAfter[1][0].position - liquidatorPosBefore[1][0].position;

    expect(userCollateralBalanceDiff < 0n).true;
    expect(liquidatorBalanceDiff > 0n).true;
    expect(userPosAfter[0].length).to.equal(0n);
    expect(liquidatorPosDiff).to.equal(userPosBefore[1][0].position);
    expect(liquidatorBalanceDiff).to.equal(userCollateralBalanceDiff * -1n);

    config.LIQUIDATOR_ORDER_SIDE = BUY_SIDE;
  });

  // unprofitable if liquidator order is long and we liquidating long position
  it('should not liquidate if trade is unprofitable for liquidator (long)', async () => {
    const { eveDex, usdtToken, btcToken, matcher, orders } = await prepare(config);
    const delta = (config.BTC_PRICE_USERS_TRADE * (101n - config.USER_ORDER_SIZE_PERCENT)) / 100n;
    const boundaryPrice = config.BTC_PRICE_USERS_TRADE - delta;
    const collateralPriceDelta = (config.BTC_PRICE_COLLATERAL * (101n - config.USER_ORDER_SIZE_PERCENT)) / 100n;
    const boundaryCollateralPrice = config.BTC_PRICE_COLLATERAL - collateralPriceDelta;

    const fullPrices = getFullPricesBtcUsdt(
      boundaryPrice,
      boundaryCollateralPrice,
      config.USDT_PRICE_COLLATERAL,
      btcToken.address,
      usdtToken.address,
    );
    const historyTimestamp = Math.trunc(Date.now() / 1000);
    const liquidationOrder = {
      accountToLiquidate: orders.longOrderExt.order.senderAddress,
      liquidator: orders.liquidatorOrderExt.order.senderAddress,
      index: orders.longOrderExt.order.instrumentIndex,
      amount: orders.longOrderExt.order.amount,
      prices: fullPrices.instrumentPrices,
      collateralIndexLiquidator: USDT_COLLATERAL_INDEX,
      collateralIndexToLiquidate: USDT_COLLATERAL_INDEX,
      leverageLiquidator: config.ORDER_LEVERAGE,
      leverageToLiquidate: config.ORDER_LEVERAGE,
    };
    try {
      await eveDex.write.adlLiquidation([liquidationOrder, fullPrices, historyTimestamp, 0n], {
        account: matcher.account.address,
      });
      expect.fail('Expected UnprofitableTrade() revert, but transaction succeeded.');
    } catch (e) {
      expect(e.details).to.include('UnprofitableTrade()');
    }
  });

  // unprofitable if liquidator order is short and we liquidating short position
  it('should not liquidate if trade is unprofitable for liquidator (short)', async () => {
    config.LIQUIDATOR_ORDER_SIDE = SELL_SIDE;

    const { eveDex, usdtToken, btcToken, matcher, orders } = await prepare(config);
    const delta = (config.BTC_PRICE_USERS_TRADE * (101n - config.USER_ORDER_SIZE_PERCENT)) / 100n;
    const boundaryPrice = config.BTC_PRICE_USERS_TRADE + delta;
    const collateralPriceDelta = (config.BTC_PRICE_COLLATERAL * (101n - config.USER_ORDER_SIZE_PERCENT)) / 100n;
    const boundaryCollateralPrice = config.BTC_PRICE_COLLATERAL + collateralPriceDelta;

    const fullPrices = getFullPricesBtcUsdt(
      boundaryPrice,
      boundaryCollateralPrice,
      config.USDT_PRICE_COLLATERAL,
      btcToken.address,
      usdtToken.address,
    );
    const historyTimestamp = Math.trunc(Date.now() / 1000);
    const liquidationOrder = {
      accountToLiquidate: orders.shortOrderExt.order.senderAddress,
      liquidator: orders.liquidatorOrderExt.order.senderAddress,
      index: orders.shortOrderExt.order.instrumentIndex,
      amount: -orders.shortOrderExt.order.amount,
      prices: fullPrices.instrumentPrices,
      collateralIndexLiquidator: USDT_COLLATERAL_INDEX,
      collateralIndexToLiquidate: USDT_COLLATERAL_INDEX,
      leverageLiquidator: config.ORDER_LEVERAGE,
      leverageToLiquidate: config.ORDER_LEVERAGE,
    };
    try {
      await eveDex.write.adlLiquidation([liquidationOrder, fullPrices, historyTimestamp, 0n], {
        account: matcher.account.address,
      });
      expect.fail('Expected UnprofitableTrade() revert, but transaction succeeded.');
    } catch (e) {
      expect(e.details).to.include('UnprofitableTrade()');
    }

    config.LIQUIDATOR_ORDER_SIDE = BUY_SIDE;
  });

  it('partial liquidation (long)', async () => {});
  it('partial liquidation (short)', async () => {});
});
