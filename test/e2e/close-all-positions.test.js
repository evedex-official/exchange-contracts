'use strict';

const { upgrades } = require('hardhat');
const {
  BUY_SIDE,
  SELL_SIDE,
  USDT_COLLATERAL_INDEX,
  MARGIN_CALC_MARGIN_PRECISION,
  USDT_DECIMALS,
  USD_DECIMALS,
  BTC_DECIMALS,
} = require('../helpers/constants');
const { generateSuit, restoreSuit } = require('../helpers/generate-suit');
const { writeContract, readContract } = require('viem/actions');
const { createSession, createOrderExtended, signOrder, toMultiOrders, parsePrice } = require('../helpers/utils');
const { list } = require('./close-all-positions.config');
const { PRECISION_DECIMALS_EVEDEX, PRECISION_DECIMALS_DEPOSIT_DEX } = require('../helpers/constants');
const { maxUint112 } = require('viem');

const USDT_DEPOSIT_AMOUNT = 10000n * 10n ** 6n;

const getSide = (side) => (side === 'BUY' ? BUY_SIDE : SELL_SIDE);

const activePositions = list.filter((position) => position.quantity > 0);
const instrumentSymbols = [...new Set(activePositions.map((position) => position.instrument))];

// Store created orders for later reference
const initialOrders = [];
const instrumentIndices = {};
let multiOrder = [];

const flow = 'deposit -> create positions -> close all positions';
/**
 *
 * MAIN FLOW
 *
 */
describe(flow, () => {
  before(upgrades.silenceWarnings);

  it('Setup test environment with instruments from config', async () => {
    await setupTestEnvironment();
  });

  it('Verify positions are created according to config', async () => {
    const { eveDex, alice } = await restoreSuit(flow);
    // Verify each position was created correctly
    const [posIndexes, positions] = await readContract(alice, {
      functionName: 'getActiveInstrumentsPositions',
      args: [alice.account.address],
      abi: eveDex.abi,
      address: eveDex.address,
    });
    for (let i = 0; i < posIndexes.length; i++) {
      const index = posIndexes[i];
      const position = positions[i];
      const instrument = instrumentSymbols[index];
      if (position.position === 0n) {
        throw new Error(`Position for ${instrument} (index ${index}) was not created`);
      }
    }
  });

  it('Create multi-order', async () => {
    const { eveDex, alice, matcher, aliceSessionWallet } = await restoreSuit(flow);
    // Create a list of orders to close all Alice's positions
    const closeOrdersExt = [];
    for (const { aliceOrder, instrumentIndex, price, amount } of initialOrders) {
      // Create an order with the opposite side to close the position
      const closeOrderExt = createOrderExtended({
        collateralIndex: USDT_COLLATERAL_INDEX,
        senderAddress: alice.account.address,
        matcherAddress: matcher.account.address,
        instrumentIndex,
        side: aliceOrder.order.side === BUY_SIDE ? SELL_SIDE : BUY_SIDE, // Opposite of original order
        amount,
        price, // Use same price for simplicity
        leverage: aliceOrder.order.leverage, // Use same leverage
        userSession: aliceSessionWallet.account.address,
      });
      closeOrdersExt.push(closeOrderExt);
    }
    // Convert to multi-order
    multiOrder = await toMultiOrders({
      ordersExt: closeOrdersExt,
      wallet: aliceSessionWallet,
      contractAddress: eveDex.address,
    });
  });

  it('Execute multi-order to close all positions', async () => {
    const { eveDex, bob, matcher, usdtToken, btcToken, bobSessionWallet } = await restoreSuit(flow);

    // Create counter-orders from Bob to match Alice's close multi-order
    const closingPairs = [];
    for (const orderExt of multiOrder) {
      const order = orderExt.order;
      // Extract necessary information from multi-order
      const instrumentIndex = order.instrumentIndex;
      const instrument = Object.keys(instrumentIndices).find((key) => instrumentIndices[key] === instrumentIndex);

      // Find the original order that matches this instrument to get price and amount
      const originalOrder = initialOrders.find((o) => o.instrumentIndex === instrumentIndex);
      const { price, amount } = originalOrder;

      // Create Bob's matching order (opposite side to Alice's closing order)
      const bobCloseOrderExt = createOrderExtended({
        collateralIndex: USDT_COLLATERAL_INDEX,
        senderAddress: bob.account.address,
        matcherAddress: matcher.account.address,
        instrumentIndex,
        side: order.side === BUY_SIDE ? SELL_SIDE : BUY_SIDE,
        amount,
        price,
        leverage: order.leverage,
        userSession: bobSessionWallet.account.address,
      });

      bobCloseOrderExt.order.signature = await signOrder({
        wallet: bobSessionWallet,
        order: bobCloseOrderExt.order,
        contractAddress: eveDex.address,
      });

      closingPairs.push({
        aliceCloseOrder: orderExt,
        bobCloseOrder: bobCloseOrderExt,
        instrumentIndex,
        price,
        amount,
        instrument,
      });
    }

    const instrumentPrices = instrumentSymbols.map((symbol) => {
      const index = instrumentIndices[symbol];
      const positionForInstrument = activePositions.find((p) => p.instrument === symbol);
      return {
        index,
        price: parsePrice(positionForInstrument.avgPrice, {
          precisionDecimals: PRECISION_DECIMALS_EVEDEX,
        }),
      };
    });
    const USDT_COLLATERAL_PRICE = parsePrice(1.0, {
      tokenInDecimals: USDT_DECIMALS,
      tokenOutDecimals: USD_DECIMALS,
      precisionDecimals: PRECISION_DECIMALS_DEPOSIT_DEX,
    });
    const BTC_COLLATERAL_PRICE = parsePrice(100_000, {
      tokenInDecimals: BTC_DECIMALS,
      tokenOutDecimals: USD_DECIMALS,
      precisionDecimals: PRECISION_DECIMALS_DEPOSIT_DEX,
    });
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

    for (const { aliceCloseOrder, bobCloseOrder, price, amount, instrument } of closingPairs) {
      const historyTimestamp = Math.trunc(Date.now() / 1000);
      const historySearchHint = 0n;
      // Order the args based on the buy/sell sides
      const orders =
        aliceCloseOrder.order.side === BUY_SIDE ? [aliceCloseOrder, bobCloseOrder] : [bobCloseOrder, aliceCloseOrder];
      await writeContract(matcher, {
        functionName: 'fillOrders',
        address: eveDex.address,
        abi: eveDex.abi,
        args: [...orders, price, amount, fullPrices, historyTimestamp, historySearchHint],
      });
    }
  });

  it('Verify positions are closed', async () => {
    const { eveDex, alice } = await restoreSuit(flow);
    // Verify each position was created correctly
    const [posIndexes] = await readContract(alice, {
      functionName: 'getActiveInstrumentsPositions',
      args: [alice.account.address],
      abi: eveDex.abi,
      address: eveDex.address,
    });
    if (posIndexes.length > 0) {
      throw new Error(`Positions were not closed correctly. Remaining positions: ${posIndexes}`);
    }
  });
});

/**
 *
 * SETUP TEST ENVIRONMENT
 *
 */
async function setupTestEnvironment() {
  // Create instrument configs based on unique instruments in the config
  const instrumentConfigs = instrumentSymbols.map((symbol) => ({
    symbol,
    leverage: 100, // Max allowed leverage
    dailyFRLong: 0, // No funding rates for the test
    dailyFRShort: 0,
  }));
  // Create margin calculation levels for each instrument
  const initLevels = instrumentSymbols.map(() => [
    {
      accumulatedMarginLowerLevels: 0n,
      positionVolumeLowerBound: 0n,
      marginCoefficient: BigInt(1 * MARGIN_CALC_MARGIN_PRECISION),
    },
  ]);
  // Configure margin calculation
  const initMarginCalcConfig = {
    maxMargin: maxUint112,
    minMargin: 0n,
    initLevels,
  };
  // Generate custom test environment with our instruments
  const {
    usdtToken,
    btcToken,
    alice,
    bob,
    depositDex,
    sessions,
    aliceSessionWallet,
    bobSessionWallet,
    eveDex,
    matcher,
  } = await generateSuit(flow, {
    initInstrumentConfigs: instrumentConfigs,
    initMarginCalcConfig,
  });

  // Setup deposits for Alice and Bob
  const deposit = async (user) => {
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

  // Setup sessions for Alice and Bob
  const createUserSession = async (userWallet, sessionWallet) => {
    await createSession({
      userWallet,
      sessionManagerContract: sessions,
      sessionWallet,
      withdrawConfig: [],
    });
  };

  // Execute deposits and session creation
  await Promise.all([
    deposit(alice),
    deposit(bob),
    createUserSession(alice, aliceSessionWallet),
    createUserSession(bob, bobSessionWallet),
  ]);

  // Map each instrument symbol to its index in the contract
  let idx = 0;
  for (const symbol of instrumentSymbols) {
    instrumentIndices[symbol] = idx++;
    console.log(`Mapped instrument ${symbol} to index ${instrumentIndices[symbol]}`);
  }

  // Generate orders for each active position in the config
  for (const position of activePositions) {
    const instrumentIndex = instrumentIndices[position.instrument];
    const price = parsePrice(position.avgPrice, {
      precisionDecimals: PRECISION_DECIMALS_EVEDEX,
    });
    const amount = BigInt(Math.round(position.quantity * Number(PRECISION_DECIMALS_EVEDEX)));
    const leverage = BigInt(position.leverage);

    // Create Alice's order based on config
    const aliceOrderExt = createOrderExtended({
      collateralIndex: USDT_COLLATERAL_INDEX,
      senderAddress: alice.account.address,
      matcherAddress: matcher.account.address,
      instrumentIndex,
      side: getSide(position.side),
      amount,
      price,
      leverage,
      userSession: aliceSessionWallet.account.address,
    });

    aliceOrderExt.order.signature = await signOrder({
      wallet: aliceSessionWallet,
      order: aliceOrderExt.order,
      contractAddress: eveDex.address,
    });

    // Create Bob's order (opposite to Alice's)
    const bobOrderExt = createOrderExtended({
      collateralIndex: USDT_COLLATERAL_INDEX,
      senderAddress: bob.account.address,
      matcherAddress: matcher.account.address,
      instrumentIndex,
      side: getSide(position.side) === BUY_SIDE ? SELL_SIDE : BUY_SIDE,
      amount,
      price,
      leverage,
      userSession: bobSessionWallet.account.address,
    });

    bobOrderExt.order.signature = await signOrder({
      wallet: bobSessionWallet,
      order: bobOrderExt.order,
      contractAddress: eveDex.address,
    });

    // Store orders for later use
    initialOrders.push({
      aliceOrder: aliceOrderExt,
      bobOrder: bobOrderExt,
      instrumentIndex,
      price,
      amount,
      instrument: position.instrument,
    });

    console.log(`Created orders for ${position.instrument} (${position.side}) with quantity ${position.quantity}`);
  }

  const instrumentPrices = instrumentSymbols.map((symbol) => {
    const index = instrumentIndices[symbol];
    const positionForInstrument = activePositions.find((p) => p.instrument === symbol);
    return {
      index,
      price: parsePrice(positionForInstrument.avgPrice, {
        precisionDecimals: PRECISION_DECIMALS_EVEDEX,
      }),
    };
  });
  const USDT_COLLATERAL_PRICE = parsePrice(1.0, {
    tokenInDecimals: USDT_DECIMALS,
    tokenOutDecimals: USD_DECIMALS,
    precisionDecimals: PRECISION_DECIMALS_DEPOSIT_DEX,
  });
  const BTC_COLLATERAL_PRICE = parsePrice(100_000, {
    tokenInDecimals: BTC_DECIMALS,
    tokenOutDecimals: USD_DECIMALS,
    precisionDecimals: PRECISION_DECIMALS_DEPOSIT_DEX,
  });
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

  for (const { aliceOrder, bobOrder, price, amount, instrument } of initialOrders) {
    const historyTimestamp = Math.trunc(Date.now() / 1000);
    const historySearchHint = 0n;
    const orders = aliceOrder.order.side === BUY_SIDE ? [aliceOrder, bobOrder] : [bobOrder, aliceOrder];

    await writeContract(matcher, {
      functionName: 'fillOrders',
      address: eveDex.address,
      abi: eveDex.abi,
      args: [...orders, price, amount, fullPrices, historyTimestamp, historySearchHint],
    });

    console.log(`Created position for ${instrument} with amount ${amount}`);
  }
}
