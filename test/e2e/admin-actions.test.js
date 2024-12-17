'use strict';

const { upgrades } = require('hardhat');
const { generateSuit, restoreSuit } = require('../helpers/generate-suit');
const { writeContract, readContract } = require('viem/actions');
const {
  ETH_USD_INSTRUMENT,
  NEW_BTC_FR_LONG,
  NEW_BTC_FR_SHORT,
  USDT_DEPOSIT_AMOUNT,
  BTC_PRICE,
  ORDER_AMOUNT,
  USDT_PRICE,
  ORDER_LEVERAGE,
} = require('./admin-actions.config');
const { expect } = require('chai');
const { BTC_USD_INDEX, USDT_COLLATERAL_INDEX, BUY_SIDE, FR_PRECISION } = require('../helpers/constants');
const { createSession, createOrderExtended, signOrder } = require('../helpers/utils');

const flow = 'admin configuration actions';
describe(flow, () => {
  before(upgrades.silenceWarnings);

  let orderExecutionTimestamp;
  let newFrTimestamp;
  let aliceBuyOrderExt;
  let bobSellOrderExt;

  /**
   * Add new instrument to the exchange.
   * Only admin can add new instruments.
   */
  it('add instrument', async () => {
    const { owner, eveDex } = await generateSuit(flow);
    await writeContract(owner, {
      abi: eveDex.abi,
      address: eveDex.address,
      functionName: 'addInstrument',
      args: [
        ETH_USD_INSTRUMENT.SYMBOL,
        ETH_USD_INSTRUMENT.MAX_LEVERAGE,
        ETH_USD_INSTRUMENT.DAILY_FR_LONG,
        ETH_USD_INSTRUMENT.DAILY_FR_SHORT,
        Math.floor(Date.now() / 1000), //timestamp
      ],
    });
  });

  it('check new instrument', async () => {
    const { owner, eveDex } = await restoreSuit(flow);
    const { ticker, leverage } = await readContract(owner, {
      abi: eveDex.abi,
      address: eveDex.address,
      args: [ETH_USD_INSTRUMENT.INDEX],
      functionName: 'getInstrumentData',
    });
    expect(ticker).to.equal(ETH_USD_INSTRUMENT.SYMBOL);
    expect(leverage).to.equal(ETH_USD_INSTRUMENT.MAX_LEVERAGE);
  });

  /**
   * Lets modify the instrument: change leverage.
   * Only admin can modify instrument's properties.
   */
  it('change instrument leverage', async () => {
    const { owner, eveDex } = await restoreSuit(flow);
    await writeContract(owner, {
      abi: eveDex.abi,
      address: eveDex.address,
      functionName: 'changeInstrument',
      args: [
        ETH_USD_INSTRUMENT.INDEX,
        ETH_USD_INSTRUMENT.SYMBOL,
        ETH_USD_INSTRUMENT.MAX_LEVERAGE + 1n,
        ETH_USD_INSTRUMENT.DAILY_FR_LONG,
        ETH_USD_INSTRUMENT.DAILY_FR_SHORT,
        Math.floor(Date.now() / 1000) + 1, // timestamp
      ],
    });
  });

  it('check modified instrument', async () => {
    const { owner, eveDex } = await restoreSuit(flow);
    const { ticker, leverage } = await readContract(owner, {
      abi: eveDex.abi,
      address: eveDex.address,
      args: [ETH_USD_INSTRUMENT.INDEX],
      functionName: 'getInstrumentData',
    });
    expect(ticker).to.equal(ETH_USD_INSTRUMENT.SYMBOL);
    expect(leverage).to.equal(ETH_USD_INSTRUMENT.MAX_LEVERAGE + 1n);
  });

  /**
   * DANGEROUS ACTION!
   * Only admin can remove instruments.
   * Only last position can be removed.
   */
  it('remove instrument', async () => {
    const { owner, eveDex } = await restoreSuit(flow);
    await writeContract(owner, {
      abi: eveDex.abi,
      address: eveDex.address,
      functionName: 'deleteInstrument',
      args: [],
    });
  });

  it('check removed instrument', async () => {
    const { owner, eveDex } = await restoreSuit(flow);
    const { ticker } = await readContract(owner, {
      abi: eveDex.abi,
      address: eveDex.address,
      args: [ETH_USD_INSTRUMENT.INDEX],
      functionName: 'getInstrumentData',
    });
    expect(ticker).to.equal('');
  });

  it('Alice and Bob deposit usdt to dex', async () => {
    const { usdtToken, alice, bob, depositDex } = await restoreSuit(flow);
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

    const createOrder = async ({ userWallet, userSessionWallet, side }) => {
      const orderExt = createOrderExtended({
        collateralIndex: USDT_COLLATERAL_INDEX,
        senderAddress: userWallet.account.address,
        matcherAddress: matcher.account.address,
        collateral: usdtToken.address,
        instrumentIndex: BTC_USD_INDEX,
        side,
        amount: ORDER_AMOUNT,
        price: BTC_PRICE,
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
    const [aliceOrderExt, bobOrderExt] = await Promise.all([
      createOrder({ userWallet: alice, userSessionWallet: aliceSessionWallet, side: BUY_SIDE }),
      createOrder({ userWallet: bob, userSessionWallet: bobSessionWallet, side: BUY_SIDE }),
    ]);
    aliceBuyOrderExt = aliceOrderExt;
    bobSellOrderExt = bobOrderExt;
  });

  it('matcher execute orders', async () => {
    const { matcher, eveDex, usdtToken, btcToken } = await restoreSuit(flow);
    orderExecutionTimestamp = Math.floor(Date.now() / 1000) + 100;
    const fullPrices = {
      instrumentPrices: [
        {
          index: BTC_USD_INDEX,
          price: aliceBuyOrderExt.order.price,
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
    const historySearchHint = 0n; // element index in funding rate array. Hint from backend to reduce tx gas cost
    await writeContract(matcher, {
      functionName: 'fillOrders',
      address: eveDex.address,
      abi: eveDex.abi,
      args: [
        aliceBuyOrderExt,
        bobSellOrderExt,
        aliceBuyOrderExt.order.price,
        aliceBuyOrderExt.order.amount,
        fullPrices,
        orderExecutionTimestamp,
        historySearchHint,
      ],
    });
  });

  it('check accounts funding rate after order execution', async () => {
    const { alice, bob, eveDex } = await restoreSuit(flow);

    const aliceFr = await readContract(alice, {
      abi: eveDex.abi,
      address: eveDex.address,
      args: [alice.account.address, BTC_USD_INDEX, orderExecutionTimestamp, 0n],
      functionName: 'getAccountFR',
    });
    expect(aliceFr).to.equal(0n);

    const bobFr = await readContract(bob, {
      abi: eveDex.abi,
      address: eveDex.address,
      args: [alice.account.address, BTC_USD_INDEX, orderExecutionTimestamp, 0n],
      functionName: 'getAccountFR',
    });
    expect(bobFr).to.equal(0n);
  });

  it('it is time to update funding rate!', async () => {
    const { eveDex, matcher } = await restoreSuit(flow);
    newFrTimestamp = orderExecutionTimestamp + 1;
    await writeContract(matcher, {
      abi: eveDex.abi,
      address: eveDex.address,
      functionName: 'setFR',
      args: [BTC_USD_INDEX, NEW_BTC_FR_LONG, NEW_BTC_FR_SHORT, newFrTimestamp],
    });
  });

  it('check common funding rate for the instrument', async () => {
    const { eveDex, matcher } = await restoreSuit(flow);
    const frs = await readContract(matcher, {
      abi: eveDex.abi,
      address: eveDex.address,
      args: [
        BTC_USD_INDEX,
        0, // position to start search
        999, // position to end search
      ],
      functionName: 'getFundingRateData',
    });
    const { longFRStored, shortFRStored, lastFRUpdateTime } = frs.pop();
    expect(longFRStored).to.equal(NEW_BTC_FR_LONG);
    expect(shortFRStored).to.equal(NEW_BTC_FR_SHORT);
    expect(lastFRUpdateTime).to.equal(newFrTimestamp);
  });

  it('check funding rate after update', async () => {
    const { alice, bob, eveDex } = await restoreSuit(flow);
    const currentTimestamp = newFrTimestamp;

    const aliceFr = await readContract(alice, {
      abi: eveDex.abi,
      address: eveDex.address,
      args: [alice.account.address, BTC_USD_INDEX, currentTimestamp, 0n],
      functionName: 'getAccountFR',
    });

    const expectedAliceFr = (NEW_BTC_FR_LONG * ORDER_AMOUNT) / FR_PRECISION - 1n;
    expect(aliceFr).to.equal(expectedAliceFr);

    const bobFr = await readContract(bob, {
      abi: eveDex.abi,
      address: eveDex.address,
      args: [bob.account.address, BTC_USD_INDEX, currentTimestamp, 0n],
      functionName: 'getAccountFR',
    });
    const expectedBobFr = (NEW_BTC_FR_SHORT * ORDER_AMOUNT) / FR_PRECISION;
    expect(bobFr).to.equal(expectedBobFr);
  });
});
