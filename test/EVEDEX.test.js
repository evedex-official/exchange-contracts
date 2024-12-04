const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const { deployProxyWithLibraries, deployWithLibraries } = require('./helpers/deploy-utils');

describe('EVEDEX contract', function () {
  let depositDex, vault, eveDex, sessions, token, tokenAddress, orderLib;

  let owner, alice, bob, liquidator, fundingRateAccount, matcher;

  const createSignedWithdrawOrder = async (signer, collateral, amount, session, expiration) => {
    const withdrawalOrder = {
      collateral,
      account: signer.address,
      amount,
      session,
      expiration,
      signature: '0x',
    };

    const domain = {
      name: 'EVEDEX',
      version: '1',
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await depositDex.getAddress(),
    };

    const types = {
      OrderWithdrawal: [
        { name: 'collateral', type: 'address' },
        { name: 'account', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'session', type: 'address' },
        { name: 'expiration', type: 'uint256' },
      ],
    };
    const signature = await alice.signTypedData(domain, types, withdrawalOrder);

    const signedWithdrawalOrder = { ...withdrawalOrder, signature };
    return signedWithdrawalOrder;
  };

  before(async function () {
    await upgrades.silenceWarnings();
  });

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
        100,
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
    const orderAmount = await ethers.parseEther('4.166'); // 4.167 * 3000 (price) / 100 (leverage) * 80 (soLevel) = 100 (balance) * 1.0 (collateralPrice) * 100 (100%)
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
    const buyOrder = { ...aliceOrder, signature: aliceSignature };
    const sellOrder = { ...bobOrder, signature: bobSignature };
    const buyOrderExt = { collateralIndex: 0, order: buyOrder };
    const sellOrderExt = { collateralIndex: 0, order: sellOrder };

    await eveDex.connect(matcher).fillOrders(
      buyOrderExt,
      sellOrderExt,
      orderPrice,
      orderAmount,
      { collateralPrices, instrumentPrices }, // fullPrices
      0, // historyTimestamp
      0, // historySearchHint
    );

    const alicePositions = await eveDex.getActiveInstrumentsPositions(alice.address);
    expect(alicePositions[1][0][0]).to.equal(orderAmount, 'wrong buyer position');
    const bobPositions = await eveDex.getActiveInstrumentsPositions(bob.address);
    expect(bobPositions[1][0][0]).to.equal(-orderAmount, 'wrong seller position');
  });

  it('should withdraw within margin', async function () {
    const amount = await ethers.parseEther('100');
    await token.mint(alice.address, amount);
    await token.mint(bob.address, amount);

    await token.connect(alice).approve(await depositDex.getAddress(), amount);
    await token.connect(bob).approve(await depositDex.getAddress(), amount);
    await depositDex.connect(alice).depositCollateral(tokenAddress, amount);
    await depositDex.connect(bob).depositCollateral(tokenAddress, amount);

    const expiration = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const orderAmount = await ethers.parseEther('3.166'); // 3.167 * 3000 (price) / 100 (leverage) * 1.0 (soLevel) = 94.98
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
    const buyOrder = { ...aliceOrder, signature: aliceSignature };
    const sellOrder = { ...bobOrder, signature: bobSignature };
    const buyOrderExt = { collateralIndex: 0, order: buyOrder };
    const sellOrderExt = { collateralIndex: 0, order: sellOrder };

    await eveDex.connect(matcher).fillOrders(
      buyOrderExt,
      sellOrderExt,
      orderPrice,
      orderAmount,
      { collateralPrices, instrumentPrices }, // fullPrices
      0, // historyTimestamp
      0, // historySearchHint
    );

    const withdrawalAmountIncorrect = ethers.parseEther('5.03');
    const withdrawalAmountCorrect = ethers.parseEther('5.0');

    const signedWithdrawalOrderIncorrect = await createSignedWithdrawOrder(
      alice,
      tokenAddress,
      withdrawalAmountIncorrect,
      ethers.ZeroAddress,
      expiration,
    );

    const signedWithdrawalOrderCorrect = await createSignedWithdrawOrder(
      alice,
      tokenAddress,
      withdrawalAmountCorrect,
      ethers.ZeroAddress,
      expiration,
    );

    await expect(
      depositDex.connect(matcher).withdrawComplete(
        signedWithdrawalOrderIncorrect,
        { collateralPrices, instrumentPrices }, // fullPrices
        0, // historyTimestamp
        0, // historySearchHint
      ),
    ).to.be.revertedWithCustomError(depositDex, 'InsufficientMargin');

    await depositDex.connect(matcher).withdrawComplete(
      signedWithdrawalOrderCorrect,
      { collateralPrices, instrumentPrices }, // fullPrices
      0, // historyTimestamp
      0, // historySearchHint
    );

    expect(await token.balanceOf(alice.address)).to.equal(withdrawalAmountCorrect, 'incorrect withdrawal amount');
  });

  it('should liquidate user', async function () {
    const amount = await ethers.parseEther('100');
    await token.mint(alice.address, amount);
    await token.mint(bob.address, amount);

    await token.connect(alice).approve(await depositDex.getAddress(), amount);
    await token.connect(bob).approve(await depositDex.getAddress(), amount);
    await depositDex.connect(alice).depositCollateral(tokenAddress, amount);
    await depositDex.connect(bob).depositCollateral(tokenAddress, amount);

    await token.mint(liquidator.address, ethers.parseEther('100000'));
    await token.connect(liquidator).approve(await depositDex.getAddress(), ethers.parseEther('100000'));
    await depositDex.connect(liquidator).depositCollateral(tokenAddress, ethers.parseEther('10000'));

    const expiration = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const orderAmount = await ethers.parseEther('3.75'); // 3.75 * 3000 (price) / 100 (leverage) * 0.8 (soLevel) = 90
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
    const buyOrder = { ...aliceOrder, signature: aliceSignature };
    const sellOrder = { ...bobOrder, signature: bobSignature };
    const buyOrderExt = { collateralIndex: 0, order: buyOrder };
    const sellOrderExt = { collateralIndex: 0, order: sellOrder };

    await eveDex.connect(matcher).fillOrders(
      buyOrderExt,
      sellOrderExt,
      orderPrice,
      orderAmount,
      { collateralPrices, instrumentPrices }, // fullPrices
      0, // historyTimestamp
      0, // historySearchHint
    );

    const liquidationPrice = 301000000000;

    const liquidationPrices = [
      {
        index: 0,
        price: liquidationPrice,
      },
    ];
    const multiLiquidationOrder = {
      accountToLiquidate: bob.address,
      liquidator: liquidator.address,
      collateral: tokenAddress,
      liquidationPrices: liquidationPrices,
      prices: liquidationPrices,
      leverage: 100,
      liquidationTimestamp: Math.floor(Date.now() / 1000),
      expiration: expiration,
    };
    const liquidationTypes = {
      MultiOrderLiquidation: [
        { name: 'accountToLiquidate', type: 'address' },
        { name: 'liquidator', type: 'address' },
        { name: 'liquidationPrices', type: 'PriceData[]' },
        { name: 'prices', type: 'PriceData[]' },
        { name: 'leverage', type: 'uint16' },
        { name: 'liquidationTimestamp', type: 'uint256' },
        { name: 'expiration', type: 'uint256' },
      ],
      PriceData: [
        { name: 'index', type: 'uint256' },
        { name: 'price', type: 'uint256' },
      ],
    };

    const liquidatorSignature = await liquidator.signTypedData(domain, liquidationTypes, multiLiquidationOrder);
    const liquidationOrder = { ...multiLiquidationOrder, signature: liquidatorSignature };

    await eveDex.connect(matcher).liquidatePositions(
      liquidationOrder,
      { collateralPrices, instrumentPrices }, // fullPrices
      0, // collateralIndex
      0, // historyTimestamp
      0, // historySearchHint
    );
  });
});
