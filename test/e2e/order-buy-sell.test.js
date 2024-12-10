'use strict';

const { upgrades } = require('hardhat');
const { generateSuit, restoreSuit } = require('../helpers/generate-suit');
const { maxUint256 } = require('viem');
const { createSession, createOrderExtended, signOrder, calculateBoundaryOrderAmount } = require('../helpers/utils');
const { writeContract } = require('viem/actions');
const { BUY_SIDE, BTC_USD_INDEX, USDT_COLLATERAL_INDEX, SELL_SIDE } = require('../helpers/constants');
const { USDT_DEPOSIT_AMOUNT, BTC_PRICE, USDT_PRICE, ORDER_LEVERAGE } = require('./order-by-sell.config');

const flow = 'deposit -> create session -> buy order -> sell order -> withdraw';

describe(flow, () => {
  before(upgrades.silenceWarnings);

  // simulate the heap of the matcher
  const matcherState = {
    buyOrder: null,
    sellOrder: null,
    matchOrders: () => {
      if (!matcherState.buyOrder || !matcherState.sellOrder) throw 'no orders to match';
      return {
        buyOrder: matcherState.buyOrder,
        sellOrder: matcherState.sellOrder,
      };
    },
  };

  it('Alice deposit usdt', async () => {
    const { usdtToken, alice, depositDex } = await generateSuit(flow);
    await writeContract(alice, {
      functionName: 'approve',
      address: usdtToken.address,
      abi: usdtToken.abi,
      args: [depositDex.address, USDT_DEPOSIT_AMOUNT],
    });
    await writeContract(alice, {
      functionName: 'depositCollateral',
      address: depositDex.address,
      abi: depositDex.abi,
      args: [usdtToken.address, USDT_DEPOSIT_AMOUNT],
    });
  });

  it('Bob deposit usdt', async () => {
    const { usdtToken, bob, depositDex } = await restoreSuit(flow);
    await writeContract(bob, {
      functionName: 'approve',
      address: usdtToken.address,
      abi: usdtToken.abi,
      args: [depositDex.address, USDT_DEPOSIT_AMOUNT],
    });
    await writeContract(bob, {
      functionName: 'depositCollateral',
      address: depositDex.address,
      abi: depositDex.abi,
      args: [usdtToken.address, USDT_DEPOSIT_AMOUNT],
    });
  });

  it('Alice and Bob create sessions', async () => {
    const { alice, bob, sessions, usdtToken, btcToken, aliceSessionWallet, bobSessionWallet } = await restoreSuit(flow);
    const withdrawConfig = [
      {
        collateral: usdtToken.address,
        amount: maxUint256,
      },
      {
        collateral: btcToken.address,
        amount: maxUint256,
      },
    ];
    await Promise.all([
      createSession({
        userWallet: alice,
        sessionManagerContract: sessions,
        sessionWallet: aliceSessionWallet,
        withdrawConfig,
      }),
      createSession({
        userWallet: bob,
        sessionManagerContract: sessions,
        sessionWallet: bobSessionWallet,
        withdrawConfig,
      }),
    ]);
  });

  it('Alice buy order creation', async () => {
    const { alice, matcher, usdtToken, btcToken, aliceSessionWallet, eveDex } = await restoreSuit(flow);
    // Set up prices for instruments and collateral
    const instrumentPrices = [
      {
        index: BTC_USD_INDEX,
        price: BTC_PRICE, // BTC price
      },
    ];
    const collateralPrices = [
      {
        collateral: usdtToken.address,
        price: USDT_PRICE, // USDT price
      },
      {
        collateral: btcToken.address,
        price: BTC_PRICE, // BTC price (if BTC is used as collateral)
      },
    ];
    const buyOrderAmount = await calculateBoundaryOrderAmount({
      eveDexContract: eveDex,
      instrumentPrices,
      userWallet: alice,
      leverage: ORDER_LEVERAGE,
      instrumentIndex: BTC_USD_INDEX,
      collateralPrices,
    });

    const buyOrderExtended = createOrderExtended({
      collateralIndex: USDT_COLLATERAL_INDEX,
      senderAddress: alice.account.address,
      matcherAddress: matcher.account.address,
      collateral: usdtToken.address,
      instrumentIndex: BTC_USD_INDEX,
      side: BUY_SIDE,
      amount: buyOrderAmount,
      price: BTC_PRICE,
      leverage: ORDER_LEVERAGE,
      userSession: aliceSessionWallet.account.address,
    });

    const signature = await signOrder({
      wallet: aliceSessionWallet,
      order: buyOrderExtended.order,
      contractAddress: eveDex.address,
    });

    buyOrderExtended.order.signature = signature;
    matcherState.buyOrder = buyOrderExtended;
  });

  it('Bob sell order creation', async () => {
    const { bob, matcher, usdtToken, btcToken, bobSessionWallet, eveDex } = await restoreSuit(flow);
    // Set up prices for instruments and collateral
    const instrumentPrices = [
      {
        index: BTC_USD_INDEX,
        price: BTC_PRICE, // BTC price
      },
    ];
    const collateralPrices = [
      {
        collateral: usdtToken.address,
        price: USDT_PRICE, // USDT price
      },
      {
        collateral: btcToken.address,
        price: BTC_PRICE, // BTC price (if BTC is used as collateral)
      },
    ];
    const sellOrderAmount = await calculateBoundaryOrderAmount({
      eveDexContract: eveDex,
      instrumentPrices,
      userWallet: bob,
      leverage: ORDER_LEVERAGE,
      instrumentIndex: BTC_USD_INDEX,
      collateralPrices,
    });

    const sellOrderExtended = createOrderExtended({
      collateralIndex: USDT_COLLATERAL_INDEX,
      senderAddress: bob.account.address,
      matcherAddress: matcher.account.address,
      collateral: usdtToken.address,
      instrumentIndex: BTC_USD_INDEX,
      side: SELL_SIDE,
      amount: sellOrderAmount,
      price: BTC_PRICE,
      leverage: ORDER_LEVERAGE,
      userSession: bobSessionWallet.account.address,
    });

    const signature = await signOrder({
      wallet: bobSessionWallet,
      order: sellOrderExtended.order,
      contractAddress: eveDex.address,
    });

    sellOrderExtended.order.signature = signature;
    matcherState.sellOrder = sellOrderExtended;
  });

  it('matcher match orders', async () => {
    const { matcher, usdtToken, btcToken, eveDex } = await restoreSuit(flow);
    // matcher found buy and sell orders to match
    const { buyOrder, sellOrder } = matcherState.matchOrders();

    // fullPrices is a structure with prices of all collaterals and instruments
    // instrumentPrices is a list of all futures prices available on dex
    // collateralPrices is a list of all collateral prices available on dex
    const fullPrices = {
      instrumentPrices: [
        {
          index: BTC_USD_INDEX,
          price: BTC_PRICE,
        },
      ],
      collateralPrices: [
        {
          collateral: usdtToken.address,
          price: USDT_PRICE,
        },
        {
          collateral: btcToken.address,
          price: BTC_PRICE,
        },
      ],
    };
    const historyTimestamp = Math.trunc(Date.now() / 1000);
    const historySearchHint = 0n; // element index in funding rate array. Hint from backend to reduce tx gas cost
    await writeContract(matcher, {
      functionName: 'fillOrders',
      address: eveDex.address,
      abi: eveDex.abi,
      args: [buyOrder, sellOrder, BTC_PRICE, buyOrder.order.amount, fullPrices, historyTimestamp, historySearchHint],
    });
  });
});
