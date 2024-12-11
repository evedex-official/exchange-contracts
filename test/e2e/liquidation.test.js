'use strict';

const { upgrades } = require('hardhat');
const { generateSuit, restoreSuit } = require('../helpers/generate-suit');
const { maxUint256 } = require('viem');
const {
  createSession,
  createOrderExtended,
  signOrder,
  calculateBoundaryOrderAmount,
  calculateMarginLevel,
  createMultiLiquidationOrder,
  signMultiLiquidationOrder,
} = require('../helpers/utils');
const { writeContract, readContract } = require('viem/actions');
const { BUY_SIDE, BTC_USD_INDEX, USDT_COLLATERAL_INDEX, SELL_SIDE } = require('../helpers/constants');
const {
  USDT_DEPOSIT_AMOUNT,
  ORDER_LEVERAGE,
  BTC_CURRENT_PRICE,
  USDT_CURRENT_PRICE,
  USDT_INITIAL_PRICE,
  BTC_INITIAL_PRICE,
  INITIAL_ORDER_SIZE_PERCENT,
} = require('./liquidation.config');

const flow = 'deposit -> create session -> buy/sell orders -> order liquidation';

/**
 * There are two positions: long and short. The long position is opened by Alice, the short position is opened by Bob.
 * One of the positions will be liquidated by the liquidator if the price of the instrument changes significantly.
 */
describe(flow, () => {
  before(upgrades.silenceWarnings);

  // simulate the heap of the matcher
  const matcherState = {
    longOrderExt: null,
    shortOrderExt: null,
    postOrder: (orderExt, side) => {
      if (side === BUY_SIDE) matcherState.longOrderExt = orderExt;
      if (side === SELL_SIDE) matcherState.shortOrderExt = orderExt;
    },
    matchOrders: () => {
      if (!matcherState.longOrderExt || !matcherState.shortOrderExt) throw 'no orders to match';
      return {
        longOrderExt: matcherState.longOrderExt,
        shortOrderExt: matcherState.shortOrderExt,
      };
    },
    getOrders: () => {
      const orders = [];
      if (matcherState.longOrderExt) orders.push(matcherState.longOrderExt);
      if (matcherState.shortOrderExt) orders.push(matcherState.shortOrderExt);
      return orders;
    },
    positionsToLiquidate: [],
  };

  it('Alice, Bob, Liquidator deposit usdt', async () => {
    const { usdtToken, alice, bob, liquidator, depositDex } = await generateSuit(flow);
    const deposit = async ({ user, amount = USDT_DEPOSIT_AMOUNT }) => {
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
      deposit({ user: liquidator, amount: USDT_DEPOSIT_AMOUNT * 100n }),
    ]);
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

  it('Alice and Bob create opposite orders', async () => {
    const { alice, bob, matcher, usdtToken, btcToken, aliceSessionWallet, bobSessionWallet, eveDex } =
      await restoreSuit(flow);
    // Set up prices for instruments and collateral
    const instrumentPrices = [
      {
        index: BTC_USD_INDEX,
        price: BTC_INITIAL_PRICE, // BTC price
      },
    ];
    const collateralPrices = [
      {
        collateral: usdtToken.address,
        price: USDT_INITIAL_PRICE, // USDT price
      },
      {
        collateral: btcToken.address,
        price: BTC_INITIAL_PRICE, // BTC price (if BTC is used as collateral)
      },
    ];

    const createOrder = async ({ side, userWallet, userSessionWallet }) => {
      const boundaryAmount = await calculateBoundaryOrderAmount({
        eveDexContract: eveDex,
        instrumentPrices,
        userWallet,
        leverage: ORDER_LEVERAGE,
        instrumentIndex: BTC_USD_INDEX,
        collateralPrices,
      });
      const amount = (boundaryAmount * INITIAL_ORDER_SIZE_PERCENT) / 100n;

      const orderExt = createOrderExtended({
        collateralIndex: USDT_COLLATERAL_INDEX,
        senderAddress: userWallet.account.address,
        matcherAddress: matcher.account.address,
        collateral: usdtToken.address,
        instrumentIndex: BTC_USD_INDEX,
        side,
        amount,
        price: BTC_INITIAL_PRICE,
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

    const [longOrderExt, shortOrderExt] = await Promise.all([
      createOrder({ side: BUY_SIDE, userWallet: alice, userSessionWallet: aliceSessionWallet }),
      createOrder({ side: SELL_SIDE, userWallet: bob, userSessionWallet: bobSessionWallet }),
    ]);
    matcherState.postOrder(longOrderExt, BUY_SIDE);
    matcherState.postOrder(shortOrderExt, SELL_SIDE);
  });

  it('matcher match orders', async () => {
    const { matcher, usdtToken, btcToken, eveDex } = await restoreSuit(flow);
    // matcher found buy and sell orders to match
    const { longOrderExt, shortOrderExt } = matcherState.matchOrders();

    // fullPrices is a structure with prices of all collaterals and instruments
    // instrumentPrices is a list of all futures prices available on dex
    // collateralPrices is a list of all collateral prices available on dex
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
    const historySearchHint = 0n; // element index in funding rate array. Hint from backend to reduce tx gas cost
    await writeContract(matcher, {
      functionName: 'fillOrders',
      address: eveDex.address,
      abi: eveDex.abi,
      args: [
        longOrderExt,
        shortOrderExt,
        BTC_INITIAL_PRICE,
        longOrderExt.order.amount,
        fullPrices,
        historyTimestamp,
        historySearchHint,
      ],
    });
  });

  it('Matcher finds positions to liquidate', async () => {
    const { eveDex, matcher, usdtToken, btcToken } = await restoreSuit(flow);

    const currentInstrumentPrices = [
      {
        index: BTC_USD_INDEX,
        price: BTC_CURRENT_PRICE,
      },
    ];
    const currentCollateralPrices = [
      {
        collateral: usdtToken.address,
        price: USDT_CURRENT_PRICE,
      },
      {
        collateral: btcToken.address,
        price: BTC_CURRENT_PRICE,
      },
    ];

    const contractSoLevel = await readContract(matcher, {
      functionName: 'soLevel',
      address: eveDex.address,
      abi: eveDex.abi,
      args: [],
    });
    const extOrders = matcherState.getOrders();
    for (const extOrder of extOrders) {
      const { marginLevel } = await calculateMarginLevel({
        eveDexContract: eveDex,
        userWallet: matcher,
        instrumentPrices: currentInstrumentPrices,
        collateralPrices: currentCollateralPrices,
        addressToCheck: extOrder.order.senderAddress,
      });
      if (marginLevel < contractSoLevel) {
        matcherState.positionsToLiquidate.push(extOrder);
      }
    }
  });

  it('Liquidator liquidates positions', async () => {
    const positionsToLiquidate = matcherState.positionsToLiquidate;
    if (positionsToLiquidate.length === 0) {
      console.warn('NOTHING TO LIQUIDATE!');
      return;
    }
    const { eveDex, matcher, liquidator, usdtToken, btcToken } = await restoreSuit(flow);

    const currentInstrumentPrices = [
      {
        index: BTC_USD_INDEX,
        price: BTC_CURRENT_PRICE,
      },
    ];
    const currentCollateralPrices = [
      {
        collateral: usdtToken.address,
        price: USDT_CURRENT_PRICE,
      },
      {
        collateral: btcToken.address,
        price: BTC_CURRENT_PRICE,
      },
    ];

    for (const positionToLiquidate of positionsToLiquidate) {
      const multiLiquidationOrder = createMultiLiquidationOrder({
        accountToLiquidate: positionToLiquidate.order.senderAddress,
        liquidator: liquidator.account.address,
        collateral: usdtToken.address,
        liquidationPrices: currentInstrumentPrices,
        prices: currentInstrumentPrices,
        leverage: ORDER_LEVERAGE,
      });
      multiLiquidationOrder.signature = await signMultiLiquidationOrder({
        wallet: liquidator,
        order: multiLiquidationOrder,
        contractAddress: eveDex.address,
      });
      await writeContract(matcher, {
        functionName: 'liquidatePositions',
        address: eveDex.address,
        abi: eveDex.abi,
        args: [
          multiLiquidationOrder,
          { collateralPrices: currentCollateralPrices, instrumentPrices: currentInstrumentPrices },
          USDT_COLLATERAL_INDEX,
          0n, // history timestamp
          0n, // history search hint
        ],
      });
      console.warn(`ACCOUNT LIQUIDATED: ${multiLiquidationOrder.accountToLiquidate}`);
      console.warn(`LIQUIDATOR: ${multiLiquidationOrder.liquidator}`);
      console.warn(`ORDER TYPE: ${positionToLiquidate.order.side === BUY_SIDE ? 'LONG' : 'SHORT'}`);
    }
  });
});
