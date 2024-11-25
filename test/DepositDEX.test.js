const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');
const order = require('solhint/lib/rules/order');
const { deployProxyWithLibraries, deployWithLibraries } = require('./helpers/deploy-utils');


describe('DepositDex contract', function () {
  let depositDex, vault, eveDex, sessions, usdt, btcToken, tokenAddress, orderLib;

  let owner, alice, bob, liquidator, fundingRateAccount, matcher;

    const createSignedWithdrawOrder = async (signer, collateral, amount, session, expiration) => {

        const withdrawalOrder = {
            collateral,
            account: signer.address,
            amount,
            session,
            expiration,
            signature: '0x'
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
    }

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
    usdt = await MockToken.deploy();
    tokenAddress = await usdt.getAddress();

    btcToken = await MockToken.deploy();

    await depositDex.setCollateralConfigs([tokenAddress], [true]);

    const withdrawRole = await vault.WITHDRAWER_ROLE();
    await vault.grantRole(withdrawRole, depositDex.getAddress());

    //add btc instrument
    await eveDex.connect(owner).addInstrument(
        ["BTC/USD",
        "", "", "", "", "", "", "", "", "", "", ""],
        10, //leverage
        0,  //dailyFRLong
        0,  //dailyFRShort
        0   //timestamp
    )

  });

  it('contracts are correctly initialized', async function () {
    const depositDexAddress = await depositDex.baseDex();
    expect(depositDexAddress).to.equal(await eveDex.getAddress(), 'wrong evedex address');

    const vaultAddress = await depositDex.vault();
    expect(vaultAddress).to.equal(await vault.getAddress(), 'wrong vault address');
  });

  it('should deposit collateral', async function () {
    const amount = await ethers.parseEther('100');
    await usdt.mint(alice.address, amount);

    await usdt.connect(alice).approve(await depositDex.getAddress(), amount);

    await depositDex.connect(alice).depositCollateral(tokenAddress, amount);

    const collateralPriceData = [{ collateral: tokenAddress, price: 100000000 }];
    const totalBalance = await depositDex.getTotalBalance(alice.address, collateralPriceData);
    expect(totalBalance).to.equal(amount, 'wrong total balance');
  });

  it('should withdraw balance by matcher', async function () {
    const amount = ethers.parseEther('100');
    await usdt.mint(alice.address, amount);

    await usdt.connect(alice).approve(await depositDex.getAddress(), amount);
    await depositDex.connect(alice).depositCollateral(tokenAddress, amount);

    const withdrawalAmount = ethers.parseEther('10');
    const expiration = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    const signedWithdrawalOrder = await createSignedWithdrawOrder(
        alice,
        tokenAddress,
        withdrawalAmount,
        ethers.ZeroAddress,
        expiration
    )

    const instrumentPrices = [
        {
          index: 0,
          price: 100000000,
        },
    ];

    const collateralPrices = [
      {
        collateral: tokenAddress,
        price: 100000000,
      },
    ];

    await depositDex.connect(matcher).withdrawComplete(
      signedWithdrawalOrder,
      { collateralPrices, instrumentPrices }, // fullPrices
      0, // historyTimestamp
      0, // historySearchHint
    );
  });

  it('should register withdraw request by the user', async function() {
    const amount = ethers.parseEther('100');
    await usdt.mint(alice.address, amount);

    await usdt.connect(alice).approve(await depositDex.getAddress(), amount);
    await depositDex.connect(alice).depositCollateral(tokenAddress, amount);

    const withdrawalAmount = ethers.parseEther('10');
    const expiration = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    const signedWithdrawalOrder = await createSignedWithdrawOrder(
        alice,
        tokenAddress,
        withdrawalAmount,
        ethers.ZeroAddress,
        expiration
    )

    const withdrawOrderHash = await depositDex.getWithdrawOrderHash(signedWithdrawalOrder)

    await expect(depositDex.connect(alice).withdrawRequest(signedWithdrawalOrder))
        .to.emit(depositDex, "WithdrawRequestRegistered");

    const withrawRequest = await depositDex.getWithdrawRequest(withdrawOrderHash);
    const status = withrawRequest[1]
    expect(status).to.equal(1, "status should be 1 (Open)");
  })

  it('should cancel withraw request by user', async function() {
    const amount = ethers.parseEther('100');
    await usdt.mint(alice.address, amount);

    await usdt.connect(alice).approve(await depositDex.getAddress(), amount);
    await depositDex.connect(alice).depositCollateral(tokenAddress, amount);

    const withdrawalAmount = ethers.parseEther('10');
    const expiration = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    const signedWithdrawalOrder = await createSignedWithdrawOrder(
        alice,
        tokenAddress,
        withdrawalAmount,
        ethers.ZeroAddress,
        expiration
    )

    const withdrawOrderHash = await depositDex.getWithdrawOrderHash(signedWithdrawalOrder)

    await expect(depositDex.connect(alice).withdrawRequest(signedWithdrawalOrder))
        .to.emit(depositDex, "WithdrawRequestRegistered");

    await depositDex.connect(alice).withdrawRequestCancel(signedWithdrawalOrder);
    const withrawRequest = await depositDex.getWithdrawRequest(withdrawOrderHash);
    const status = withrawRequest[1]
    expect(status).to.equal(2, "status should be 2 (Cancelled)");
  });

  

});
