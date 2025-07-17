require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-toolbox-viem');
require('@openzeppelin/hardhat-upgrades');
require('@nomicfoundation/hardhat-chai-matchers');
require('hardhat-contract-sizer');
require('dotenv').config();
const path = require('path');

let config = require('./config.js');

function accounts(...names) {
  return names.reduce((accounts, name) => (process.env[name] ? [...accounts, process.env[name]] : accounts), []);
}

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [
      {
        version: '0.8.27',
        settings: {
          evmVersion: 'cancun',
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 20,
          },
        },
      },
      {
        version: '0.8.20',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  sourcify: {
    enabled: false,
    // Optional: specify a different Sourcify server
    apiUrl: 'https://sourcify.dev/server',
    // Optional: specify a different Sourcify repository
    browserUrl: 'https://repo.sourcify.dev',
  },
  paths: {
    deploy: path.resolve(__dirname, './deploy'),
    deployments: path.resolve(__dirname, './deployments'),
  },
  networks: {
    hardhat: {
      initialBaseFeePerGas: 0,
      blockGasLimit: 10000000,
      allowUnlimitedContractSize: true,
    },
    // mainnet: {
    //   url: process.env.MAINNET,
    //   chainId: 1,
    //   // gasPrice: 200_000_000_000,
    //   blockGasLimit: 6_000_000,
    //   accounts: accounts('DEPLOYER'),
    // },
    // optimism: {
    //   url: process.env.OP_MAINNET,
    //   chainId: 10,
    //   // gasPrice: 200_000_000_000,
    //   blockGasLimit: 6_000_000,
    //   accounts: accounts('DEPLOYER'),
    // },
    // arbitrum_one: {
    //   url: process.env.ARBITRUM_ONE_NODE,
    //   chainId: 42161,
    //   // gasPrice: 200_000_000_000,
    //   blockGasLimit: 30_000_000,
    //   accounts: accounts('DEPLOYER'),
    // },
    // sepolia: {
    //   url: process.env.SEPOLIA_NODE,
    //   chainId: 11155111,
    //   // gasPrice: 200_000_000_000,
    //   blockGasLimit: 6_000_000,
    //   accounts: accounts('DEPLOYER'),
    // },
    // raspberry: {
    //   url: process.env.RASPBERRY_NODE,
    //   chainId: 123420111,
    //   gasPrice: 1_000_000_000,
    //   blockGasLimit: 6_000_000,
    //   accounts: accounts('DEPLOYER'),
    // },
    // eventum_testnet: {
    //   url: process.env.EVENTUM_TESTNET_NODE,
    //   chainId: 16182,
    //   gasPrice: 1_000_000_000,
    //   blockGasLimit: 30_000_000,
    //   accounts: accounts('DEPLOYER'),
    // },
    eventum_demo: {
      url: config.EVENTUM_TESTNET_NODE,
      chainId: 16182,
      gasPrice: 1_000_000_000,
      blockGasLimit: 30_000_000,
      accounts: config.DEPLOYER,
    },
  },
  etherscan: {
    apiKey: {
      eventum_demo: config.API_BLOCKSCOUT,
    },
    customChains: [
      {
        network: 'eventum_demo',
        chainId: 16182,
        urls: {
          apiURL: 'https://testnet-blockscout.evedex.tech/api',
          browserURL: 'https://testnet-blockscout.evedex.tech',
        },
      },
    ],
    sourcify: {
      enabled: false,
    },
  },
  namedAccounts: {
    deployer: {
      '': 0,
    },
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: false,
    only: [':EVEDEX$'],
  },
};
