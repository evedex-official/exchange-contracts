'use strict';

const { upgrades } = require('hardhat');
const { expect } = require('chai');
const { BUY_SIDE, USDT_COLLATERAL_INDEX, USDT_DECIMALS } = require('../helpers/constants');
const { generateSuit, restoreSuit } = require('../helpers/generate-suit');
const { writeContract, readContract } = require('viem/actions');
const { createSession, createOrderExtended, signOrder, absBn } = require('../helpers/utils');
const { ALICE_ORDER_CONFIG, USDT_PRICE, BOB_ORDER_CONFIG, BTC_PRICE } = require('./part-order-execution.config');

const flow = 'deposit -> create sessions -> create orders -> part orders execution -> check open positions';
describe(flow, () => {
  before(upgrades.silenceWarnings);

  // simulate the heap of the matcher
  const matcherState = {
    aliceOrderExt: null,
    bobOrderExt: null,
    matchOrders: () => {
      if (!matcherState.aliceOrderExt || !matcherState.bobOrderExt) throw 'no orders to match';
      return {
        aliceOrderExt: matcherState.aliceOrderExt,
        bobOrderExt: matcherState.bobOrderExt,
      };
    },
  };

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

    const aliceBtcPrice = ALICE_ORDER_CONFIG.instrumentPrice.price;
    const aliceBtcUsdt = (aliceBtcPrice * 10n ** USDT_DECIMALS) / USDT_PRICE;
    const aliceAmount = ALICE_ORDER_CONFIG.amount * aliceBtcUsdt;

    const bobBtcPrice = BOB_ORDER_CONFIG.instrumentPrice.price;
    const bobBtcUsdt = (bobBtcPrice * 10n ** USDT_DECIMALS) / USDT_PRICE;
    const bobAmount = BOB_ORDER_CONFIG.amount * bobBtcUsdt;

    await Promise.all([deposit({ user: alice, amount: aliceAmount }), deposit({ user: bob, amount: bobAmount })]);
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

  it('Alice and Bob create orders', async () => {
    const { alice, bob, matcher, usdtToken, aliceSessionWallet, bobSessionWallet, eveDex } = await restoreSuit(flow);

    const createOrder = async ({ userWallet, userSessionWallet, orderConfig }) => {
      const orderExt = createOrderExtended({
        collateralIndex: USDT_COLLATERAL_INDEX,
        senderAddress: userWallet.account.address,
        matcherAddress: matcher.account.address,
        collateral: usdtToken.address,
        instrumentIndex: orderConfig.instrumentPrice.index,
        side: orderConfig.side,
        amount: orderConfig.amount,
        price: orderConfig.instrumentPrice.price,
        leverage: orderConfig.leverage,
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

    const [aliceOrderExt, bobOrderExt] = await Promise.all([
      createOrder({ userWallet: alice, userSessionWallet: aliceSessionWallet, orderConfig: ALICE_ORDER_CONFIG }),
      createOrder({ userWallet: bob, userSessionWallet: bobSessionWallet, orderConfig: BOB_ORDER_CONFIG }),
    ]);
    matcherState.aliceOrderExt = aliceOrderExt;
    matcherState.bobOrderExt = bobOrderExt;
  });

  /**
   * price is fetched from LONG order
   * amount of the order is Math.min(aliceOrder.amount, bobOrder.amount)
   */
  it('matcher match orders', async () => {
    const { matcher, usdtToken, eveDex, btcToken } = await restoreSuit(flow);
    const { aliceOrderExt, bobOrderExt } = matcherState.matchOrders();
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
          price: USDT_PRICE,
        },
        {
          collateral: btcToken.address,
          price: BTC_PRICE,
        },
      ],
    };
    const fillAmount =
      aliceOrderExt.order.amount < bobOrderExt.order.amount ? aliceOrderExt.order.amount : bobOrderExt.order.amount;
    const historyTimestamp = Math.trunc(Date.now() / 1000);
    const historySearchHint = 0n; // element index in funding rate array. Hint from backend to reduce tx gas cost
    await writeContract(matcher, {
      functionName: 'fillOrders',
      address: eveDex.address,
      abi: eveDex.abi,
      args: [longOrder, shortOrder, instrumentPrice, fillAmount, fullPrices, historyTimestamp, historySearchHint],
    });
  });

  it('check open positions', async () => {
    const { alice, bob, eveDex } = await restoreSuit(flow);
    const aliceOrderExt = matcherState.aliceOrderExt;
    const bobOrderExt = matcherState.bobOrderExt;
    const positionsAmount =
      aliceOrderExt.order.amount < bobOrderExt.order.amount ? aliceOrderExt.order.amount : bobOrderExt.order.amount;

    const getPosition = async ({ userWallet }) => {
      const answer = await readContract(userWallet, {
        functionName: 'getActiveInstrumentsPositions',
        args: [userWallet.account.address],
        abi: eveDex.abi,
        address: eveDex.address,
      });
      return answer[1].shift();
    };

    const alicePosition = await getPosition({ userWallet: alice });
    const bobPosition = await getPosition({ userWallet: bob });
    expect(absBn(alicePosition.position)).to.deep.equal(positionsAmount);
    expect(absBn(bobPosition.position)).to.deep.equal(positionsAmount);
  });
});
