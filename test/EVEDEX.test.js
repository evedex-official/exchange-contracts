const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const { deployProxyWithLibraries, deployWithLibraries } = require('./helpers/deploy-utils');

describe('EVEDEX contract', function () {
  let depositDex, vault, eveDex, sessions, token, tokenAddress, orderLib;

  let owner, alice, bob, liquidator, fundingRateAccount, matcher;

  beforeEach(async function () {
    [owner, alice, bob, liquidator, fundingRateAccount, matcher] = await ethers.getSigners();

    orderLib = await deployWithLibraries('OrderValidationLib', []);
    sessions = await deployWithLibraries('SessionManager', [owner.address]);

    const libraries = { libraries: { OrderValidationLib: await orderLib.getAddress() } };

    vault = await deployWithLibraries('EveVault', [owner.address]);
    depositDex = await deployProxyWithLibraries('DepositDEX', [], libraries, false, owner.address);

    eveDex = await deployProxyWithLibraries(
      'EVEDEX',
      [
        owner.address,
        await depositDex.getAddress(),
        await sessions.getAddress(),
        fundingRateAccount.address,
        128,
        80,
        500,
        0,
      ],
      libraries,
      true,
      owner.address,
    );

    await depositDex.initialize(await eveDex.getAddress(), await vault.getAddress());

    await eveDex.grantRole(ethers.ZeroHash, owner.address);
    const matcherRole = await eveDex.MATCHER_ROLE();
    await eveDex.grantRole(matcherRole, matcher.address);

    const validatorRole = await sessions.VALIDATOR_ROLE();
    await sessions.grantRole(validatorRole, await eveDex.getAddress());

    MockToken = await ethers.getContractFactory('ERC20Mock');
    token = await MockToken.deploy();
    tokenAddress = await token.getAddress();

    await depositDex.setCollateralConfigs([tokenAddress], [true]);

    const withdrawRole = await vault.WITHDRAWER_ROLE();
    await vault.grantRole(withdrawRole, depositDex.getAddress());

    const ticker = 'ETHUSD';
    const leverage = 100;
    const frLong = 86400;
    const frShort = 86400;
    await eveDex.addInstrument(ticker, leverage, frLong, frShort, Math.floor(Date.now() / 1000));
  });

  it('contracts are correctly initialized', async function () {
    const depositDexAddress = await eveDex.depositDex();
    expect(depositDexAddress).to.equal(await depositDex.getAddress(), 'wrong evedex address');

    const sessionsAddress = await eveDex.sessionManager();
    expect(sessionsAddress).to.equal(await sessions.getAddress(), 'wrong vault address');
  });

  it('should fill order', async function () {
    const amount = await ethers.parseEther('100');
    await token.mint(alice.address, amount);
    await token.mint(bob.address, amount);

    await token.connect(alice).approve(await depositDex.getAddress(), amount);
    await token.connect(bob).approve(await depositDex.getAddress(), amount);
    await depositDex.connect(alice).depositCollateral(tokenAddress, amount);
    await depositDex.connect(bob).depositCollateral(tokenAddress, amount);

    const expiration = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const orderAmount = await ethers.parseEther('0.1');
    const orderPrice = 300000000000;

    const aliceOrder = {
      senderAddress: alice.address,
      matcherAddress: matcher.address,
      collateral: tokenAddress,
      instrumentIndex: 0,
      amount: orderAmount,
      price: orderPrice,
      leverage: 100,
      matcherFee: 0,
      expiration: expiration,
      side: 1,
      userSession: ethers.ZeroAddress,
    };
    const bobOrder = {
      senderAddress: bob.address,
      matcherAddress: matcher.address,
      collateral: tokenAddress,
      instrumentIndex: 0,
      amount: orderAmount,
      price: orderPrice,
      leverage: 100,
      matcherFee: 0,
      expiration: expiration,
      side: 0,
      userSession: ethers.ZeroAddress,
    };
    const domain = {
      name: 'EVEDEX',
      version: '1',
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await eveDex.getAddress(),
    };
    const types = {
      Order: [
        { name: 'senderAddress', type: 'address' },
        { name: 'matcherAddress', type: 'address' },
        { name: 'collateral', type: 'address' },
        { name: 'instrumentIndex', type: 'uint256' },
        { name: 'amount', type: 'uint256' },
        { name: 'price', type: 'uint256' },
        { name: 'leverage', type: 'uint16' },
        { name: 'matcherFee', type: 'uint256' },
        { name: 'expiration', type: 'uint256' },
        { name: 'side', type: 'uint8' },
      ],
    };
    const instrumentPrices = [
      {
        index: 0,
        price: orderPrice,
      },
    ];
    const collateralPrices = [
      {
        collateral: tokenAddress,
        price: 100000000,
      },
    ];

    const aliceSignature = await alice.signTypedData(domain, types, aliceOrder);
    const bobSignature = await bob.signTypedData(domain, types, bobOrder);

    await eveDex.connect(matcher).fillOrders(
      { ...aliceOrder, signature: aliceSignature },
      { ...bobOrder, signature: bobSignature },
      orderPrice,
      orderAmount,
      { collateralPrices, instrumentPrices }, // fullPrices
      0, // historyTimestamp
      0, // historySearchHint
    );
  });

  it('should run EVEDEX test', async function () {});
});
