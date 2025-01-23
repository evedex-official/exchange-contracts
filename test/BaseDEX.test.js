const { ethers } = require('hardhat');
const { expect } = require('chai');
const { deployProxyWithLibraries, deployWithLibraries, deployProxy } = require('./helpers/deploy-utils');
const { PYTH_IDS, ALLOWED_SLIPPAGE_DEPOSIT_DEX } = require('./helpers/constants');
const { maxUint128, maxUint256 } = require('viem');

describe('EVEDEX contract', function () {
  let depositDex, vault, eveDex, sessions, token, tokenAddress, orderLib, marginCalculator, oracle, pythMock;

  let owner, alice, bob, liquidator, fundingRateAccount, matcher;

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
        0,
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
  });

  it('should fill and search FR array ', async function () {
    const ticker = 'ETHUSD';
    const leverage = 100;
    await eveDex.addInstrument(ticker, leverage, 1, 1, 100);

    await eveDex.connect(matcher).setFR(0, 10, 10, 200);
    await eveDex.connect(matcher).setFR(0, 100, 100, 300);
    await eveDex.connect(matcher).setFR(0, 1000, 1000, 400);

    expect((await eveDex.getFundingRateData(0, 0, 999))[3][2]).to.equal(400);
    await expect(eveDex.getTotalLongFR(0, 99, 0))
      .to.be.revertedWithCustomError(eveDex, 'SearchWithHintFailed')
      .withArgs(0);
    expect(await eveDex.getTotalLongFR(0, 100, 0)).to.equal(1);
    expect(await eveDex.getTotalLongFR(0, 199, 0)).to.equal(1);
    expect(await eveDex.getTotalLongFR(0, 200, 0)).to.equal(10);
    expect(await eveDex.getTotalLongFR(0, 299, 0)).to.equal(10);
    expect(await eveDex.getTotalLongFR(0, 300, 0)).to.equal(100);
    expect(await eveDex.getTotalLongFR(0, 399, 0)).to.equal(100);
    expect(await eveDex.getTotalLongFR(0, 400, 0)).to.equal(1000);
    expect(await eveDex.getTotalLongFR(0, Math.floor(Date.now() / 1000), 0)).to.equal(1000);
  });
});
