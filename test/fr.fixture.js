'use strict';

const { BTC_USD_INDEX, USDT_COLLATERAL_INDEX, BUY_SIDE, SELL_SIDE } = require('./helpers/constants');
const {
  createSession,
  calculateBoundaryOrderAmount,
  createOrderExtended,
  signOrder,
  getFullPricesBtcUsdt,
} = require('./helpers/utils');
const { generateSuit } = require('./helpers/generate-suit');
const { writeContract } = require('viem/actions');
const { maxUint256 } = require('viem');

const deposit = async ({ usdtToken, alice, bob, depositDex, config }) => {
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
  await Promise.all([deposit({ user: alice }), deposit({ user: bob })]);
};

const setSessions = async ({ alice, bob, sessions, usdtToken, btcToken, aliceSessionWallet, bobSessionWallet }) => {
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
};

const createOrders = async ({
  alice,
  bob,
  matcher,
  usdtToken,
  btcToken,
  aliceSessionWallet,
  bobSessionWallet,
  eveDex,
  config,
}) => {
  const createOrder = async ({ side, userWallet, userSessionWallet, price, orderSizePercent }) => {
    const { collateralPrices, instrumentPrices } = getFullPricesBtcUsdt(
      config.BTC_PRICE_INSTRUMENT_USERS_TRADE,
      config.BTC_PRICE_COLLATERAL,
      config.USDT_PRICE_COLLATERAL,
      btcToken.address,
      usdtToken.address,
    );
    const boundaryAmount = await calculateBoundaryOrderAmount({
      eveDexContract: eveDex,
      instrumentPrices,
      userWallet,
      leverage: config.ORDER_LEVERAGE,
      instrumentIndex: BTC_USD_INDEX,
      collateralPrices,
    });
    const amount = (boundaryAmount * orderSizePercent) / 100n;

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

  const [longOrderExt, shortOrderExt] = await Promise.all([
    createOrder({
      side: BUY_SIDE,
      userWallet: alice,
      userSessionWallet: aliceSessionWallet,
      price: config.BTC_PRICE_INSTRUMENT_USERS_TRADE,
      orderSizePercent: config.USER_ORDER_SIZE_PERCENT,
    }),
    createOrder({
      side: SELL_SIDE,
      userWallet: bob,
      userSessionWallet: bobSessionWallet,
      price: config.BTC_PRICE_INSTRUMENT_USERS_TRADE,
      orderSizePercent: config.USER_ORDER_SIZE_PERCENT,
    }),
  ]);
  return {
    longOrderExt,
    shortOrderExt,
  };
};

const matchOrders = async ({ matcher, usdtToken, btcToken, eveDex, orders, config }) => {
  const historyTimestamp = Math.trunc(Date.now() / 1000);
  const historySearchHint = 0n; // element index in funding rate array. Hint from backend to reduce tx gas cost

  await writeContract(matcher, {
    functionName: 'fillOrders',
    address: eveDex.address,
    abi: eveDex.abi,
    args: [
      orders.longOrderExt,
      orders.shortOrderExt,
      orders.longOrderExt.order.price,
      orders.longOrderExt.order.amount,
      getFullPricesBtcUsdt(
        config.BTC_PRICE_INSTRUMENT_USERS_TRADE,
        config.BTC_PRICE_COLLATERAL,
        config.USDT_PRICE_COLLATERAL,
        btcToken.address,
        usdtToken.address,
      ),
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
