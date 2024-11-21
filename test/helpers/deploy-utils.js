async function deployWithLibraries(contractName, args, libraries) {
    const Contract = await ethers.getContractFactory(contractName, libraries);
  
    const contract = await Contract.deploy(...args);
    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();
  
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
  
    return contract;
  }

  module.exports = {
    deployProxy,
    deployWithLibraries,
    deployProxyWithLibraries
  }