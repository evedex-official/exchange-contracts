const { ethers } = require('hardhat');
const { expect } = require('chai');
const { deployProxyWithLibraries, deployWithLibraries, deployProxy } = require('./helpers/deploy-utils');
const {
  PYTH_IDS,
  ALLOWED_SLIPPAGE_DEPOSIT_DEX,
  EVEDEX_MARGIN_PRECISION,
  PRECISION_DECIMALS_EVEDEX,
} = require('./helpers/constants');
const { maxUint128, maxUint256 } = require('viem');

describe('EVEDEX contract', function () {
  let depositDex,
    vault,
    dexViewer,
    eveDex,
    sessions,
    tokenAddress,
    orderLib,
    marginCalculator,
    oracle,
    pythMock,
    markPriceOracle;

  let owner, alice, bob, liquidator, fundingRateAccount, staticFundingRateAccount, matcher, markPriceOracleOperator;

  before(async function () {
    await upgrades.silenceWarnings();
  });

  beforeEach(async function () {
    [owner, alice, bob, liquidator, fundingRateAccount, staticFundingRateAccount, matcher, markPriceOracleOperator] =
      await ethers.getSigners();

    orderLib = await deployWithLibraries('OrderValidationLib', []);
    sessions = await deployWithLibraries('SessionManager', [owner.address]);

    MockToken = await ethers.getContractFactory('ERC20Mock');
    token = await MockToken.deploy();
    tokenAddress = await token.getAddress();

    const libraries = { libraries: { OrderValidationLib: await orderLib.getAddress() } };

    vault = await deployWithLibraries('EveVault', [owner.address]);
    dexViewer = await deployProxyWithLibraries('EVEDEXViewer', [], {}, false, owner.address);
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
    markPriceOracle = await deployWithLibraries('MarkPriceOracle', [
      owner.address,
      markPriceOracleOperator.address,
      100n,
    ]);

    eveDex = await deployProxyWithLibraries(
      'EVEDEX',
      [
        owner.address,
        {
          depositDex: await depositDex.getAddress(),
          sessionManager: await sessions.getAddress(),
          marginCalculator: await marginCalculator.getAddress(),
          fundingRateAccount: fundingRateAccount.address,
          staticFundingRateAccount: staticFundingRateAccount.address,
          markPriceOracle: await markPriceOracle.getAddress(),
          maxOpenPositions: 128,
          maxMatcherFee: PRECISION_DECIMALS_EVEDEX,
          allowedOverloadTPSL: PRECISION_DECIMALS_EVEDEX,
          soLevel: 0.8 * EVEDEX_MARGIN_PRECISION,
          withdrawMarginLevel: 1 * EVEDEX_MARGIN_PRECISION,
          liquidationFeePercent: 0,
        },
      ],
      libraries,
      true,
      owner.address,
    );

    await dexViewer.initialize(await eveDex.getAddress());

    await depositDex.initialize(
      await eveDex.getAddress(),
      await dexViewer.getAddress(),
      await vault.getAddress(),
      await oracle.getAddress(),
      ALLOWED_SLIPPAGE_DEPOSIT_DEX,
    );

    await eveDex.grantRole(ethers.ZeroHash, owner.address);
    const matcherRole = await dexViewer.MATCHER_ROLE();
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
    await eveDex.changeInstrument(0, ticker, leverage, 1, 1, 0, 100);

    await eveDex.connect(matcher).setFR(0, 10, 10, 0, 200);
    await eveDex.connect(matcher).setFR(0, 100, 100, 0, 300);
    await eveDex.connect(matcher).setFR(0, 1000, 1000, 0, 400);

    expect((await eveDex.getFundingRateData(0, 0, 999))[1][3]).to.equal(400);
    expect((await eveDex.getFundingRateData(0, 0, 999))[0][2][1]).to.equal(100);
    await expect(eveDex.getTotalFR(0, 99, 0))
      .to.be.revertedWithCustomError(eveDex, 'SearchWithHintFailed')
      .withArgs(0);
    expect((await eveDex.getTotalFR(0, 100, 0))[0]).to.equal(1);
    expect((await eveDex.getTotalFR(0, 199, 0))[0]).to.equal(1);
    expect((await eveDex.getTotalFR(0, 200, 0))[0]).to.equal(10);
    expect((await eveDex.getTotalFR(0, 299, 0))[0]).to.equal(10);
    expect((await eveDex.getTotalFR(0, 300, 0))[0]).to.equal(100);
    expect((await eveDex.getTotalFR(0, 399, 0))[0]).to.equal(100);
    expect((await eveDex.getTotalFR(0, 400, 0))[0]).to.equal(1000);
    expect((await eveDex.getTotalFR(0, Math.floor(Date.now() / 1000), 0))[0]).to.equal(1000);
  });
});
