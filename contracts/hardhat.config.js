require('dotenv').config({ path: '../server/.env' })
mnemonic = "test test test test test test test test test test test test"
require('@nomiclabs/hardhat-waffle')
require('@nomiclabs/hardhat-etherscan')
require('hardhat-deploy')
require('hardhat-deploy-ethers')

const PROVIDER_URL = process.env.PROVIDER_URL || 'http://localhost:8545'
const PRIVATE_KEY = process.env.SIGNER_PK
const GAS_MULTIPLIER = Number(process.env.GAS_MULTIPLIER) || 1
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY

task('accounts', 'Prints the list of accounts', async (_, hre) => {
  const accounts = await hre.ethers.getSigners()


})

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: '0.8.0'
  },
  networks: {
    hardhat: {
      mnemonic
    },
    rinkeby: {
      url: PROVIDER_URL
    },
    kovan: {
      url: PROVIDER_URL
    },
    mainnet: {
      url: PROVIDER_URL
    }
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY
  },
  namedAccounts: {
    deployerAddr: {
      default: 0,
      localhost: 0
    },
    signerAddr: {
      default: 1,
      localhost: 1
    },
    masterAddr: {
      default: 2,
      localhost: 2
    },
    poolAddr: {
      default: 3,
      localhost: 3
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts'
  }
}
