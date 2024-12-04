'use strict';

const { generateSuit, restoreSuit } = require('../helpers/generate-suit');
const { upgrades } = require('hardhat');
const { expect } = require('chai');
const { createWithdrawOrder, signWithdrawOrder } = require('../helpers/utils');
const { zeroAddress } = require('viem');

const flow = 'deposit -> withdraw';

describe(flow, () => {
  before(upgrades.silenceWarnings);

  const depositAmount = 1n;
  const withdrawAmount = depositAmount;
  const pricePrecision = 100_000_000n;
  const usdtPrice = 1n;
  const btcPrice = 95_000n;

  it('deposit usdt', async () => {
    const { usdtToken, alice, depositDex } = await generateSuit(flow);
    await usdtToken.write.approve([depositDex.address, depositAmount], {
      account: alice.account,
    });
    await depositDex.write.depositCollateral([usdtToken.address, depositAmount], {
      account: alice.account,
    });
  });

  it('deposit btc', async () => {
    const { btcToken, alice, depositDex } = await restoreSuit(flow);
    await btcToken.write.approve([depositDex.address, depositAmount], {
      account: alice.account,
    });
    await depositDex.write.depositCollateral([btcToken.address, depositAmount], {
      account: alice.account,
    });
  });

  it('check collateral balance', async () => {
    const { depositDex, usdtToken, btcToken, alice } = await restoreSuit(flow);
    const collateralPriceData = [
      {
        collateral: usdtToken.address,
        price: usdtPrice * pricePrecision,
      },
      {
        collateral: btcToken.address,
        price: btcPrice * pricePrecision,
      },
    ];
    const totalBalance = await depositDex.read.getTotalBalance([alice.account.address, collateralPriceData]);
    const expectedBalance = depositAmount * usdtPrice + depositAmount * btcPrice;
    expect(expectedBalance).to.deep.equal(totalBalance);
  });

  it('usdt withdraw request', async () => {
    // Alice generate withdraw order and sends request to depositDex contract
    const { depositDex, usdtToken, alice, matcher, btcToken } = await restoreSuit(flow);
    const withdrawOrder = await createWithdrawOrder({
      accountAddress: alice.account.address,
      collateralAddress: usdtToken.address,
      depositDexAddress: depositDex.address,
      amount: withdrawAmount,
      session: zeroAddress,
      expiration: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    });
    const signature = await signWithdrawOrder({
      wallet: alice,
      contractAddress: depositDex.address,
      order: withdrawOrder,
    });
    withdrawOrder.signature = signature;
    await depositDex.write.withdrawRequest([withdrawOrder], {
      account: alice.account,
    });

    // After order is registered, matcher decides to complete or to cancel it.
    // In this case, matcher completes the order
    const fullPrices = {
      instrumentPrices: [
        {
          index: 0,
          price: usdtPrice * pricePrecision,
        },
      ],
      collateralPrices: [
        {
          collateral: usdtToken.address,
          price: usdtPrice * pricePrecision,
        },
        {
          collateral: btcToken.address,
          price: btcPrice * pricePrecision,
        },
      ],
    };
    const historyTimestamp = 0n;
    const historySearchHint = 0n;
    const aliceBalanceBefore = await usdtToken.read.balanceOf([alice.account.address]);
    await depositDex.write.withdrawComplete([withdrawOrder, fullPrices, historyTimestamp, historySearchHint], {
      account: matcher.account,
    });
    const aliceBalanceAfter = await usdtToken.read.balanceOf([alice.account.address]);
    // Check that balance is updated
    expect(aliceBalanceAfter).to.deep.equal(aliceBalanceBefore + withdrawAmount);
  });
});
