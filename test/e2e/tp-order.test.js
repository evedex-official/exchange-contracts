'use strict';

const { upgrades } = require('hardhat');
const { BUY_SIDE, USDT_COLLATERAL_INDEX, BTC_USD_INDEX, SELL_SIDE } = require('../helpers/constants');
const { generateSuit, restoreSuit } = require('../helpers/generate-suit');
const { writeContract } = require('viem/actions');
const { createSession, createOrderExtended, signOrder, toMultiOrders } = require('../helpers/utils');
const {
  USDT_DEPOSIT_AMOUNT,
  BTC_PRICE,
  ORDER_LEVERAGE,
  MARKET_ORDER_AMOUNT,
  TP_ORDER_AMOUNT,
  TP_ORDER_PRICE,
  USDT_PRICE,
} = require('./tp-order.config');

/**
 * This test focuses on multi-order functionality, simulating Take Profit (TP) order.
 * - TP Order: Executes when the price reaches a higher threshold to secure profits.
 *
 * We assume that Alice places a BUY market order and a TP SELL order
 */
const flow = 'deposit -> create sessions -> Multi-Order TP';

describe(flow, () => {
  before(upgrades.silenceWarnings);

  const orders = {
    bobOrderExt: null,
    aliceMarketOrderExt: null,
    aliceTpOrderExt: null,
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

  it('Alice create tp multi order', async () => {
    const { eveDex, usdtToken, alice, matcher, aliceSessionWallet } = await restoreSuit(flow);
    const marketOrderExt = createOrderExtended({
      collateralIndex: USDT_COLLATERAL_INDEX,
      senderAddress: alice.account.address,
      matcherAddress: matcher.account.address,
      collateral: usdtToken.address,
      instrumentIndex: BTC_USD_INDEX,
      side: BUY_SIDE,
      amount: MARKET_ORDER_AMOUNT,
      price: BTC_PRICE,
      leverage: ORDER_LEVERAGE,
      userSession: aliceSessionWallet.account.address,
    });
    const tpOrderExt = createOrderExtended({
      collateralIndex: USDT_COLLATERAL_INDEX,
      senderAddress: alice.account.address,
      matcherAddress: matcher.account.address,
      collateral: usdtToken.address,
      instrumentIndex: BTC_USD_INDEX,
      side: SELL_SIDE,
      amount: TP_ORDER_AMOUNT,
      price: TP_ORDER_PRICE,
      leverage: ORDER_LEVERAGE,
      userSession: aliceSessionWallet.account.address,
    });
    const [marketMultiOrderExt, tpMultiOrderExt] = await toMultiOrders({
      ordersExt: [marketOrderExt, tpOrderExt],
      wallet: aliceSessionWallet,
      contractAddress: eveDex.address,
    });
    orders.aliceMarketOrderExt = marketMultiOrderExt;
    orders.aliceTpOrderExt = tpMultiOrderExt;
  });

  it('Bob create market order', async () => {
    const { eveDex, usdtToken, bob, matcher, bobSessionWallet } = await restoreSuit(flow);
    const orderExt = createOrderExtended({
      collateralIndex: USDT_COLLATERAL_INDEX,
      senderAddress: bob.account.address,
      matcherAddress: matcher.account.address,
      collateral: usdtToken.address,
      instrumentIndex: BTC_USD_INDEX,
      side: SELL_SIDE,
      amount: MARKET_ORDER_AMOUNT,
      price: BTC_PRICE,
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
        price: BTC_PRICE,
      },
    ];
    const collateralPrices = [
      {
        collateral: usdtToken.address,
        price: USDT_PRICE,
      },
      {
        collateral: btcToken.address,
        price: BTC_PRICE,
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
        BTC_PRICE,
        aliceMarketOrderExt.order.amount,
        fullPrices,
        historyTimestamp,
        historySearchHint,
      ],
    });
  });

  /**
   * Assume that price goes up and reaches TP order price
   * Bob decides to place a buy market order
   * Matcher should match Alice TP order with Bob market order
   */
  it('Bob create market order after price goes up', async () => {
    const { eveDex, usdtToken, bob, matcher, bobSessionWallet } = await restoreSuit(flow);
    const orderExt = createOrderExtended({
      collateralIndex: USDT_COLLATERAL_INDEX,
      senderAddress: bob.account.address,
      matcherAddress: matcher.account.address,
      collateral: usdtToken.address,
      instrumentIndex: BTC_USD_INDEX,
      side: BUY_SIDE,
      amount: TP_ORDER_AMOUNT,
      price: TP_ORDER_PRICE,
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

  it('Matcher match Alice TP order', async () => {
    const { eveDex, usdtToken, btcToken, matcher } = await restoreSuit(flow);
    const { aliceTpOrderExt, bobOrderExt } = orders;
    const instrumentPrices = [
      {
        index: BTC_USD_INDEX,
        price: TP_ORDER_PRICE,
      },
    ];
    const collateralPrices = [
      {
        collateral: usdtToken.address,
        price: USDT_PRICE,
      },
      {
        collateral: btcToken.address,
        price: TP_ORDER_PRICE,
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
        aliceTpOrderExt,
        TP_ORDER_PRICE,
        aliceTpOrderExt.order.amount,
        fullPrices,
        historyTimestamp,
        historySearchHint,
      ],
    });
  });
});
