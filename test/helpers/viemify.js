'use strict';

const { viem } = require('hardhat');
const { deployWithLibraries, deployProxyWithLibraries, deployProxy } = require('./deploy-utils');

const viemDeployWithLibraries = async (contractName, args, libraries) => {
  const contract = await deployWithLibraries(contractName, args, libraries);
  const contractAddress = await contract.getAddress();
  return await viem.getContractAt(contractName, contractAddress);
};

const viemDeployProxyWithLibraries = async (contractName, args, libraries, initializerBool, deployerAddress) => {
  const contract = await deployProxyWithLibraries(contractName, args, libraries, initializerBool, deployerAddress);
  const contractAddress = await contract.getAddress();
  return await viem.getContractAt(contractName, contractAddress);
};

const viemDeployProxy = async (contractName, args) => {
  const contract = await deployProxy(contractName, args);
  const contractAddress = await contract.getAddress();
  return await viem.getContractAt(contractName, contractAddress);
};

module.exports = {
  viemDeployWithLibraries,
  viemDeployProxyWithLibraries,
  viemDeployProxy,
};
