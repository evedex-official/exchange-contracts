const { ethers, network, run, upgrades } = require('hardhat');
const { maxUint112 } = require('viem');

const config = require('../config.js');
const { BTC_USD_SYMBOL } = require('../test/helpers/constants.js');

async function main() {
  const [deployer, alice, bob, liquidator, matcher] = await ethers.getSigners();
  console.log('Deployer address:', deployer.address);

  const orderLib = await deployAndVerify('OrderValidationLib', []);
  const sessions = await deployAndVerify('SessionManager', [deployer.address]);
  const libraries = { libraries: { OrderValidationLib: await orderLib.getAddress() } };
  const vault = await deployAndVerify('EveVault', [deployer.address]);
  const deposit = await deployProxyWithLibraries('DepositDEX', [], libraries, false, deployer.address);
  const dex = await deployProxyWithLibraries(
    'EVEDEX',
    [
      deployer.address,
      await deposit.getAddress(),
      await sessions.getAddress(),
      config.fundingRateAddress,
      config.maxOpenPositions,
      config.soLevel,
      config.withdrawMarginLevel,
      config.liquidationFeePercent,
    ],
    libraries,
    true,
    deployer.address,
  );
  console.log('EVEDEX is initialized');

  await deposit.initialize(await dex.getAddress(), await vault.getAddress());
  console.log('DepositDEX is initialized');

  await dex.grantRole(ethers.ZeroHash, config.defaultAdmin);
  console.log(`EVEDEX: default admin added: ${config.defaultAdmin}`);
  const matcherRole = await dex.MATCHER_ROLE();
  await dex.grantRole(matcherRole, config.defaultMatcher);
  console.log(`EVEDEX: default matcher added: ${config.defaultMatcher}`);
  const validatorRole = await sessions.VALIDATOR_ROLE();
  await sessions.grantRole(validatorRole, await dex.getAddress());
  console.log('SessionManager: EVEDEX is added as validator');

  // Testnet deploy helpers

  const wallets = [deployer, alice, bob, liquidator, matcher];

  const { usdtToken, btcToken } = await deployTokenMocks(wallets);

  await deposit.setCollateralConfigs([await usdtToken.getAddress()], [true]);
  await deposit.setCollateralConfigs([await btcToken.getAddress()], [true]);
  await dex.addInstrument(
    BTC_USD_SYMBOL,
    100, //leverage
    86400, //dailyFRLong
    86400, //dailyFRShort
    Math.floor(Date.now() / 1000), //timestamp
  );
}

async function deployTokenMocks(wallets) {
  const usdtToken = await deployAndVerify('ERC20MockDecimals', ['USDT', 6n]);
  const btcToken = await deployAndVerify('ERC20MockDecimals', ['BTC', 18n]);

  await Promise.all(wallets.map((user) => usdtToken.mint(user.address, maxUint112)));
  await Promise.all(wallets.map((wallet) => btcToken.mint(wallet.address, maxUint112)));

  return {
    usdtToken,
    btcToken,
  };
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
  if (!['hardhat', 'localhost'].includes(networkName)) {
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
