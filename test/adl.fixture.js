'use strict';

const { BTC_USD_INDEX, USDT_COLLATERAL_INDEX, BUY_SIDE, SELL_SIDE } = require('./helpers/constants');
const { createSession, calculateBoundaryOrderAmount, createOrderExtended, signOrder } = require('./helpers/utils');
const { generateSuit } = require('./helpers/generate-suit');
const { writeContract } = require('viem/actions');
const { maxUint256 } = require('viem');

const deposit = async ({ usdtToken, alice, bob, carol, liquidator, depositDex, config }) => {
  const deposit = async ({ user, amount = config.USDT_DEPOSIT_AMOUNT }) => {
    await writeContract(user, {
      functionName: 'approve',
      address: usdtToken.address,
      abi: usdtToken.abi,
      args: [depositDex.address, amount],
    });
    await writeContract(user, {
      functionName: 'depositCollateral',
      address: depositDex.address,
      abi: depositDex.abi,
      args: [usdtToken.address, amount],
    });
  };
  await Promise.all([
    deposit({ user: alice }),
    deposit({ user: bob }),
    deposit({ user: liquidator, amount: config.USDT_DEPOSIT_AMOUNT * 100n }),
    deposit({ user: carol, amount: config.USDT_DEPOSIT_AMOUNT * 100n }),
  ]);
};

const setSessions = async ({
  alice,
  bob,
  carol, // used as counterparty for liquidator
  liquidator,
  sessions,
  usdtToken,
  btcToken,
  aliceSessionWallet,
  bobSessionWallet,
  carolSessionWallet,
  liquidatorSessionWallet,
}) => {
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
    createSession({
      userWallet: liquidator,
      sessionManagerContract: sessions,
      sessionWallet: liquidatorSessionWallet,
      withdrawConfig,
    }),
    createSession({
      userWallet: carol,
      sessionManagerContract: sessions,
      sessionWallet: carolSessionWallet,
      withdrawConfig,
    }),
  ]);
};

const createOrders = async ({
  alice,
  bob,
  carol, // used as counterparty for liquidator
  liquidator,
  matcher,
  usdtToken,
  btcToken,
  aliceSessionWallet,
  bobSessionWallet,
  carolSessionWallet,
  liquidatorSessionWallet,
  eveDex,
  config,
}) => {
  // Set up prices for instruments and collateral
  const buildFullPrices = (btcPrice) => ({
    instrumentPrices: [
      {
        index: BTC_USD_INDEX,
        price: btcPrice,
      },
    ],
    collateralPrices: [
      {
        collateral: usdtToken.address,
        price: config.USDT_PRICE,
      },
      {
        collateral: btcToken.address,
        price: btcPrice,
      },
    ],
  });

  const createOrder = async ({ side, userWallet, userSessionWallet, price }) => {
    const { collateralPrices, instrumentPrices } = buildFullPrices(price);
    const boundaryAmount = await calculateBoundaryOrderAmount({
      eveDexContract: eveDex,
      instrumentPrices,
      userWallet,
      leverage: config.ORDER_LEVERAGE,
      instrumentIndex: BTC_USD_INDEX,
      collateralPrices,
    });
    const amount = (boundaryAmount * config.INITIAL_ORDER_SIZE_PERCENT) / 100n;

    const orderExt = createOrderExtended({
      collateralIndex: USDT_COLLATERAL_INDEX,
      senderAddress: userWallet.account.address,
      matcherAddress: matcher.account.address,
      collateral: usdtToken.address,
      instrumentIndex: BTC_USD_INDEX,
      side,
      amount,
      price,
      leverage: config.ORDER_LEVERAGE,
      userSession: userSessionWallet.account.address,
    });
    const orderSign = await signOrder({
      wallet: userSessionWallet,
      order: orderExt.order,
      contractAddress: eveDex.address,
    });
    orderExt.order.signature = orderSign;
    return orderExt;
  };

  const [longOrderExt, shortOrderExt, liquidatorOrderExt, carolOrderExt] = await Promise.all([
    createOrder({
      side: BUY_SIDE,
      userWallet: alice,
      userSessionWallet: aliceSessionWallet,
      price: config.BTC_PRICE_USERS_TRADE,
    }),
    createOrder({
      side: SELL_SIDE,
      userWallet: bob,
      userSessionWallet: bobSessionWallet,
      price: config.BTC_PRICE_USERS_TRADE,
    }),
    createOrder({
      side: config.LIQUIDATOR_ORDER_SIDE,
      userWallet: liquidator,
      userSessionWallet: liquidatorSessionWallet,
      price: config.BTC_PRICE_LIQUIDATOR_TRADE,
    }),
    createOrder({
      side: config.LIQUIDATOR_ORDER_SIDE === BUY_SIDE ? SELL_SIDE : BUY_SIDE,
      userWallet: carol,
      userSessionWallet: carolSessionWallet,
      price: config.BTC_PRICE_LIQUIDATOR_TRADE,
    }),
  ]);
  return {
    longOrderExt,
    shortOrderExt,
    liquidatorOrderExt,
    carolOrderExt,
  };
};

const matchOrders = async ({ matcher, usdtToken, btcToken, eveDex, orders, config }) => {
  // fullPrices is a structure with prices of all collaterals and instruments
  // instrumentPrices is a list of all futures prices available on dex
  // collateralPrices is a list of all collateral prices available on dex
  const buildFullPrices = (btcPrice) => ({
    instrumentPrices: [
      {
        index: BTC_USD_INDEX,
        price: btcPrice,
      },
    ],
    collateralPrices: [
      {
        collateral: usdtToken.address,
        price: config.USDT_PRICE,
      },
      {
        collateral: btcToken.address,
        price: btcPrice,
      },
    ],
  });
  const historyTimestamp = Math.trunc(Date.now() / 1000);
  const historySearchHint = 0n; // element index in funding rate array. Hint from backend to reduce tx gas cost

  await writeContract(matcher, {
    functionName: 'fillOrders',
    address: eveDex.address,
    abi: eveDex.abi,
    args: [
      orders.longOrderExt,
      orders.shortOrderExt,
      config.BTC_PRICE_USERS_TRADE,
      orders.longOrderExt.order.amount,
      buildFullPrices(config.BTC_PRICE_USERS_TRADE),
      historyTimestamp,
      historySearchHint,
    ],
  });

  await writeContract(matcher, {
    functionName: 'fillOrders',
    address: eveDex.address,
    abi: eveDex.abi,
    args:
      config.LIQUIDATOR_ORDER_SIDE === BUY_SIDE
        ? [
            orders.liquidatorOrderExt,
            orders.carolOrderExt,
            config.BTC_PRICE_LIQUIDATOR_TRADE,
            orders.liquidatorOrderExt.order.amount,
            buildFullPrices(config.BTC_PRICE_LIQUIDATOR_TRADE),
            historyTimestamp,
            historySearchHint,
          ]
        : [
            orders.carolOrderExt,
            orders.liquidatorOrderExt,
            config.BTC_PRICE_LIQUIDATOR_TRADE,
            orders.carolOrderExt.order.amount,
            buildFullPrices(config.BTC_PRICE_LIQUIDATOR_TRADE),
            historyTimestamp,
            historySearchHint,
          ],
  });
};

const prepare = async (config) => {
  const suit = await generateSuit(config.suit);
  const arg = { ...suit, config };
  await deposit(arg);
  await setSessions(arg);
  const orders = await createOrders(arg);
  await matchOrders({ ...arg, orders });
  return { ...suit, orders };
};

module.exports = { prepare };
