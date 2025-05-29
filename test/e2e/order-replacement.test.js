const { restoreSuit, generateSuit } = require('../helpers/generate-suit');
const { BTC_USD_INDEX, USDT_COLLATERAL_INDEX, BUY_SIDE, SELL_SIDE } = require('../helpers/constants');
const { createOrderExtended, signOrder, createSession, getOrderDigest } = require('../helpers/utils');
const {
  ORDER_LEVERAGE,
  ORDER_AMOUNT,
  USDT_DEPOSIT_AMOUNT,
  NEW_ORDER_AMOUNT,
  BTC_INSTRUMENT_PRICE,
  USDT_COLLATERAL_PRICE,
  BTC_COLLATERAL_PRICE,
} = require('./order-replacement.config');
const { writeContract, readContract } = require('viem/actions');
const { expect } = require('chai');

const flow = 'deposit -> create session -> simple order replacement -> partially executed order replacement';
describe(flow, () => {
  const matcherState = {
    orders: {},
  };
  let aliceOrderId = '';
  let bobOrderId = '';

  it('Alice and Bob deposit usdt', async () => {
    const { usdtToken, alice, bob, depositDex } = await generateSuit(flow);
    const deposit = async ({ user, amount }) => {
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
      deposit({ user: alice, amount: USDT_DEPOSIT_AMOUNT }),
      deposit({ user: bob, amount: USDT_DEPOSIT_AMOUNT }),
    ]);
  });

  it('Alice and Bob create sessions', async () => {
    const { alice, bob, sessions, aliceSessionWallet, bobSessionWallet } = await restoreSuit(flow);
    const withdrawConfig = [];
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

  it('Alice creates the order', async () => {
    const { alice, matcher, usdtToken, aliceSessionWallet, eveDex } = await restoreSuit(flow);
    const orderExtended = createOrderExtended({
      collateralIndex: USDT_COLLATERAL_INDEX,
      senderAddress: alice.account.address,
      matcherAddress: matcher.account.address,
      collateral: usdtToken.address,
      instrumentIndex: BTC_USD_INDEX,
      side: BUY_SIDE,
      amount: ORDER_AMOUNT,
      price: BTC_INSTRUMENT_PRICE,
      leverage: ORDER_LEVERAGE,
      userSession: aliceSessionWallet.account.address,
      expiration: Math.floor(Date.now() / 1000) + 300,
    });
    const signature = await signOrder({
      wallet: aliceSessionWallet,
      order: orderExtended.order,
      contractAddress: eveDex.address,
    });
    orderExtended.order.signature = signature;
    const orderDigest = await getOrderDigest({ order: orderExtended.order });
    matcherState.orders[orderDigest] = orderExtended;
    aliceOrderId = orderDigest;
  });

  /**
   * Alice changes the amount of the order.
   *
   * Old order should be dropped and replaced with the new one in matcher state.
   * New params of the order should be signed again.
   * Likely, we got sessionWallet on the frontend side and we can
   * generate signature without opening metamask.
   */
  it('Alice changes the order', async () => {
    const { alice, matcher, usdtToken, aliceSessionWallet, eveDex } = await restoreSuit(flow);
    const orderExtended = createOrderExtended({
      collateralIndex: USDT_COLLATERAL_INDEX,
      senderAddress: alice.account.address,
      matcherAddress: matcher.account.address,
      collateral: usdtToken.address,
      instrumentIndex: BTC_USD_INDEX,
      side: BUY_SIDE,
      amount: NEW_ORDER_AMOUNT,
      price: BTC_INSTRUMENT_PRICE,
      leverage: ORDER_LEVERAGE,
      userSession: aliceSessionWallet.account.address,
      // event if the rest of the params are the same, expiration of the order will be changed
      // so signature will be different
      expiration: Math.floor(Date.now() / 1000) + 300,
    });
    const signature = await signOrder({
      wallet: aliceSessionWallet,
      order: orderExtended.order,
      contractAddress: eveDex.address,
    });
    orderExtended.order.signature = signature;

    // drop old order
    delete matcherState.orders[aliceOrderId];

    // add new order
    aliceOrderId = await getOrderDigest({ order: orderExtended.order });
    matcherState.orders[aliceOrderId] = orderExtended;

    // ... execution of the new order
  });

  /**
   * Now lets look at the case where the order is partially executed and then replaced.
   */
  it('Alice and Bob create orders', async () => {
    const { alice, bob, matcher, usdtToken, aliceSessionWallet, bobSessionWallet, eveDex } = await restoreSuit(flow);

    const createOrder = async ({ userWallet, userSessionWallet, side, amount }) => {
      const orderExt = createOrderExtended({
        collateralIndex: USDT_COLLATERAL_INDEX,
        senderAddress: userWallet.account.address,
        matcherAddress: matcher.account.address,
        collateral: usdtToken.address,
        instrumentIndex: BTC_USD_INDEX,
        side,
        amount,
        price: BTC_INSTRUMENT_PRICE,
        leverage: ORDER_LEVERAGE,
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

    // Bob's order is smaller so Alice's order could be partially executed
    const bobOrderAmount = ORDER_AMOUNT / 3n;
    if (bobOrderAmount <= 0n) throw new Error('PLEASE CHOOSE ORDER_AMOUNT >= 3n');

    const [aliceOrderExt, bobOrderExt] = await Promise.all([
      createOrder({ userWallet: alice, userSessionWallet: aliceSessionWallet, side: BUY_SIDE, amount: ORDER_AMOUNT }),
      createOrder({ userWallet: bob, userSessionWallet: bobSessionWallet, side: SELL_SIDE, amount: bobOrderAmount }),
    ]);
    aliceOrderId = await getOrderDigest({ order: aliceOrderExt.order });
    bobOrderId = await getOrderDigest({ order: bobOrderExt.order });
    matcherState.orders[aliceOrderId] = aliceOrderExt;
    matcherState.orders[bobOrderId] = bobOrderExt;
  });

  it('Partial execution of Alice order', async () => {
    const { matcher, usdtToken, eveDex, btcToken } = await restoreSuit(flow);
    const aliceOrderExt = matcherState.orders[aliceOrderId];
    const bobOrderExt = matcherState.orders[bobOrderId];
    const [longOrder, shortOrder] =
      aliceOrderExt.order.side === BUY_SIDE ? [aliceOrderExt, bobOrderExt] : [bobOrderExt, aliceOrderExt];
    const instrumentPrice = longOrder.order.price;
    const instrumentIndex = longOrder.order.instrumentIndex;
    const fullPrices = {
      instrumentPrices: [
        {
          index: instrumentIndex,
          price: instrumentPrice,
        },
      ],
      collateralPrices: [
        {
          collateral: usdtToken.address,
          price: USDT_COLLATERAL_PRICE,
        },
        {
          collateral: btcToken.address,
          price: BTC_COLLATERAL_PRICE,
        },
      ],
    };
    const fillAmount =
      aliceOrderExt.order.amount < bobOrderExt.order.amount ? aliceOrderExt.order.amount : bobOrderExt.order.amount;
    const historyTimestamp = Math.trunc(Date.now() / 1000);
    const historySearchHint = 0n; // element index in funding rate array. Hint from backend to reduce tx gas cost
    await writeContract(matcher, {
      functionName: 'fillOrder',
      address: eveDex.address,
      abi: eveDex.abi,
      args: [longOrder, shortOrder, instrumentPrice, fillAmount, fullPrices, historyTimestamp, historySearchHint],
    });
    await writeContract(matcher, {
      functionName: 'fillOrder',
      address: eveDex.address,
      abi: eveDex.abi,
      args: [shortOrder, longOrder, instrumentPrice, fillAmount, fullPrices, historyTimestamp, historySearchHint],
    });
  });

  /**
   * Alice desides to change the order amount after partial execution.
   *  ACTUAL_NEW_AMOUNT = NEW_ORDER_AMOUNT - FILLED_AMOUNT
   *  if ACTUAL_NEW_AMOUNT <= 0 then we decide NOT to post opposite order and forbid the user to change the order
   *  if ACTUAL_NEW_AMOUNT > 0 then we post the order with the ACTUAL_NEW_AMOUNT
   */
  it('Alice changes the order after partial execution', async () => {
    const { alice, matcher, usdtToken, aliceSessionWallet, eveDex } = await restoreSuit(flow);
    const filledAmount = await readContract(alice, {
      functionName: 'filledAmounts',
      address: eveDex.address,
      abi: eveDex.abi,
      args: [aliceOrderId],
    });
    const actualNewAmount = NEW_ORDER_AMOUNT - filledAmount;
    if (actualNewAmount <= 0n) {
      throw new Error('PLEASE CHOOSE NEW_ORDER_AMOUNT > FILLED_AMOUNT');
    }

    const orderExtended = createOrderExtended({
      orderId: 142n,
      collateralIndex: USDT_COLLATERAL_INDEX,
      senderAddress: alice.account.address,
      matcherAddress: matcher.account.address,
      collateral: usdtToken.address,
      instrumentIndex: BTC_USD_INDEX,
      side: BUY_SIDE,
      amount: actualNewAmount,
      price: BTC_INSTRUMENT_PRICE,
      leverage: ORDER_LEVERAGE,
      userSession: aliceSessionWallet.account.address,
      creationTime: Math.floor(Date.now() / 1000),
    });
    const signature = await signOrder({
      wallet: aliceSessionWallet,
      order: orderExtended.order,
      contractAddress: eveDex.address,
    });
    orderExtended.order.signature = signature;

    // drop old order
    delete matcherState.orders[aliceOrderId];

    // add new order
    aliceOrderId = getOrderDigest({ order: orderExtended.order });
    matcherState.orders[aliceOrderId] = orderExtended;
    expect(actualNewAmount).to.be.greaterThan(0n);
    expect(actualNewAmount).to.be.lessThan(NEW_ORDER_AMOUNT);

    // ... execution of the new order
  });
});
