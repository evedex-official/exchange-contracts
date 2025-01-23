const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const { StandardMerkleTree } = require('@openzeppelin/merkle-tree');
const { deployProxyWithLibraries, deployWithLibraries, deployProxy } = require('./helpers/deploy-utils');
const {
  multiOrderLiquidationTypes,
  orderTypes,
  multiOrderTypes,
  orderWithdrawalTypes,
  domain,
} = require('./helpers/eip712-types');
const { PYTH_IDS, ALLOWED_SLIPPAGE_DEPOSIT_DEX } = require('./helpers/constants');
const { maxUint128, maxUint256 } = require('viem');

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
    const domainDeposit = await domain(await depositDex.getAddress());
    const signature = await alice.signTypedData(domainDeposit, orderWithdrawalTypes, withdrawalOrder);
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

    MockToken = await ethers.getContractFactory('ERC20Mock');
    token = await MockToken.deploy();
    tokenAddress = await token.getAddress();

    const libraries = { libraries: { OrderValidationLib: await orderLib.getAddress() } };

    vault = await deployWithLibraries('EveVault', [owner.address]);
    depositDex = await deployProxyWithLibraries('DepositDEX', [], libraries, false, owner.address);
    marginCalculator = await deployProxy('MarginCalc', [
      owner.address,
      maxUint128, // max margin
      0, // min margin
    ]);
    pythMock = await deployWithLibraries('PythMock', []);
    oracle = await deployWithLibraries('PriceOraclePyth', [
      await pythMock.getAddress(),
      tokenAddress,
      PYTH_IDS.USDT_PYTH_ID, // pyth id of the base token,
      maxUint256, // max time window of the price confidence,
      owner.address,
    ]);

    const precision = Number(await marginCalculator.PRECISION());

    eveDex = await deployProxyWithLibraries(
      'EVEDEX',
      [
        owner.address,
        await depositDex.getAddress(),
        await sessions.getAddress(),
        await marginCalculator.getAddress(),
        fundingRateAccount.address,
        128,
        0.8 * precision,
        1 * precision,
        10000000,
      ],
      libraries,
      true,
      owner.address,
    );

    await depositDex.initialize(
      await eveDex.getAddress(),
      await vault.getAddress(),
      await oracle.getAddress(),
      ALLOWED_SLIPPAGE_DEPOSIT_DEX,
    );

    await eveDex.grantRole(ethers.ZeroHash, owner.address);
    const matcherRole = await eveDex.MATCHER_ROLE();
    await eveDex.grantRole(matcherRole, matcher.address);

    const validatorRole = await sessions.VALIDATOR_ROLE();
    await sessions.grantRole(validatorRole, await eveDex.getAddress());

    await depositDex.setCollateralConfigs([tokenAddress], [true]);

    const withdrawRole = await vault.WITHDRAWER_ROLE();
    await vault.grantRole(withdrawRole, depositDex.getAddress());

    const ticker = 'ETHUSD';
    const leverage = 100;
    const frLong = 86400;
    const frShort = 86400;
    await eveDex.addInstrument(ticker, leverage, frLong, frShort, Math.floor(Date.now() / 1000));

    // set margin levels
    await marginCalculator.setLevels(0, [
      {
        accumulatedMarginLowerLevels: 0, // accumulated value of margin function at lower levels
        positionVolumeLowerBound: 0, // f(positionVolumeLowerBound) === f_level_min - boundary where current level starts
        marginCoefficient: 1 * precision, // f(v) = k*v; k - marginCoefficient on current level
      },
    ]);
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

    const creationTime = Math.floor(Date.now() / 1000);
    const orderAmount = await ethers.parseEther('4.166'); // 4.167 * 3000 (price) / 100 (leverage) * 80 (soLevel) = 100 (balance) * 1.0 (collateralPrice) * 100 (100%)
    const orderPrice = 300000000000;

    const aliceOrder = {
      orderId: 42,
      senderAddress: alice.address,
      matcherAddress: matcher.address,
      instrumentIndex: 0,
      amount: orderAmount,
      price: orderPrice,
      leverage: 100,
      matcherFee: 0,
      creationTime: creationTime,
      side: 1,
      userSession: ethers.ZeroAddress,
      merkleRoot: ethers.ZeroHash,
      merkleProof: [],
    };
    const bobOrder = {
      orderId: 142,
      senderAddress: bob.address,
      matcherAddress: matcher.address,
      instrumentIndex: 0,
      amount: orderAmount,
      price: orderPrice,
      leverage: 100,
      matcherFee: 0,
      creationTime: creationTime,
      side: 0,
      userSession: ethers.ZeroAddress,
      merkleRoot: ethers.ZeroHash,
      merkleProof: [],
    };
    const domainBase = await domain(await eveDex.getAddress());
    const aliceSignature = await alice.signTypedData(domainBase, orderTypes, aliceOrder);
    const bobSignature = await bob.signTypedData(domainBase, orderTypes, bobOrder);
    const buyOrder = { ...aliceOrder, signature: aliceSignature };
    const sellOrder = { ...bobOrder, signature: bobSignature };
    const buyOrderExt = { collateralIndex: 0, order: buyOrder };
    const sellOrderExt = { collateralIndex: 0, order: sellOrder };

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
    await eveDex.connect(matcher).fillOrders(
      buyOrderExt,
      sellOrderExt,
      orderPrice,
      orderAmount,
      { collateralPrices, instrumentPrices }, // fullPrices
      time.latest(), // historyTimestamp
      0, // historySearchHint
    );

    const alicePositions = await eveDex.getActiveInstrumentsPositions(alice.address);
    expect(alicePositions[1][0][0]).to.equal(orderAmount, 'wrong buyer position');
    const bobPositions = await eveDex.getActiveInstrumentsPositions(bob.address);
    expect(bobPositions[1][0][0]).to.equal(-orderAmount, 'wrong seller position');
  });

  it('should fill multiOrder', async function () {
    const amount = await ethers.parseEther('100');
    await token.mint(alice.address, amount);
    await token.mint(bob.address, amount);

    await token.connect(alice).approve(await depositDex.getAddress(), amount);
    await token.connect(bob).approve(await depositDex.getAddress(), amount);
    await depositDex.connect(alice).depositCollateral(tokenAddress, amount);
    await depositDex.connect(bob).depositCollateral(tokenAddress, amount);

    const creationTime = Math.floor(Date.now() / 1000);
    const orderAmount1 = await ethers.parseEther('1.0');
    const orderAmount2 = await ethers.parseEther('0.5');
    const orderPrice = 300000000000;

    const aliceOrder1 = {
      orderId: 42,
      senderAddress: alice.address,
      matcherAddress: matcher.address,
      instrumentIndex: 0,
      amount: orderAmount1,
      price: orderPrice,
      leverage: 100,
      matcherFee: 0,
      creationTime: creationTime,
      side: 1,
      userSession: ethers.ZeroAddress,
      merkleRoot: ethers.ZeroHash,
      merkleProof: [],
    };
    const aliceOrder2 = {
      orderId: 43,
      senderAddress: alice.address,
      matcherAddress: matcher.address,
      instrumentIndex: 0,
      amount: orderAmount2,
      price: orderPrice,
      leverage: 100,
      matcherFee: 0,
      creationTime: creationTime,
      side: 1,
      userSession: ethers.ZeroAddress,
      merkleRoot: ethers.ZeroHash,
      merkleProof: [],
    };
    const bobOrder = {
      orderId: 143,
      senderAddress: bob.address,
      matcherAddress: matcher.address,
      instrumentIndex: 0,
      amount: orderAmount1 + orderAmount2,
      price: orderPrice,
      leverage: 100,
      matcherFee: 0,
      creationTime: creationTime,
      side: 0,
      userSession: ethers.ZeroAddress,
      merkleRoot: ethers.ZeroHash,
      merkleProof: [],
    };

    const leafEncoding = [
      'bytes32',
      'uint256',
      'address',
      'address',
      'uint256',
      'uint256',
      'uint256',
      'uint16',
      'uint256',
      'uint256',
      'uint8',
    ];
    const typehash = await orderLib.ORDER_TYPEHASH();
    const leaf1 = [
      typehash,
      aliceOrder1.orderId,
      aliceOrder1.senderAddress,
      aliceOrder1.matcherAddress,
      aliceOrder1.instrumentIndex,
      aliceOrder1.amount,
      aliceOrder1.price,
      aliceOrder1.leverage,
      aliceOrder1.matcherFee,
      aliceOrder1.creationTime,
      aliceOrder1.side,
    ];
    const leaf2 = [
      typehash,
      aliceOrder2.orderId,
      aliceOrder2.senderAddress,
      aliceOrder2.matcherAddress,
      aliceOrder2.instrumentIndex,
      aliceOrder2.amount,
      aliceOrder2.price,
      aliceOrder2.leverage,
      aliceOrder2.matcherFee,
      aliceOrder2.creationTime,
      aliceOrder2.side,
    ];
    const values = [leaf1, leaf2];
    const tree = StandardMerkleTree.of(values, leafEncoding);
    const aliceMultiOrder = { merkleRoot: tree.root };

    const domainBase = await domain(await eveDex.getAddress());
    const aliceSignature = await alice.signTypedData(domainBase, multiOrderTypes, aliceMultiOrder);
    const bobSignature = await bob.signTypedData(domainBase, orderTypes, bobOrder);
    const buyOrder1 = {
      ...aliceOrder1,
      signature: aliceSignature,
      merkleRoot: tree.root,
      merkleProof: tree.getProof(tree.leafLookup(leaf1)),
    };
    const buyOrder2 = {
      ...aliceOrder2,
      signature: aliceSignature,
      merkleRoot: tree.root,
      merkleProof: tree.getProof(tree.leafLookup(leaf2)),
    };
    const sellOrder = { ...bobOrder, signature: bobSignature };
    const buyOrderExt1 = { collateralIndex: 0, order: buyOrder1 };
    const buyOrderExt2 = { collateralIndex: 0, order: buyOrder2 };
    const sellOrderExt = { collateralIndex: 0, order: sellOrder };

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

    await eveDex.connect(matcher).fillOrders(
      buyOrderExt1,
      sellOrderExt,
      orderPrice,
      orderAmount1,
      { collateralPrices, instrumentPrices }, // fullPrices
      time.latest(), // historyTimestamp
      0, // historySearchHint
    );

    const alicePositions1 = await eveDex.getActiveInstrumentsPositions(alice.address);
    expect(alicePositions1[1][0][0]).to.equal(orderAmount1, 'wrong buyer position');
    const bobPositions1 = await eveDex.getActiveInstrumentsPositions(bob.address);
    expect(bobPositions1[1][0][0]).to.equal(-orderAmount1, 'wrong seller position');

    await eveDex.connect(matcher).fillOrders(
      buyOrderExt2,
      sellOrderExt,
      orderPrice,
      orderAmount2,
      { collateralPrices, instrumentPrices }, // fullPrices
      time.latest(), // historyTimestamp
      0, // historySearchHint
    );

    const alicePositions2 = await eveDex.getActiveInstrumentsPositions(alice.address);
    expect(alicePositions2[1][0][0]).to.equal(orderAmount1 + orderAmount2, 'wrong buyer position');
    const bobPositions2 = await eveDex.getActiveInstrumentsPositions(bob.address);
    expect(bobPositions2[1][0][0]).to.equal(-orderAmount1 - orderAmount2, 'wrong seller position');
  });

  it('should withdraw within margin', async function () {
    const amount = await ethers.parseEther('100');
    await token.mint(alice.address, amount);
    await token.mint(bob.address, amount);

    await token.connect(alice).approve(await depositDex.getAddress(), amount);
    await token.connect(bob).approve(await depositDex.getAddress(), amount);
    await depositDex.connect(alice).depositCollateral(tokenAddress, amount);
    await depositDex.connect(bob).depositCollateral(tokenAddress, amount);

    const creationTime = Math.floor(Date.now() / 1000);
    const expiration = Math.floor(Date.now() / 1000) + 3600;
    const orderAmount = await ethers.parseEther('3.166'); // 3.167 * 3000 (price) / 100 (leverage) * 1.0 (soLevel) = 94.98
    const orderPrice = 300000000000;

    const aliceOrder = {
      orderId: 42,
      senderAddress: alice.address,
      matcherAddress: matcher.address,
      instrumentIndex: 0,
      amount: orderAmount,
      price: orderPrice,
      leverage: 100,
      matcherFee: 0,
      creationTime: creationTime,
      side: 1,
      userSession: ethers.ZeroAddress,
      merkleRoot: ethers.ZeroHash,
      merkleProof: [],
    };
    const bobOrder = {
      orderId: 142,
      senderAddress: bob.address,
      matcherAddress: matcher.address,
      instrumentIndex: 0,
      amount: orderAmount,
      price: orderPrice,
      leverage: 100,
      matcherFee: 0,
      creationTime: creationTime,
      side: 0,
      userSession: ethers.ZeroAddress,
      merkleRoot: ethers.ZeroHash,
      merkleProof: [],
    };
    const domainBase = await domain(await eveDex.getAddress());
    const aliceSignature = await alice.signTypedData(domainBase, orderTypes, aliceOrder);
    const bobSignature = await bob.signTypedData(domainBase, orderTypes, bobOrder);
    const buyOrder = { ...aliceOrder, signature: aliceSignature };
    const sellOrder = { ...bobOrder, signature: bobSignature };
    const buyOrderExt = { collateralIndex: 0, order: buyOrder };
    const sellOrderExt = { collateralIndex: 0, order: sellOrder };

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

    await eveDex.connect(matcher).fillOrders(
      buyOrderExt,
      sellOrderExt,
      orderPrice,
      orderAmount,
      { collateralPrices, instrumentPrices }, // fullPrices
      time.latest(), // historyTimestamp
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
        time.latest(), // historyTimestamp
        0, // historySearchHint
      ),
    ).to.be.revertedWithCustomError(depositDex, 'InsufficientMargin');

    await depositDex.connect(matcher).withdrawComplete(
      signedWithdrawalOrderCorrect,
      { collateralPrices, instrumentPrices }, // fullPrices
      time.latest(), // historyTimestamp
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

    const creationTime = Math.floor(Date.now() / 1000);
    const expiration = Math.floor(Date.now() / 1000) + 3600;
    const orderAmount = await ethers.parseEther('3.75'); // 3.75 * 3000 (price) / 100 (leverage) * 0.8 (soLevel) = 90
    const orderPrice = 300000000000;

    const aliceOrder = {
      orderId: 42,
      senderAddress: alice.address,
      matcherAddress: matcher.address,
      instrumentIndex: 0,
      amount: orderAmount,
      price: orderPrice,
      leverage: 100,
      matcherFee: 0,
      creationTime: creationTime,
      side: 1,
      userSession: ethers.ZeroAddress,
      merkleRoot: ethers.ZeroHash,
      merkleProof: [],
    };
    const bobOrder = {
      orderId: 142,
      senderAddress: bob.address,
      matcherAddress: matcher.address,
      instrumentIndex: 0,
      amount: orderAmount,
      price: orderPrice,
      leverage: 100,
      matcherFee: 0,
      creationTime: creationTime,
      side: 0,
      userSession: ethers.ZeroAddress,
      merkleRoot: ethers.ZeroHash,
      merkleProof: [],
    };
    const domainBase = await domain(await eveDex.getAddress());
    const aliceSignature = await alice.signTypedData(domainBase, orderTypes, aliceOrder);
    const bobSignature = await bob.signTypedData(domainBase, orderTypes, bobOrder);
    const buyOrder = { ...aliceOrder, signature: aliceSignature };
    const sellOrder = { ...bobOrder, signature: bobSignature };
    const buyOrderExt = { collateralIndex: 0, order: buyOrder };
    const sellOrderExt = { collateralIndex: 0, order: sellOrder };

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

    await eveDex.connect(matcher).fillOrders(
      buyOrderExt,
      sellOrderExt,
      orderPrice,
      orderAmount,
      { collateralPrices, instrumentPrices }, // fullPrices
      time.latest(), // historyTimestamp
      0, // historySearchHint
    );

    const liquidationPrice = 302000000000;

    const liquidationPrices = [
      {
        index: 0,
        price: liquidationPrice,
      },
    ];
    const collateralIndices = {
      liquidatorIndex: 0,
      indicesToLiquidate: [0],
    };

    const multiLiquidationOrder = {
      accountToLiquidate: bob.address,
      liquidator: liquidator.address,
      liquidationPrices: liquidationPrices,
      prices: liquidationPrices,
      leverage: 100,
      liquidationTimestamp: Math.floor(Date.now() / 1000),
      expiration: expiration,
    };

    const liquidatorSignature = await liquidator.signTypedData(
      domainBase,
      multiOrderLiquidationTypes,
      multiLiquidationOrder,
    );
    const liquidationOrder = { ...multiLiquidationOrder, signature: liquidatorSignature };

    const bal0Before = await depositDex.getBalance(bob.address, tokenAddress);
    console.log(`Bob's collaterals before liquidation: ${bal0Before}`);

    await eveDex.connect(matcher).liquidatePositions(
      liquidationOrder,
      { collateralPrices, instrumentPrices }, // fullPrices
      collateralIndices, // collateralIndices
      time.latest(), // historyTimestamp
      0, // historySearchHint
    );
    console.log('Liquidating Bob with single collateral');

    const bal0After = await depositDex.getBalance(bob.address, tokenAddress);
    console.log(`Bob's collaterals after liquidation: ${bal0After}`);
  });

  it('should liquidate multiple collaterals', async function () {
    const MockToken = await ethers.getContractFactory('ERC20Mock');
    const token2 = await MockToken.deploy();
    const token2Address = await token2.getAddress();
    await depositDex.setCollateralConfigs([token2Address], [true]);

    const amount = await ethers.parseEther('100');
    const halfAmount = await ethers.parseEther('50');
    await token.mint(alice.address, amount);
    await token.mint(bob.address, halfAmount);
    await token2.mint(bob.address, halfAmount);

    await token.connect(alice).approve(await depositDex.getAddress(), amount);
    await token.connect(bob).approve(await depositDex.getAddress(), halfAmount);
    await token2.connect(bob).approve(await depositDex.getAddress(), halfAmount);
    await depositDex.connect(alice).depositCollateral(tokenAddress, amount);
    await depositDex.connect(bob).depositCollateral(tokenAddress, halfAmount);
    await depositDex.connect(bob).depositCollateral(token2Address, halfAmount);

    await token.mint(liquidator.address, ethers.parseEther('100000'));
    await token.connect(liquidator).approve(await depositDex.getAddress(), ethers.parseEther('100000'));
    await depositDex.connect(liquidator).depositCollateral(tokenAddress, ethers.parseEther('10000'));

    const creationTime = Math.floor(Date.now() / 1000);
    const expiration = Math.floor(Date.now() / 1000) + 3600;
    const orderAmount = await ethers.parseEther('3.75'); // 3.75 * 3000 (price) / 100 (leverage) * 0.8 (soLevel) = 90
    const orderPrice = 300000000000;

    const aliceOrder = {
      orderId: 42,
      senderAddress: alice.address,
      matcherAddress: matcher.address,
      instrumentIndex: 0,
      amount: orderAmount,
      price: orderPrice,
      leverage: 100,
      matcherFee: 0,
      creationTime: creationTime,
      side: 1,
      userSession: ethers.ZeroAddress,
      merkleRoot: ethers.ZeroHash,
      merkleProof: [],
    };
    const bobOrder = {
      orderId: 142,
      senderAddress: bob.address,
      matcherAddress: matcher.address,
      instrumentIndex: 0,
      amount: orderAmount,
      price: orderPrice,
      leverage: 100,
      matcherFee: 0,
      creationTime: creationTime,
      side: 0,
      userSession: ethers.ZeroAddress,
      merkleRoot: ethers.ZeroHash,
      merkleProof: [],
    };
    const domainBase = await domain(await eveDex.getAddress());
    const aliceSignature = await alice.signTypedData(domainBase, orderTypes, aliceOrder);
    const bobSignature = await bob.signTypedData(domainBase, orderTypes, bobOrder);
    const buyOrder = { ...aliceOrder, signature: aliceSignature };
    const sellOrder = { ...bobOrder, signature: bobSignature };
    const buyOrderExt = { collateralIndex: 0, order: buyOrder };
    const sellOrderExt = { collateralIndex: 0, order: sellOrder };

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
      {
        collateral: token2Address,
        price: 100000000,
      },
    ];

    await eveDex.connect(matcher).fillOrders(
      buyOrderExt,
      sellOrderExt,
      orderPrice,
      orderAmount,
      { collateralPrices, instrumentPrices }, // fullPrices
      time.latest(), // historyTimestamp
      0, // historySearchHint
    );

    const liquidationPrice = 302000000000;

    const liquidationPrices = [
      {
        index: 0,
        price: liquidationPrice,
      },
    ];
    const collateralIndices = {
      liquidatorIndex: 0,
      indicesToLiquidate: [0, 1],
    };

    const multiLiquidationOrder = {
      accountToLiquidate: bob.address,
      liquidator: liquidator.address,
      liquidationPrices: liquidationPrices,
      prices: liquidationPrices,
      leverage: 100,
      liquidationTimestamp: Math.floor(Date.now() / 1000),
      expiration: expiration,
    };

    const liquidatorSignature = await liquidator.signTypedData(
      domainBase,
      multiOrderLiquidationTypes,
      multiLiquidationOrder,
    );
    const liquidationOrder = { ...multiLiquidationOrder, signature: liquidatorSignature };

    const bal0Before = await depositDex.getBalance(bob.address, tokenAddress);
    const bal1Before = await depositDex.getBalance(bob.address, token2Address);
    const lbal0Before = await depositDex.getBalance(liquidator.address, tokenAddress);
    const lbal1Before = await depositDex.getBalance(liquidator.address, token2Address);

    await eveDex.connect(matcher).liquidatePositions(
      liquidationOrder,
      { collateralPrices, instrumentPrices }, // fullPrices
      collateralIndices, // collateralIndices
      time.latest(), // historyTimestamp
      0, // historySearchHint
    );
    console.log('Liquidating Bob with 2 collaterals');

    const bal0After = await depositDex.getBalance(bob.address, tokenAddress);
    const bal1After = await depositDex.getBalance(bob.address, token2Address);
    console.log(`Bob's collaterals gain: (${bal0After - bal0Before}, ${bal1After - bal1Before})`);
    const lbal0After = await depositDex.getBalance(liquidator.address, tokenAddress);
    const lbal1After = await depositDex.getBalance(liquidator.address, token2Address);
    console.log(`Liquidator's collaterals gain: (${lbal0After - lbal0Before}, ${lbal1After - lbal1Before})`);
  });
});
