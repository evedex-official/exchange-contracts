'use strict';

const { viemDeployWithLibraries, viemDeployProxyWithLibraries } = require('./viemify');
const { viem } = require('hardhat');
const { zeroHash, maxUint112 } = require('viem');
const { BTC_USD_SYMBOL } = require('./constants');

const suits = {};

const prepareWallets = async () => {
  const [owner, alice, bob, liquidator, fundingRateAccount, matcher, aliceSessionWallet, bobSessionWallet] =
    await viem.getWalletClients();
  return { owner, alice, bob, liquidator, fundingRateAccount, matcher, aliceSessionWallet, bobSessionWallet };
};

const prepareTokens = async (wallets) => {
  const [usdtToken, btcToken] = await Promise.all([viem.deployContract('ERC20Mock'), viem.deployContract('ERC20Mock')]);
  await Promise.all(wallets.map((user) => usdtToken.write.mint([user.account.address, maxUint112])));
  await Promise.all(wallets.map((wallet) => btcToken.write.mint([wallet.account.address, maxUint112])));
  return { usdtToken, btcToken };
};

const prepareContracts = async ({ owner, matcher, usdtToken, btcToken, fundingRateAccount }) => {
  const [orderLib, sessions, vault] = await Promise.all([
    viemDeployWithLibraries('OrderValidationLib', []),
    viemDeployWithLibraries('SessionManager', [owner.account.address]),
    viemDeployWithLibraries('EveVault', [owner.account.address]),
  ]);
  const depositDexLibraries = { libraries: { OrderValidationLib: await orderLib.address } };
  const depositDex = await viemDeployProxyWithLibraries(
    'DepositDEX',
    [],
    depositDexLibraries,
    false,
    owner.account.address,
  );
  const eveDex = await viemDeployProxyWithLibraries(
    'EVEDEX',
    [owner.account.address, depositDex.address, sessions.address, fundingRateAccount.account.address, 128, 80, 100, 0],
    depositDexLibraries,
    true,
    owner.account.address,
  );
  await depositDex.write.initialize([eveDex.address, vault.address]);

  const [matcherRole, validatorRole, withdrawRole] = await Promise.all([
    eveDex.read.MATCHER_ROLE(),
    sessions.read.VALIDATOR_ROLE(),
    vault.read.WITHDRAWER_ROLE(),
  ]);

  await Promise.all([
    eveDex.write.grantRole([zeroHash, owner.account.address]),
    eveDex.write.grantRole([matcherRole, matcher.account.address]),
    sessions.write.grantRole([validatorRole, depositDex.address]),
    sessions.write.grantRole([validatorRole, eveDex.address]),
    vault.write.grantRole([withdrawRole, depositDex.address]),
    // positions of collaterals and instruments selected according to test/helpers/constants.js
    depositDex.write.setCollateralConfigs([[usdtToken.address], [true]]),
    depositDex.write.setCollateralConfigs([[btcToken.address], [true]]),
    eveDex.write.addInstrument([
      BTC_USD_SYMBOL,
      100, //leverage
      86400, //dailyFRLong
      86400, //dailyFRShort
      Math.floor(Date.now() / 1000), //timestamp
    ]),
  ]);

  return { orderLib, sessions, vault, depositDex, eveDex };
};

const generateSuit = async (id) => {
  if (!id) throw new Error('Suit id is required');
  const { owner, alice, bob, liquidator, fundingRateAccount, matcher, aliceSessionWallet, bobSessionWallet } =
    await prepareWallets();
  const { usdtToken, btcToken } = await prepareTokens([owner, alice, bob, liquidator, fundingRateAccount, matcher]);
  const { orderLib, sessions, vault, depositDex, eveDex } = await prepareContracts({
    owner,
    matcher,
    usdtToken,
    btcToken,
    fundingRateAccount,
  });
  suits[id] = {
    owner,
    alice,
    bob,
    liquidator,
    fundingRateAccount,
    matcher,
    usdtToken,
    btcToken,
    orderLib,
    sessions,
    vault,
    depositDex,
    eveDex,
    aliceSessionWallet,
    bobSessionWallet,
  };

  return suits[id];
};

const restoreSuit = async (id) => (suits[id] ? suits[id] : await generateSuit(id));

module.exports = { generateSuit, restoreSuit };
