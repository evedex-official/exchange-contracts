const { ethers, network, run, upgrades } = require('hardhat');

const config = require('../config.js');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deployer address:', deployer.address);

  const orderLib = await deployAndVerify('OrderValidationLib', []);
  const sessions = await deployAndVerify('SessionManager', [deployer.address]);
  const vault = await deployAndVerify('EveVault', [deployer.address]);
  const calc = await deployProxy('MarginCalc', [
    deployer.address,
    config.marginCalcConfig.maxMargin,
    config.marginCalcConfig.minMargin,
  ]);
  const oracle = await deployAndVerify('PriceOraclePyth', [
    config.pythOracleConfig.pythAddress,
    config.pythOracleConfig.usdtAddress,
    config.pythOracleConfig.usdtPythId,
    config.pythOracleConfig.maxWindow,
    deployer.address,
  ]);
  const markPriceOracle = await deployAndVerify('MarkPriceOracle', [
    deployer.address,
    config.markPriceOracleConfig.operatorAddress,
    config.markPriceOracleConfig.defaultWindow,
  ]);
  const libraries = { libraries: { OrderValidationLib: await orderLib.getAddress() } };
  const deposit = await deployProxyWithLibraries('DepositDEX', [], libraries, false, deployer.address);
  const dex = await deployProxyWithLibraries(
    'EVEDEX',
    [
      deployer.address,
      {
        depositDex: await deposit.getAddress(),
        sessionManager: await sessions.getAddress(),
        marginCalculator: await calc.getAddress(),
        fundingRateAccount: config.eveDexConfig.fundingRateAddress,
        staticFundingRateAccount: config.eveDexConfig.fundingRateAddress,
        markPriceOracle: await markPriceOracle.getAddress(),
        maxOpenPositions: config.eveDexConfig.maxOpenPositions,
        soLevel: config.eveDexConfig.soLevel,
        withdrawMarginLevel: config.eveDexConfig.withdrawMarginLevel,
        liquidationFeePercent: config.eveDexConfig.liquidationFeePercent,
      },
    ],
    libraries,
    true,
    deployer.address,
  );
  console.log('EveDEX is initialized');

  await deposit.initialize(
    await dex.getAddress(),
    await vault.getAddress(),
    await oracle.getAddress(),
    config.depositDex.allowedSlippage,
  );
  console.log('DepositDEX is initialized');

  await dex.grantRole(ethers.ZeroHash, config.eveDexConfig.defaultAdmin);
  console.log(`EveDEX: default admin added: ${config.eveDexConfig.defaultAdmin}`);
  const matcherRole = await dex.MATCHER_ROLE();
  await dex.grantRole(matcherRole, config.eveDexConfig.defaultMatcher);
  console.log(`EveDEX: default matcher added: ${config.eveDexConfig.defaultMatcher}`);
  const validatorRole = await sessions.VALIDATOR_ROLE();
  await sessions.grantRole(validatorRole, await dex.getAddress());
  await sessions.grantRole(validatorRole, await deposit.getAddress());
  console.log('SessionManager: EveDEX&DepositDEX are added as validators');
}

async function deployAndVerify(contractName, args) {
  const contract = await deployWithLibraries(contractName, args, {});
  return contract;
}

async function deployWithLibraries(contractName, args, libraries) {
  const Contract = await ethers.getContractFactory(contractName, libraries);

  const contract = await Contract.deploy(...args);
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  console.log(`${contractName} deployed to: ${contractAddress}`);

  await verify(contractAddress, args);

  return contract;
}

async function deployProxy(contractName, args) {
  const contract = await deployProxyWithLibraries(contractName, args, {}, true);
  return contract;
}

async function deployProxyWithLibraries(contractName, args, libraries, initializerBool, deployerAddress) {
  const Contract = await ethers.getContractFactory(contractName, libraries);

  let contract;
  if (initializerBool) {
    contract = await upgrades.deployProxy(Contract, args, {
      constructorArgs: [],
      unsafeAllow: ['constructor', 'external-library-linking'],
    });
  } else {
    contract = await upgrades.deployProxy(Contract, [], {
      constructorArgs: [],
      initializer: false,
      unsafeAllow: ['constructor', 'external-library-linking'],
    });
  }

  const tx = contract.deploymentTransaction();
  const receipt = await tx.wait();
  const proxyAddress = await contract.getAddress();
  const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log(`${contractName} implementation deployed to: ${implAddress}`);
  console.log(`${contractName} proxy deployed to: ${proxyAddress}`);

  await verify(implAddress, []);
  await verify(proxyAddress, [implAddress, deployerAddress, initializerBool ? args : '0x']);

  return contract;
}

async function verify(contractAddress, args) {
  const networkName = network.name;
  if (networkName != 'hardhat') {
    console.log('Verifying contract...');
    try {
      await run('verify:verify', {
        address: contractAddress,
        constructorArguments: args,
      });
      console.log('Contract is Verified');
      return true;
    } catch (error) {
      console.log('Failed in plugin', error.pluginName);
      console.log('Error name', error.name);
      console.log('Error message', error.message);
      return true;
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
