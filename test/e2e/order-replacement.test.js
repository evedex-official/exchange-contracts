const { restoreSuit, generateSuit } = require('../helpers/generate-suit');
const { BTC_USD_INDEX, USDT_COLLATERAL_INDEX, BUY_SIDE } = require('../helpers/constants');
const { createOrderExtended, signOrder, createSession } = require('../helpers/utils');
const { BTC_PRICE, ORDER_LEVERAGE, ORDER_AMOUNT } = require('./order-replacement.config');
const { maxUint256 } = require('viem');

const flow = 'order replacement';

describe(flow, () => {
  const matcherState = {
    orders: {},
  };
  let aliceOrderId = '';

  it('Alice create session', async () => {
    const { alice, sessions, usdtToken, btcToken, aliceSessionWallet } = await generateSuit(flow);
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
    await createSession({
      userWallet: alice,
      sessionManagerContract: sessions,
      sessionWallet: aliceSessionWallet,
      withdrawConfig,
    });
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
      price: BTC_PRICE,
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
    matcherState.orders[signature] = orderExtended;
    aliceOrderId = signature;
  });

  /**
   * Alice changes the amount, price and leverage of the order.
   *
   * Old order should be dropped and replaced with the new one in matcher state.
   * New params of the order should be signed again.
   * Likely, we got sessionWallet on the frontend side and we can
   * generate signature without opening metamask.
   *
   * Old order can be partially filled before replacement.
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
      amount: ORDER_AMOUNT + 1n,
      price: BTC_PRICE + 1n,
      leverage: ORDER_LEVERAGE + 1n,
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
    aliceOrderId = signature;
    matcherState.orders[aliceOrderId] = orderExtended;
  });
});
