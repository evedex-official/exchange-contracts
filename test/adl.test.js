'use strict';

const { upgrades } = require('hardhat');
const { prepare } = require('./adl.fixture');
const {
  USDT_DECIMALS,
  BTC_DECIMALS,
  BTC_USD_INDEX,
  USDT_COLLATERAL_INDEX,
  BUY_SIDE,
  SELL_SIDE,
} = require('./helpers/constants');
const { parsePrice } = require('./helpers/utils');
const { BTC_INITIAL_PRICE, USDT_INITIAL_PRICE } = require('./e2e/liquidation.config');
const { expect } = require('chai');

describe('adl tests', () => {
  before(upgrades.silenceWarnings);

  const config = {
    suit: 'adl tests',
    USDT_DEPOSIT_AMOUNT: 100n * 10n ** USDT_DECIMALS, // collateral
    BTC_PRICE_USERS_TRADE: parsePrice(100_000, {
      tokenDecimals: BTC_DECIMALS,
    }), // price of the order
    BTC_PRICE_LIQUIDATOR_TRADE: parsePrice(100_000, {
      tokenDecimals: BTC_DECIMALS,
    }),
    USDT_PRICE: parsePrice(1.0, {
      tokenDecimals: USDT_DECIMALS,
    }), // initial price of the usdt (used as a collateral)
    ORDER_LEVERAGE: 1n,
    INITIAL_ORDER_SIZE_PERCENT: 80n, // order size in percents of the margin level at stop-out boundary,
    LIQUIDATOR_ORDER_SIDE: BUY_SIDE,
  };

  it('should not liquidate with valid margin', async () => {
    const { orders, eveDex, usdtToken, btcToken, matcher } = await prepare(config);
    const fullPrices = {
      instrumentPrices: [
        {
          index: BTC_USD_INDEX,
          price: BTC_INITIAL_PRICE,
        },
      ],
      collateralPrices: [
        {
          collateral: usdtToken.address,
          price: USDT_INITIAL_PRICE,
        },
        {
          collateral: btcToken.address,
          price: BTC_INITIAL_PRICE,
        },
      ],
    };
    const historyTimestamp = Math.trunc(Date.now() / 1000);
    const liquidationOrder = {
      accountToLiquidate: orders.longOrderExt.order.senderAddress,
      liquidator: orders.liquidatorOrderExt.order.senderAddress,
      index: orders.longOrderExt.order.instrumentIndex,
      prices: fullPrices.instrumentPrices,
      leverage: config.ORDER_LEVERAGE,
      liquidationTimestamp: historyTimestamp,
      expiration: historyTimestamp + 60,
    };
    const collateralIndices = {
      liquidatorIndex: USDT_COLLATERAL_INDEX, // index of collateral that was used in extended order
      indicesToLiquidate: [USDT_COLLATERAL_INDEX], // indices of user's collaterals that will be used for liquidation
    };
    try {
      await eveDex.write.adlLiquidation([liquidationOrder, fullPrices, collateralIndices, historyTimestamp, 0n], {
        account: matcher.account.address,
      });
      expect.fail('Expected SufficientMargin() revert, but transaction succeeded.');
    } catch (error) {
      expect(error.details).to.include('SufficientMargin()');
    }
  });

  it('should liquidate short position', async () => {
    const { eveDex, usdtToken, btcToken, matcher, depositDex, orders } = await prepare(config);
    const delta = (config.BTC_PRICE_USERS_TRADE * (101n - config.INITIAL_ORDER_SIZE_PERCENT)) / 100n;
    const boundaryPrice = config.BTC_PRICE_USERS_TRADE + delta;

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

    const fullPrices = {
      instrumentPrices: [
        {
          index: BTC_USD_INDEX,
          price: boundaryPrice,
        },
      ],
      collateralPrices: [
        {
          collateral: usdtToken.address,
          price: USDT_INITIAL_PRICE,
        },
        {
          collateral: btcToken.address,
          price: boundaryPrice,
        },
      ],
    };
    const historyTimestamp = Math.trunc(Date.now() / 1000);
    const liquidationOrder = {
      accountToLiquidate: orders.shortOrderExt.order.senderAddress,
      liquidator: orders.liquidatorOrderExt.order.senderAddress,
      index: orders.shortOrderExt.order.instrumentIndex,
      prices: fullPrices.instrumentPrices,
      leverage: config.ORDER_LEVERAGE,
      liquidationTimestamp: historyTimestamp,
      expiration: historyTimestamp + 60,
    };
    const collateralIndices = {
      liquidatorIndex: USDT_COLLATERAL_INDEX, // index of collateral that was used in extended order
      indicesToLiquidate: [USDT_COLLATERAL_INDEX], // indices of user's collaterals that will be used for liquidation
    };
    await eveDex.write.adlLiquidation([liquidationOrder, fullPrices, collateralIndices, historyTimestamp, 0n], {
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
    const delta = (config.BTC_PRICE_USERS_TRADE * (101n - config.INITIAL_ORDER_SIZE_PERCENT)) / 100n;
    const boundaryPrice = config.BTC_PRICE_USERS_TRADE - delta;

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

    const fullPrices = {
      instrumentPrices: [
        {
          index: BTC_USD_INDEX,
          price: boundaryPrice,
        },
      ],
      collateralPrices: [
        {
          collateral: usdtToken.address,
          price: USDT_INITIAL_PRICE,
        },
        {
          collateral: btcToken.address,
          price: boundaryPrice,
        },
      ],
    };
    const historyTimestamp = Math.trunc(Date.now() / 1000);
    const liquidationOrder = {
      accountToLiquidate: orders.longOrderExt.order.senderAddress,
      liquidator: orders.liquidatorOrderExt.order.senderAddress,
      index: orders.longOrderExt.order.instrumentIndex,
      prices: fullPrices.instrumentPrices,
      leverage: config.ORDER_LEVERAGE,
      liquidationTimestamp: historyTimestamp,
      expiration: historyTimestamp + 60,
    };
    const collateralIndices = {
      liquidatorIndex: USDT_COLLATERAL_INDEX, // index of collateral that was used in extended order
      indicesToLiquidate: [USDT_COLLATERAL_INDEX], // indices of user's collaterals that will be used for liquidation
    };
    await eveDex.write.adlLiquidation([liquidationOrder, fullPrices, collateralIndices, historyTimestamp, 0n], {
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
  });

  it('historical liquidation');

  it('test function check');

  it('should not liquidate if trade is unprofitable for liquidator');

  // // what if short side?
  // it('liquidation price must be more than liquidator position avg price (liquidator long case)', async () => {
  //   //liquidator: long side
  //   //account to liquidate: short side
  //   const { eveDex, usdtToken, btcToken, matcher, alice, bob } = await restoreSuit(config.suit);
  //   const [,[position]] = await eveDex.read.getActiveInstrumentsPositions([orders.longOrderExt.order.senderAddress]);
  //   const positionAvgPrice = position.positionAvgPrice;
  //   const liquidationPrice = positionAvgPrice;
  //
  //   const fullPrices = {
  //     instrumentPrices: [
  //       {
  //         index: BTC_USD_INDEX,
  //         price: liquidationPrice,
  //       },
  //     ],
  //     collateralPrices: [
  //       {
  //         collateral: usdtToken.address,
  //         price: USDT_INITIAL_PRICE,
  //       },
  //       {
  //         collateral: btcToken.address,
  //         price: liquidationPrice,
  //       },
  //     ],
  //   };
  //   const historyTimestamp = Math.trunc(Date.now() / 1000);
  //   const liquidationOrder = {
  //     accountToLiquidate: orders.shortOrderExt.order.senderAddress,
  //     liquidator: orders.longOrderExt.order.senderAddress,
  //     index: orders.longOrderExt.order.instrumentIndex,
  //     prices: fullPrices.instrumentPrices,
  //     leverage: config.ORDER_LEVERAGE,
  //     liquidationTimestamp: historyTimestamp,
  //     expiration: historyTimestamp + 60,
  //   };
  //   const collateralIndices = {
  //     liquidatorIndex: USDT_COLLATERAL_INDEX, // index of collateral that was used in extended order
  //     indicesToLiquidate: [USDT_COLLATERAL_INDEX], // indices of user's collaterals that will be used for liquidation
  //   };
  //   await eveDex.write.adlLiquidation([liquidationOrder, fullPrices, collateralIndices, historyTimestamp, 0n], {
  //     account: matcher.account.address,
  //   });
  // });
  //
  //
  // it('liquidation price must be more than liquidator position avg price (liquidator short case)', async () => {
  //   //liquidator: short side
  //   //account to liquidate: long side
  //
  // });
});
