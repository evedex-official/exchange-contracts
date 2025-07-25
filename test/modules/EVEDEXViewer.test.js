'use strict';

const { upgrades } = require('hardhat');
const { generateSuit } = require('../helpers/generate-suit');
const { createOrderExtended, signOrder, calculateBoundaryOrderAmount } = require('../helpers/utils');
const {
  BTC_USD_SYMBOL,
  BUY_SIDE,
  BTC_USD_INDEX,
  USDT_COLLATERAL_INDEX,
  SELL_SIDE,
  PRECISION_DECIMALS_EVEDEX,
} = require('../helpers/constants');
const {
  USDT_DEPOSIT_AMOUNT,
  ORDER_LEVERAGE,
  BTC_INSTRUMENT_PRICE,
  USDT_COLLATERAL_PRICE,
  BTC_COLLATERAL_PRICE,
} = require('../e2e/order-buy-sell.config');
const { expect } = require('chai');
const { writeContract } = require('viem/actions');
const { keccak256, zeroAddress } = require('viem');

const description = 'MarkPriceOracle tests';
describe(description, () => {
  before(upgrades.silenceWarnings);

  it('should deploy', async () => {
    const { dexViewer } = await generateSuit(description);

    const instrumentLength = await dexViewer.read.instrumentsLength();
    expect(instrumentLength).to.equal(1n);
  });

  it('should read config addresses', async () => {
    const {
      eveDex,
      depositDex,
      sessions,
      marginCalculator,
      markPriceOracle,
      staticFundingRateAccount,
      fundingRateAccount,
      dexViewer,
    } = await generateSuit(description);

    let conf = await dexViewer.read.evedex();
    expect(conf).to.equal(eveDex.address);
    conf = await dexViewer.read.depositDex();
    expect(conf).to.equal(depositDex.address);
    conf = await dexViewer.read.marginCalculator();
    expect(conf).to.equal(marginCalculator.address);
    conf = await dexViewer.read.sessionManager();
    expect(conf).to.equal(sessions.address);
    conf = await dexViewer.read.markPriceOracle();
    expect(conf).to.equal(markPriceOracle.address);
    conf = await dexViewer.read.staticFundingRateAccount();
    expect(conf.toLowerCase()).to.equal(await staticFundingRateAccount.account.address);
    conf = await dexViewer.read.fundingRateAccount();
    expect(conf.toLowerCase()).to.equal(fundingRateAccount.account.address);
  });

  it('should read config numbers', async () => {
    const { dexViewer } = await generateSuit(description);

    let conf = await dexViewer.read.soLevel();
    expect(conf).to.equal(80n);
    conf = await dexViewer.read.withdrawMarginLevel();
    expect(conf).to.equal(100n);
    conf = await dexViewer.read.liquidationFeePercent();
    expect(conf).to.equal(0n);
    conf = await dexViewer.read.allowedOverloadTPSL();
    expect(conf).to.equal(100000000n);
    conf = await dexViewer.read.maxOpenPositions();
    expect(conf).to.equal(128n);
    conf = await dexViewer.read.totalOpenedOrders();
    expect(conf).to.equal(0n);
    conf = await dexViewer.read.totalSettledOrders();
    expect(conf).to.equal(0n);
    conf = await dexViewer.read.maxMatcherFee();
    expect(conf).to.equal((5n * PRECISION_DECIMALS_EVEDEX) / 100n);
    // conf = await dexViewer.read.liquidationDenominator();
    // expect(conf.buyFee).to.equal(100000000n);
    // expect(conf.sellFee).to.equal(100000000n);
  });

  it('should read config bytes32', async () => {
    const { dexViewer } = await generateSuit(description);

    const role = await dexViewer.read.MATCHER_ROLE();
    expect(role).to.equal(keccak256('MATCHER_ROLE'));
  });

  it('should read instrument data', async () => {
    const { eveDex, dexViewer } = await generateSuit(description);

    const instrumentData = await dexViewer.read.getInstrumentData([0n]);
    expect(instrumentData.leverage).to.equal(100n);
    expect(instrumentData.ticker.replaceAll('\x00', '')).to.equal(BTC_USD_SYMBOL);

    await eveDex.write.changeInstrument([1, 'PEPE/USD', 9n, 0, 0, 0, Math.floor(Date.now() / 1000) - 100]);
    const instrumentData2 = await dexViewer.read.getInstrumentData([1n]);

    expect(instrumentData2.leverage).to.equal(9n);
    expect(instrumentData2.ticker.replaceAll('\x00', '')).to.equal('PEPE/USD');

    const instrumentLength = await dexViewer.read.instrumentsLength();
    expect(instrumentLength).to.equal(2n);
  });

  it('should read positions data', async () => {
    const { alice, bob, matcher, eveDex, usdtToken, btcToken, depositDex, orderLib, dexViewer } =
      await generateSuit(description);
    let sellOrderExtended, amount;
    // Prepare and fill order
    {
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

      const instrumentPrices = [
        {
          index: BTC_USD_INDEX,
          price: BTC_INSTRUMENT_PRICE, // BTC price
        },
      ];
      const collateralPrices = [
        {
          collateral: usdtToken.address,
          price: USDT_COLLATERAL_PRICE, // USDT price
        },
        {
          collateral: btcToken.address,
          price: BTC_COLLATERAL_PRICE, // BTC price (if BTC is used as collateral)
        },
      ];
      const buyOrderAmount = await calculateBoundaryOrderAmount({
        eveDexContract: eveDex,
        viewerContract: dexViewer,
        instrumentPrices,
        userWallet: alice,
        leverage: ORDER_LEVERAGE,
        instrumentIndex: BTC_USD_INDEX,
        collateralPrices,
      });

      const buyOrderExtended = createOrderExtended({
        orderId: 1n,
        collateralIndex: USDT_COLLATERAL_INDEX,
        senderAddress: alice.account.address,
        matcherAddress: matcher.account.address,
        collateral: usdtToken.address,
        instrumentIndex: BTC_USD_INDEX,
        side: BUY_SIDE,
        amount: buyOrderAmount,
        price: BTC_INSTRUMENT_PRICE,
        leverage: ORDER_LEVERAGE,
        userSession: zeroAddress,
      });

      const signatureA = await signOrder({
        wallet: alice,
        order: buyOrderExtended.order,
        contractAddress: eveDex.address,
      });

      buyOrderExtended.order.signature = signatureA;
      matcherState.buyOrder = buyOrderExtended;

      const sellOrderAmount = await calculateBoundaryOrderAmount({
        eveDexContract: eveDex,
        viewerContract: dexViewer,
        instrumentPrices,
        userWallet: bob,
        leverage: ORDER_LEVERAGE,
        instrumentIndex: BTC_USD_INDEX,
        collateralPrices,
      });

      sellOrderExtended = createOrderExtended({
        orderId: 2n,
        collateralIndex: USDT_COLLATERAL_INDEX,
        senderAddress: bob.account.address,
        matcherAddress: matcher.account.address,
        collateral: usdtToken.address,
        instrumentIndex: BTC_USD_INDEX,
        side: SELL_SIDE,
        amount: sellOrderAmount,
        price: BTC_INSTRUMENT_PRICE,
        leverage: ORDER_LEVERAGE,
        userSession: zeroAddress,
      });

      const signatureB = await signOrder({
        wallet: bob,
        order: sellOrderExtended.order,
        contractAddress: eveDex.address,
      });

      sellOrderExtended.order.signature = signatureB;
      matcherState.sellOrder = sellOrderExtended;
      const fullPrices = {
        instrumentPrices: [
          {
            index: BTC_USD_INDEX,
            price: BTC_INSTRUMENT_PRICE,
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
      const { buyOrder, sellOrder } = matcherState.matchOrders();
      const historyTimestamp = Math.trunc(Date.now() / 1000);
      const historySearchHint = 0n; // element index in funding rate array. Hint from backend to reduce tx gas cost
      await writeContract(matcher, {
        functionName: 'fillOrder',
        address: eveDex.address,
        abi: eveDex.abi,
        args: [
          buyOrder,
          sellOrder,
          BTC_INSTRUMENT_PRICE,
          buyOrder.order.amount,
          0n,
          fullPrices,
          historyTimestamp,
          historySearchHint,
        ],
      });
      await writeContract(matcher, {
        functionName: 'fillOrder',
        address: eveDex.address,
        abi: eveDex.abi,
        args: [
          sellOrder,
          buyOrder,
          BTC_INSTRUMENT_PRICE,
          buyOrder.order.amount,
          0n,
          fullPrices,
          historyTimestamp,
          historySearchHint,
        ],
      });
      amount = buyOrder.order.amount;
    }

    let conf = await dexViewer.read.totalOpenedOrders();
    expect(conf).to.equal(1n);
    conf = await dexViewer.read.totalSettledOrders();
    expect(conf).to.equal(1n);
    // conf = await dexViewer.read.liquidationStatuses([alice.account.address]);
    // expect(conf).to.equal(0n);
    conf = await dexViewer.read.filledAmounts([sellOrderExtended.order.orderId, sellOrderExtended.order.senderAddress]);
    expect(conf).to.equal(amount);
    conf = await dexViewer.read.getAccountsWithOpenPositionLength();
    expect(conf).to.equal(2n);
    conf = await dexViewer.read.getAccountWithOpenPositionsAt([0]);
    expect(conf.toLowerCase()).to.equal(alice.account.address);
    conf = await dexViewer.read.getAccountWithOpenPositionsAt([1]);
    expect(conf.toLowerCase()).to.equal(bob.account.address);
    conf = await dexViewer.read.settledOrders([alice.account.address]);
    expect(conf).to.equal(1n);
    conf = await dexViewer.read.getActiveInstrumentsIndices([alice.account.address]);
    expect(conf.length).to.equal(1n);
    expect(conf[0]).to.equal(0n);
    const posA = await dexViewer.read.getPositionInfo([0n, alice.account.address]);
    const posB = await dexViewer.read.getPositionInfo([0n, bob.account.address]);
    expect(posA.positionLastUpdate).to.be.greaterThan(0n);
    expect(posA.positionLastUpdate).to.equal(posB.positionLastUpdate);
    expect(posA.position).to.be.greaterThan(0n);
    expect(posA.position).to.equal(-posB.position);
    conf = await dexViewer.read.getActiveInstrumentsPositions([alice.account.address]);
    expect(conf[0].length).to.equal(1n);
    expect(conf[0].length).to.equal(conf[1].length);
    expect(conf[0][0]).to.equal(0n);
    expect(conf[1][0].positionLastUpdate).to.equal(posA.positionLastUpdate);
    expect(conf[1][0].frAccumulated).to.equal(posA.frAccumulated);
    expect(conf[1][0].position).to.equal(posA.position);
    expect(conf[1][0].leverage).to.equal(posA.leverage);
    expect(conf[1][0].positionShortFRStored).to.equal(posA.positionShortFRStored);
    expect(conf[1][0].positionLongFRStored).to.equal(posA.positionLongFRStored);
    expect(conf[1][0].positionAvgPrice).to.equal(posA.positionAvgPrice);
  });
});
