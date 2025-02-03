'use strict';

const { upgrades } = require('hardhat');
const { BUY_SIDE, USDT_COLLATERAL_INDEX, BTC_USD_INDEX, SELL_SIDE } = require('../helpers/constants');
const { generateSuit, restoreSuit } = require('../helpers/generate-suit');
const { writeContract } = require('viem/actions');
const { createSession, createOrderExtended, signOrder, toMultiOrders } = require('../helpers/utils');
const {
  USDT_DEPOSIT_AMOUNT,
  MARKET_ORDER_AMOUNT,
  ORDER_LEVERAGE,
  TP_ORDER_AMOUNT,
  TP_ORDER_PRICE,
  SL_ORDER_AMOUNT,
  SL_ORDER_PRICE,
  TRIGGER_BTC_PRICE,
  BTC_INSTRUMENT_INITIAL_PRICE,
  USDT_COLLATERAL_PRICE,
  BTC_COLLATERAL_PRICE,
  BTC_COLLATERAL_TRIGGER_PRICE,
} = require('./tp-sl-order.config');

/**
 * This test focuses on multi-order functionality, simulating Take Profit (TP) and Stop Loss (SL) orders.
 * - TP Order: Executes when the price reaches a higher threshold to secure profits.
 * - SL Order: Executes when the price drops to a lower threshold to limit losses.
 *
 * We assume that Alice places a BUY market order and a TP (SL) SELL order.
 * If price goes up, TP order will be triggered
 * If price goes down, SL order will be triggered
 */
const flow = 'deposit -> create sessions -> Multi-Order TP/SL';

describe(flow, () => {
  before(upgrades.silenceWarnings);

  const orders = {
    bobOrderExt: null,
    aliceMarketOrderExt: null,
    aliceTpOrderExt: null,
    aliceSlOrderExt: null,
  };

  it('Alice and Bob deposit usdt', async () => {
    const { usdtToken, alice, bob, depositDex } = await generateSuit(flow);
    const deposit = async ({ user }) => {
      await writeContract(user, {
        functionName: 'approve',
        address: usdtToken.address,
        abi: usdtToken.abi,
        args: [depositDex.address, USDT_DEPOSIT_AMOUNT],
      });
      await writeContract(user, {
        functionName: 'depositCollateral',
        address: depositDex.address,
        abi: depositDex.abi,
        args: [usdtToken.address, USDT_DEPOSIT_AMOUNT],
      });
    };

    await Promise.all([deposit({ user: alice }), deposit({ user: bob })]);
  });

  it('Alice and Bob create sessions', async () => {
    const { alice, bob, sessions, aliceSessionWallet, bobSessionWallet } = await restoreSuit(flow);
    const create = async (userWallet, sessionWallet) => {
      await createSession({
        userWallet,
        sessionManagerContract: sessions,
        sessionWallet,
        withdrawConfig: [],
      });
    };
    await Promise.all([create(alice, aliceSessionWallet), create(bob, bobSessionWallet)]);
  });

  it('Alice creates tp and sl multi order', async () => {
    const { eveDex, alice, matcher, aliceSessionWallet } = await restoreSuit(flow);
    const marketOrderExt = createOrderExtended({
      collateralIndex: USDT_COLLATERAL_INDEX,
      senderAddress: alice.account.address,
      matcherAddress: matcher.account.address,
      instrumentIndex: BTC_USD_INDEX,
      side: BUY_SIDE,
      amount: MARKET_ORDER_AMOUNT,
      price: BTC_INSTRUMENT_INITIAL_PRICE,
      leverage: ORDER_LEVERAGE,
      userSession: aliceSessionWallet.account.address,
    });
    const tpOrderExt = createOrderExtended({
      collateralIndex: USDT_COLLATERAL_INDEX,
      senderAddress: alice.account.address,
      matcherAddress: matcher.account.address,
      instrumentIndex: BTC_USD_INDEX,
      side: SELL_SIDE,
      amount: TP_ORDER_AMOUNT,
      price: TP_ORDER_PRICE,
      leverage: ORDER_LEVERAGE,
      userSession: aliceSessionWallet.account.address,
    });
    const slOrderExt = createOrderExtended({
      collateralIndex: USDT_COLLATERAL_INDEX,
      senderAddress: alice.account.address,
      matcherAddress: matcher.account.address,
      instrumentIndex: BTC_USD_INDEX,
      side: SELL_SIDE,
      amount: SL_ORDER_AMOUNT,
      price: SL_ORDER_PRICE,
      leverage: ORDER_LEVERAGE,
      userSession: aliceSessionWallet.account.address,
    });
    const [marketMultiOrderExt, tpMultiOrderExt, slMultiOrderExt] = await toMultiOrders({
      ordersExt: [marketOrderExt, tpOrderExt, slOrderExt],
      wallet: aliceSessionWallet,
      contractAddress: eveDex.address,
    });
    orders.aliceMarketOrderExt = marketMultiOrderExt;
    orders.aliceTpOrderExt = tpMultiOrderExt;
    orders.aliceSlOrderExt = slMultiOrderExt;
  });

  it('Bob create market order', async () => {
    const { eveDex, bob, matcher, bobSessionWallet } = await restoreSuit(flow);
    const orderExt = createOrderExtended({
      collateralIndex: USDT_COLLATERAL_INDEX,
      senderAddress: bob.account.address,
      matcherAddress: matcher.account.address,
      instrumentIndex: BTC_USD_INDEX,
      side: SELL_SIDE,
      amount: MARKET_ORDER_AMOUNT,
      price: BTC_INSTRUMENT_INITIAL_PRICE,
      leverage: ORDER_LEVERAGE,
      userSession: bobSessionWallet.account.address,
    });
    orderExt.order.signature = await signOrder({
      wallet: bobSessionWallet,
      order: orderExt.order,
      contractAddress: eveDex.address,
    });
    orders.bobOrderExt = orderExt;
  });

  it('Matcher match Alice and Bob market orders', async () => {
    const { eveDex, usdtToken, btcToken, matcher } = await restoreSuit(flow);
    const { aliceMarketOrderExt, bobOrderExt } = orders;
    const instrumentPrices = [
      {
        index: BTC_USD_INDEX,
        price: BTC_INSTRUMENT_INITIAL_PRICE,
      },
    ];
    const collateralPrices = [
      {
        collateral: usdtToken.address,
        price: USDT_COLLATERAL_PRICE,
      },
      {
        collateral: btcToken.address,
        price: BTC_COLLATERAL_PRICE,
      },
    ];
    const fullPrices = { instrumentPrices, collateralPrices };
    const historyTimestamp = Math.trunc(Date.now() / 1000);
    const historySearchHint = 0n; // element index in funding rate array. Hint from backend to reduce tx gas cost
    await writeContract(matcher, {
      functionName: 'fillOrders',
      address: eveDex.address,
      abi: eveDex.abi,
      args: [
        aliceMarketOrderExt,
        bobOrderExt,
        BTC_INSTRUMENT_INITIAL_PRICE,
        aliceMarketOrderExt.order.amount,
        fullPrices,
        historyTimestamp,
        historySearchHint,
      ],
    });
  });

  /**
   * After price change Bob decides to close his position and place a buy market order
   * Matcher should match Alice SL or TP order with Bob market order
   *
   * Depending on TRIGGER_PRICE, TP or SL order will be triggered
   */
  it('Bob create market order after price changes', async () => {
    const { eveDex, bob, matcher, bobSessionWallet } = await restoreSuit(flow);

    const isUp = TRIGGER_BTC_PRICE > BTC_INSTRUMENT_INITIAL_PRICE;
    const amount = isUp ? TP_ORDER_AMOUNT : SL_ORDER_AMOUNT;
    const price = isUp ? TP_ORDER_PRICE : SL_ORDER_PRICE;

    const orderExt = createOrderExtended({
      collateralIndex: USDT_COLLATERAL_INDEX,
      senderAddress: bob.account.address,
      matcherAddress: matcher.account.address,
      instrumentIndex: BTC_USD_INDEX,
      side: BUY_SIDE,
      amount,
      price,
      leverage: ORDER_LEVERAGE,
      userSession: bobSessionWallet.account.address,
    });
    orderExt.order.signature = await signOrder({
      wallet: bobSessionWallet,
      order: orderExt.order,
      contractAddress: eveDex.address,
    });
    orders.bobOrderExt = orderExt;
  });

  it('Matcher match Alice TP or SL order', async () => {
    const { eveDex, usdtToken, btcToken, matcher } = await restoreSuit(flow);
    const { aliceSlOrderExt, aliceTpOrderExt, bobOrderExt } = orders;
    if (TRIGGER_BTC_PRICE > SL_ORDER_PRICE && TRIGGER_BTC_PRICE < TP_ORDER_PRICE) {
      console.warn(`NOTHING TO TRIGGER! Price has not reached TP or SL order`);
      return;
    }
    const isUp = TRIGGER_BTC_PRICE > BTC_INSTRUMENT_INITIAL_PRICE;
    const aliceOrderExt = isUp ? aliceTpOrderExt : aliceSlOrderExt;
    const instrumentPrice = isUp ? TP_ORDER_PRICE : SL_ORDER_PRICE;

    const instrumentPrices = [
      {
        index: BTC_USD_INDEX,
        price: instrumentPrice,
      },
    ];
    const collateralPrices = [
      {
        collateral: usdtToken.address,
        price: USDT_COLLATERAL_PRICE,
      },
      {
        collateral: btcToken.address,
        price: BTC_COLLATERAL_TRIGGER_PRICE,
      },
    ];
    const fullPrices = { instrumentPrices, collateralPrices };
    const historyTimestamp = Math.trunc(Date.now() / 1000);
    const historySearchHint = 0n; // element index in funding rate array. Hint from backend to reduce tx gas cost
    await writeContract(matcher, {
      functionName: 'fillOrders',
      address: eveDex.address,
      abi: eveDex.abi,
      args: [
        bobOrderExt,
        aliceOrderExt,
        instrumentPrice,
        bobOrderExt.order.amount,
        fullPrices,
        historyTimestamp,
        historySearchHint,
      ],
    });
    console.warn(`${isUp ? 'TP' : 'SL'} order triggered at price: ${instrumentPrice}`);
  });
});
