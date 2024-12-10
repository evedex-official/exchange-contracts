'use strict';

const { generateSuit, restoreSuit } = require('../helpers/generate-suit');
const { upgrades } = require('hardhat');
const { expect } = require('chai');
const { createWithdrawOrder, signWithdrawOrder, createSession } = require('../helpers/utils');
const { zeroAddress, maxUint256 } = require('viem');
const { writeContract, readContract } = require('viem/actions');
const { BTC_USD_INDEX, INT_PRECISION } = require('../helpers/constants');
const { DEPOSIT_AMOUNT, USDT_PRICE, BTC_PRICE, WITHDRAW_AMOUNT } = require('./deposit-withdraw.config');

/**
 * Basic flow of moving funds between user's account and depositDex contract
 */

const flow = 'deposit -> create session -> withdraw';
describe(flow, () => {
  before(upgrades.silenceWarnings);

  it('deposit usdt', async () => {
    const { usdtToken, alice, depositDex } = await generateSuit(flow);

    await writeContract(alice, {
      functionName: 'approve',
      address: usdtToken.address,
      abi: usdtToken.abi,
      args: [depositDex.address, DEPOSIT_AMOUNT],
    });

    // deposit usdt as collateral
    await writeContract(alice, {
      functionName: 'depositCollateral',
      address: depositDex.address,
      abi: depositDex.abi,
      args: [usdtToken.address, DEPOSIT_AMOUNT],
    });
  });

  it('deposit btc', async () => {
    const { btcToken, alice, depositDex } = await restoreSuit(flow);

    await writeContract(alice, {
      functionName: 'approve',
      address: btcToken.address,
      abi: btcToken.abi,
      args: [depositDex.address, DEPOSIT_AMOUNT],
    });

    // deposit btc as collateral
    await writeContract(alice, {
      functionName: 'depositCollateral',
      address: depositDex.address,
      abi: depositDex.abi,
      args: [btcToken.address, DEPOSIT_AMOUNT],
    });
  });

  it('check collateral balance', async () => {
    const { depositDex, usdtToken, btcToken, alice } = await restoreSuit(flow);

    const collateralPriceData = [
      {
        collateral: usdtToken.address,
        price: USDT_PRICE,
      },
      {
        collateral: btcToken.address,
        price: BTC_PRICE,
      },
    ];

    const totalBalance = await readContract(alice, {
      functionName: 'getTotalBalance',
      address: depositDex.address,
      abi: depositDex.abi,
      args: [alice.account.address, collateralPriceData],
    });

    const expectedBalance = DEPOSIT_AMOUNT * USDT_PRICE + DEPOSIT_AMOUNT * BTC_PRICE;
    expect(expectedBalance / INT_PRECISION).to.deep.equal(totalBalance);
  });

  it('create session', async () => {
    const { alice, sessions, usdtToken, btcToken, aliceSessionWallet } = await restoreSuit(flow);

    // withdrawConfig determine how much and what tokens session can withdraw
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

  // create withdraw order signed by user herself
  it('usdt withdraw request signed by user', async () => {
    // Alice generate withdraw order and sends request to depositDex contract
    const { depositDex, usdtToken, alice, matcher, btcToken } = await restoreSuit(flow);

    const withdrawOrder = createWithdrawOrder({
      accountAddress: alice.account.address,
      collateralAddress: usdtToken.address,
      depositDexAddress: depositDex.address,
      amount: WITHDRAW_AMOUNT,
      session: zeroAddress,
      expiration: Math.floor(Date.now() / 1000) + 3600,
    });

    const signature = await signWithdrawOrder({
      wallet: alice,
      contractAddress: depositDex.address,
      order: withdrawOrder,
    });

    withdrawOrder.signature = signature;

    await writeContract(alice, {
      functionName: 'withdrawRequest',
      address: depositDex.address,
      abi: depositDex.abi,
      args: [withdrawOrder],
    });

    // After order is registered, matcher decides to complete or to cancel it.
    // In this case, matcher completes the order

    // fullPrices is a structure with prices of all collaterals and instruments
    // instrumentPrices is a list of all futures prices available on dex
    // collateralPrices is a list of all collateral prices available on dex
    const fullPrices = {
      instrumentPrices: [
        {
          index: BTC_USD_INDEX,
          price: BTC_PRICE,
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

    const historyTimestamp = Math.trunc(Date.now() / 1000);
    const historySearchHint = 0n; // element index in funding rate array. Hint from backend to reduce tx gas cost

    const aliceBalanceBefore = await readContract(alice, {
      functionName: 'balanceOf',
      address: usdtToken.address,
      abi: usdtToken.abi,
      args: [alice.account.address],
    });

    await writeContract(matcher, {
      functionName: 'withdrawComplete',
      address: depositDex.address,
      abi: depositDex.abi,
      args: [withdrawOrder, fullPrices, historyTimestamp, historySearchHint],
    });

    const aliceBalanceAfter = await readContract(alice, {
      functionName: 'balanceOf',
      address: usdtToken.address,
      abi: usdtToken.abi,
      args: [alice.account.address],
    });

    expect(aliceBalanceAfter).to.deep.equal(aliceBalanceBefore + WITHDRAW_AMOUNT);
  });

  // create withdraw order signed by session
  it('btc withdraw request signed by session', async () => {
    // Alice generate withdraw order and sends request to depositDex contract
    const { depositDex, usdtToken, alice, matcher, btcToken, aliceSessionWallet } = await restoreSuit(flow);
    const withdrawOrder = createWithdrawOrder({
      accountAddress: alice.account.address,
      collateralAddress: btcToken.address,
      depositDexAddress: depositDex.address,
      amount: WITHDRAW_AMOUNT,
      session: aliceSessionWallet.account.address,
      expiration: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    });

    const signature = await signWithdrawOrder({
      wallet: aliceSessionWallet,
      contractAddress: depositDex.address,
      order: withdrawOrder,
    });

    withdrawOrder.signature = signature;

    await writeContract(alice, {
      functionName: 'withdrawRequest',
      address: depositDex.address,
      abi: depositDex.abi,
      args: [withdrawOrder],
    });

    // After order is registered, matcher decides to complete or to cancel it.
    // In this case, matcher completes the order

    // fullPrices is a structure with prices of all collaterals and instruments
    // instrumentPrices is a list of all futures prices available on dex
    // collateralPrices is a list of all collateral prices available on dex
    const fullPrices = {
      instrumentPrices: [
        {
          index: BTC_USD_INDEX,
          price: BTC_PRICE,
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

    const historyTimestamp = Math.trunc(Date.now() / 1000);
    const historySearchHint = 0n; // element index in funding rate array. Hint from backend to reduce tx gas cost

    const aliceBalanceBefore = await readContract(alice, {
      functionName: 'balanceOf',
      address: btcToken.address,
      abi: btcToken.abi,
      args: [alice.account.address],
    });

    await writeContract(matcher, {
      functionName: 'withdrawComplete',
      address: depositDex.address,
      abi: depositDex.abi,
      args: [withdrawOrder, fullPrices, historyTimestamp, historySearchHint],
    });

    const aliceBalanceAfter = await readContract(alice, {
      functionName: 'balanceOf',
      address: btcToken.address,
      abi: btcToken.abi,
      args: [alice.account.address],
    });

    expect(aliceBalanceAfter).to.deep.equal(aliceBalanceBefore + WITHDRAW_AMOUNT);
  });
});
