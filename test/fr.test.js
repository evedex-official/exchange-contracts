'use strict';

const { upgrades } = require('hardhat');
const {
  USDT_DECIMALS,
  BTC_DECIMALS,
  FR_PRECISION,
  BTC_USD_INDEX,
  USDT_COLLATERAL_INDEX,
  PRECISION_DECIMALS_DEPOSIT_DEX,
  USD_DECIMALS,
  PRECISION_DECIMALS_EVEDEX,
  SELL_SIDE,
  BUY_SIDE,
} = require('./helpers/constants');
const {
  parsePrice,
  getFullPricesBtcUsdt,
  pipe,
  positionToUsd,
  usdToCollateral,
  createMultiLiquidationOrder,
  signMultiLiquidationOrder,
  signOrder,
} = require('./helpers/utils');
const { prepare } = require('./fr.fixture');
const { maxUint256 } = require('viem');
const { expect } = require('chai');
const { writeContract } = require('viem/actions');

describe('fr tests', async () => {
  before(upgrades.silenceWarnings);

  const config = {
    suit: 'fr tests',
    USDT_DEPOSIT_AMOUNT: 100n * 10n ** USDT_DECIMALS, // collateral
    BTC_PRICE_INSTRUMENT_USERS_TRADE: parsePrice(100_000, {
      precisionDecimals: PRECISION_DECIMALS_EVEDEX,
    }), // price of the order
    USDT_PRICE_COLLATERAL: parsePrice(1.0, {
      tokenInDecimals: USDT_DECIMALS,
      tokenOutDecimals: USD_DECIMALS,
      precisionDecimals: PRECISION_DECIMALS_DEPOSIT_DEX,
    }), // initial price of the usdt (used as a collateral)
    BTC_PRICE_COLLATERAL: parsePrice(100_000, {
      tokenInDecimals: BTC_DECIMALS,
      tokenOutDecimals: USD_DECIMALS,
      precisionDecimals: PRECISION_DECIMALS_DEPOSIT_DEX,
    }), // initial price of the btc (used as a collateral)
    ORDER_LEVERAGE: 1n,
    USER_ORDER_SIZE_PERCENT: 80n, // user's order size in percents of the margin level at stop-out boundary
  };

  it('should update fr', async () => {
    const { eveDex, matcher } = await prepare(config);
    // 3%
    const newFr = 3n * FR_PRECISION;
    // long pay to short
    const shortFr = newFr;
    const longFr = -newFr;
    const staticFr = (30n * FR_PRECISION) / 100n; // 30% from newFr
    const timestamp = Math.trunc(Date.now() / 1000);
    await eveDex.write.setFR([BTC_USD_INDEX, longFr, shortFr, staticFr, timestamp], {
      account: matcher.account.address,
    });
    const frData = await eveDex.read.getFundingRateData([BTC_USD_INDEX, 0, maxUint256]);
    expect(frData.at(-1).longFRStored).to.equal(longFr);
    expect(frData.at(-1).shortFRStored).to.equal(shortFr);
    expect(frData.at(-1).staticFr).to.equal(staticFr);
  });

  it('should collect fr', async () => {
    const { eveDex, matcher, orders, btcToken, usdtToken, depositDex, fundingRateAccount } = await prepare(config);
    // 3%
    const newFr = (3n * FR_PRECISION) / 100n;
    // long pay to short
    const shortFr = newFr;
    const longFr = -newFr;
    const staticFr = 0n;
    const timestamp = Math.trunc(Date.now() / 1000);
    await eveDex.write.setFR([BTC_USD_INDEX, longFr, shortFr, staticFr, timestamp], {
      account: matcher.account.address,
    });

    const frAccountBalanceBefore = await depositDex.read.getBalance([
      fundingRateAccount.account.address,
      usdtToken.address,
    ]);
    const fullPrices = getFullPricesBtcUsdt(
      config.BTC_PRICE_INSTRUMENT_USERS_TRADE,
      config.BTC_PRICE_COLLATERAL,
      config.USDT_PRICE_COLLATERAL,
      btcToken.address,
      usdtToken.address,
    );
    await eveDex.write.collectFr(
      [orders.longOrderExt.order.senderAddress, fullPrices, USDT_COLLATERAL_INDEX, timestamp, 0n],
      {
        account: matcher.account.address,
      },
    );
    const frAccountBalanceAfter = await depositDex.read.getBalance([
      fundingRateAccount.account.address,
      usdtToken.address,
    ]);
    const usdtDiff = frAccountBalanceAfter - frAccountBalanceBefore;

    const frAmount = (orders.longOrderExt.order.amount * newFr) / FR_PRECISION;
    const usdtExpectedDiff = pipe(
      (frAmount) => positionToUsd(frAmount, config.BTC_PRICE_INSTRUMENT_USERS_TRADE),
      (usdAmount) => usdToCollateral(usdAmount, config.USDT_PRICE_COLLATERAL, USDT_DECIMALS),
    )(frAmount);

    expect(usdtDiff).to.equal(usdtExpectedDiff);
  });

  it('should distribute fr', async () => {
    const { eveDex, matcher, orders, btcToken, usdtToken, depositDex, fundingRateAccount } = await prepare(config);
    // 3%
    const newFr = (3n * FR_PRECISION) / 100n;
    // long pay to short
    const shortFr = newFr;
    const longFr = -newFr;
    const staticFr = (30n * FR_PRECISION) / 100n; // 30% from newFr
    const timestamp = Math.trunc(Date.now() / 1000);
    await eveDex.write.setFR([BTC_USD_INDEX, longFr, shortFr, staticFr, timestamp], {
      account: matcher.account.address,
    });

    const accountFRLong = await eveDex.read.getAccountFR([
      orders.longOrderExt.order.senderAddress,
      BTC_USD_INDEX,
      timestamp,
      0,
    ]);
    const accountFRShort = await eveDex.read.getAccountFR([
      orders.shortOrderExt.order.senderAddress,
      BTC_USD_INDEX,
      timestamp,
      0,
    ]);
    const frAccountBalanceBefore = await depositDex.read.getBalance([
      fundingRateAccount.account.address,
      usdtToken.address,
    ]);
    const fullPrices = getFullPricesBtcUsdt(
      config.BTC_PRICE_INSTRUMENT_USERS_TRADE,
      config.BTC_PRICE_COLLATERAL,
      config.USDT_PRICE_COLLATERAL,
      btcToken.address,
      usdtToken.address,
    );

    await eveDex.write.collectFr(
      [orders.longOrderExt.order.senderAddress, fullPrices, USDT_COLLATERAL_INDEX, timestamp, 0n],
      {
        account: matcher.account.address,
      },
    );
    await eveDex.write.collectFr(
      [orders.shortOrderExt.order.senderAddress, fullPrices, USDT_COLLATERAL_INDEX, timestamp, 0n],
      {
        account: matcher.account.address,
      },
    );
    const frAccountBalanceAfter = await depositDex.read.getBalance([
      fundingRateAccount.account.address,
      usdtToken.address,
    ]);
    const usdtDiff = frAccountBalanceAfter - frAccountBalanceBefore;

    const [, [{ positionAvgPrice: longAvgPrice }]] = await eveDex.read.getActiveInstrumentsPositions([
      orders.longOrderExt.order.senderAddress,
    ]);
    const longPositionFr = (longAvgPrice * accountFRLong) / 10n ** PRECISION_DECIMALS_EVEDEX;
    const longCollateralFee = (longPositionFr * 10n ** PRECISION_DECIMALS_DEPOSIT_DEX) / config.USDT_PRICE_COLLATERAL;
    const [, [{ positionAvgPrice: shortAvgPrice }]] = await eveDex.read.getActiveInstrumentsPositions([
      orders.shortOrderExt.order.senderAddress,
    ]);
    const shortPositionFr = (shortAvgPrice * accountFRShort) / 10n ** PRECISION_DECIMALS_EVEDEX;
    const shortCollateralFee = (shortPositionFr * 10n ** PRECISION_DECIMALS_DEPOSIT_DEX) / config.USDT_PRICE_COLLATERAL;

    expect(-usdtDiff).to.equal(longCollateralFee + shortCollateralFee); // todo: problems with rounding in fair count through the fr formula
  });

  it('should collect fr according to timestamp', async () => {
    const { eveDex, matcher, orders, btcToken, usdtToken, depositDex, fundingRateAccount } = await prepare(config);
    // 3%
    const newFr = (3n * FR_PRECISION) / 100n;
    // long pay to short
    const shortFr = newFr;
    const longFr = -newFr;
    const staticFr = (30n * FR_PRECISION) / 100n; // 30% from newFr
    const oldTimestamp = Math.trunc(Date.now() / 1000);
    const updatedTimestamp = oldTimestamp + 1;

    // initial fr
    await eveDex.write.setFR([BTC_USD_INDEX, longFr, shortFr, staticFr, oldTimestamp], {
      account: matcher.account.address,
    });
    // updating fr to zero
    await eveDex.write.setFR([BTC_USD_INDEX, 0n, 0n, 0n, updatedTimestamp], {
      account: matcher.account.address,
    });
    const fullPrices = getFullPricesBtcUsdt(
      config.BTC_PRICE_INSTRUMENT_USERS_TRADE,
      config.BTC_PRICE_COLLATERAL,
      config.USDT_PRICE_COLLATERAL,
      btcToken.address,
      usdtToken.address,
    );

    // block after updatedTimestamp
    {
      await eveDex.write.collectFr(
        [orders.longOrderExt.order.senderAddress, fullPrices, USDT_COLLATERAL_INDEX, updatedTimestamp, 0n],
        {
          account: matcher.account.address,
        },
      );
      await eveDex.write.collectFr(
        [orders.shortOrderExt.order.senderAddress, fullPrices, USDT_COLLATERAL_INDEX, updatedTimestamp, 0n],
        {
          account: matcher.account.address,
        },
      );
      const frAccountBalanceAfter = await depositDex.read.getBalance([
        fundingRateAccount.account.address,
        usdtToken.address,
      ]);
      expect(frAccountBalanceAfter).to.equal(0n);
    }
    // block before updatedTimestamp
    {
      const accountFRLong = await eveDex.read.getAccountFR([
        orders.longOrderExt.order.senderAddress,
        BTC_USD_INDEX,
        oldTimestamp,
        0,
      ]);
      const accountFRShort = await eveDex.read.getAccountFR([
        orders.shortOrderExt.order.senderAddress,
        BTC_USD_INDEX,
        oldTimestamp,
        0,
      ]);
      const frAccountBalanceBefore = await depositDex.read.getBalance([
        fundingRateAccount.account.address,
        usdtToken.address,
      ]);
      await eveDex.write.collectFr(
        [orders.longOrderExt.order.senderAddress, fullPrices, USDT_COLLATERAL_INDEX, oldTimestamp, 0n],
        {
          account: matcher.account.address,
        },
      );
      await eveDex.write.collectFr(
        [orders.shortOrderExt.order.senderAddress, fullPrices, USDT_COLLATERAL_INDEX, oldTimestamp, 0n],
        {
          account: matcher.account.address,
        },
      );
      const frAccountBalanceAfter = await depositDex.read.getBalance([
        fundingRateAccount.account.address,
        usdtToken.address,
      ]);
      const usdtDiff = frAccountBalanceAfter - frAccountBalanceBefore;

      const [, [{ positionAvgPrice: longAvgPrice }]] = await eveDex.read.getActiveInstrumentsPositions([
        orders.longOrderExt.order.senderAddress,
      ]);
      const longPositionFr = (longAvgPrice * accountFRLong) / 10n ** PRECISION_DECIMALS_EVEDEX;
      const longCollateralFee = (longPositionFr * 10n ** PRECISION_DECIMALS_DEPOSIT_DEX) / config.USDT_PRICE_COLLATERAL;
      const [, [{ positionAvgPrice: shortAvgPrice }]] = await eveDex.read.getActiveInstrumentsPositions([
        orders.shortOrderExt.order.senderAddress,
      ]);
      const shortPositionFr = (shortAvgPrice * accountFRShort) / 10n ** PRECISION_DECIMALS_EVEDEX;
      const shortCollateralFee =
        (shortPositionFr * 10n ** PRECISION_DECIMALS_DEPOSIT_DEX) / config.USDT_PRICE_COLLATERAL;
      expect(-usdtDiff).to.equal(longCollateralFee + shortCollateralFee);
    }
  });

  it('fr should be collected after liquidation', async () => {
    const { eveDex, matcher, orders, btcToken, usdtToken, depositDex, liquidator } = await prepare(config);
    // 3%
    const newFr = 3n * FR_PRECISION;
    // long pay to short
    const shortFr = newFr;
    const longFr = -newFr;
    const staticFr = 0n; // 30% from newFr
    const timestamp = Math.trunc(Date.now() / 1000);
    await eveDex.write.setFR([BTC_USD_INDEX, longFr, shortFr, staticFr, timestamp], {
      account: matcher.account.address,
    });

    const btcUsdNewPrice = parsePrice(1_000, {
      precisionDecimals: PRECISION_DECIMALS_EVEDEX,
    });
    const btcCollateralNewPrice = parsePrice(1_000, {
      tokenInDecimals: BTC_DECIMALS,
      tokenOutDecimals: USD_DECIMALS,
      precisionDecimals: PRECISION_DECIMALS_DEPOSIT_DEX,
    });
    const { instrumentPrices, collateralPrices } = getFullPricesBtcUsdt(
      btcUsdNewPrice,
      btcCollateralNewPrice,
      config.USDT_PRICE_COLLATERAL,
      btcToken.address,
      usdtToken.address,
    );
    const multiLiquidationOrder = createMultiLiquidationOrder({
      accountToLiquidate: orders.longOrderExt.order.senderAddress,
      liquidator: liquidator.account.address,
      collateral: usdtToken.address,
      liquidationPrices: instrumentPrices,
      prices: instrumentPrices,
      leverage: config.ORDER_LEVERAGE,
    });
    multiLiquidationOrder.signature = await signMultiLiquidationOrder({
      wallet: liquidator,
      order: multiLiquidationOrder,
      contractAddress: eveDex.address,
    });
    const collateralIndices = {
      liquidatorIndex: USDT_COLLATERAL_INDEX, // index of collateral that was used in extended order
      indicesToLiquidate: [USDT_COLLATERAL_INDEX], // indices of user's collaterals that will be used for liquidation
    };
    await writeContract(liquidator, {
      functionName: 'approve',
      address: usdtToken.address,
      abi: usdtToken.abi,
      args: [depositDex.address, config.USDT_DEPOSIT_AMOUNT],
    });
    await writeContract(liquidator, {
      functionName: 'depositCollateral',
      address: depositDex.address,
      abi: depositDex.abi,
      args: [usdtToken.address, config.USDT_DEPOSIT_AMOUNT],
    });
    const fr = await eveDex.read.getAccountFR([orders.longOrderExt.order.senderAddress, BTC_USD_INDEX, timestamp, 0]);
    await writeContract(matcher, {
      functionName: 'liquidatePositions',
      address: eveDex.address,
      abi: eveDex.abi,
      args: [
        multiLiquidationOrder,
        { collateralPrices, instrumentPrices },
        collateralIndices,
        timestamp, // history timestamp
        0n, // history search hint
      ],
    });
    const frAfter = await eveDex.read.getAccountFR([
      orders.longOrderExt.order.senderAddress,
      BTC_USD_INDEX,
      timestamp,
      0,
    ]);
    expect(fr).to.lessThan(0n);
    expect(frAfter).to.equal(0n);
  });

  it('fr should be collected after position change', async () => {
    const {
      eveDex,
      matcher,
      orders,
      btcToken,
      usdtToken,
      depositDex,
      aliceSessionWallet,
      bobSessionWallet,
      fundingRateAccount,
    } = await prepare(config);
    // 3%
    const newFr = 3n * FR_PRECISION;
    // long pay to short
    const shortFr = newFr;
    const longFr = -newFr;
    const staticFr = (30n * FR_PRECISION) / 100n; // 30% from newFr
    const timestamp = Math.trunc(Date.now() / 1000);
    await eveDex.write.setFR([BTC_USD_INDEX, longFr, shortFr, staticFr, timestamp], {
      account: matcher.account.address,
    });

    const shortOrderExt = structuredClone(orders.longOrderExt);
    shortOrderExt.order.side = SELL_SIDE;
    shortOrderExt.order.orderId = ++shortOrderExt.order.orderId;
    shortOrderExt.order.signature = await signOrder({
      wallet: aliceSessionWallet,
      order: shortOrderExt.order,
      contractAddress: eveDex.address,
    });
    const longOrderExt = structuredClone(orders.shortOrderExt);
    longOrderExt.order.side = BUY_SIDE;
    longOrderExt.order.orderId = ++longOrderExt.order.orderId;
    longOrderExt.order.signature = await signOrder({
      wallet: bobSessionWallet,
      order: longOrderExt.order,
      contractAddress: eveDex.address,
    });

    const distributorFrAddress = orders.longOrderExt.order.senderAddress; // alice
    const recieverFrAddress = orders.shortOrderExt.order.senderAddress; // bob
    const frAccount = fundingRateAccount.account.address;

    const [, [{ positionAvgPrice: distributorAvgPrice }]] = await eveDex.read.getActiveInstrumentsPositions([
      distributorFrAddress,
    ]);
    const distributorFR = await eveDex.read.getAccountFR([distributorFrAddress, BTC_USD_INDEX, timestamp, 0]);
    const distributorPositionFr = (distributorAvgPrice * distributorFR) / 10n ** PRECISION_DECIMALS_EVEDEX;
    const distributorCollateralFee =
      (distributorPositionFr * 10n ** PRECISION_DECIMALS_DEPOSIT_DEX) / config.USDT_PRICE_COLLATERAL;

    const [, [{ positionAvgPrice: receiverAvgPrice }]] = await eveDex.read.getActiveInstrumentsPositions([
      recieverFrAddress,
    ]);
    const receiverFR = await eveDex.read.getAccountFR([recieverFrAddress, BTC_USD_INDEX, timestamp, 0]);
    const receiverPositionFr = (receiverAvgPrice * receiverFR) / 10n ** PRECISION_DECIMALS_EVEDEX;
    const receiverCollateralFee =
      (receiverPositionFr * 10n ** PRECISION_DECIMALS_DEPOSIT_DEX) / config.USDT_PRICE_COLLATERAL;

    const distributorCollateralBefore = await depositDex.read.getBalance([distributorFrAddress, usdtToken.address]);
    const receiverCollateralBefore = await depositDex.read.getBalance([recieverFrAddress, usdtToken.address]);
    await writeContract(matcher, {
      functionName: 'fillOrders',
      address: eveDex.address,
      abi: eveDex.abi,
      args: [
        longOrderExt,
        shortOrderExt,
        longOrderExt.order.price,
        longOrderExt.order.amount,
        getFullPricesBtcUsdt(
          config.BTC_PRICE_INSTRUMENT_USERS_TRADE,
          config.BTC_PRICE_COLLATERAL,
          config.USDT_PRICE_COLLATERAL,
          btcToken.address,
          usdtToken.address,
        ),
        timestamp,
        0n,
      ],
    });
    const distributorCollateralAfter = await depositDex.read.getBalance([distributorFrAddress, usdtToken.address]);
    const receiverCollateralAfter = await depositDex.read.getBalance([recieverFrAddress, usdtToken.address]);
    const frAccountCollateralAfter = await depositDex.read.getBalance([frAccount, usdtToken.address]);

    expect(distributorCollateralAfter - distributorCollateralBefore).to.equal(distributorCollateralFee);
    expect(receiverCollateralAfter - receiverCollateralBefore).to.equal(receiverCollateralFee);
    expect(-frAccountCollateralAfter).to.equal(distributorCollateralFee + receiverCollateralFee);
  });
});
